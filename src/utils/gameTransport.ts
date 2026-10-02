import { io, Socket } from 'socket.io-client';
import {
  GameState,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
  ConnectionStatus,
  SessionInitPayload
} from '../types/game';
import { LocalServer } from './localServer';
import { LocalRoomManager } from './localRoomManager';
import { fastCache } from './cache';

export interface TransportEvents {
  onRoomUpdate: (state: GameState) => void;
  onChatMessage: (message: ChatMessage) => void;
  onSessionInit: (data: SessionInitPayload) => void;
  onPlayerJoined: (data: { player: { id: string; name: string } }) => void;
  onPlayerReconnected: (data: { player: { id: string; name: string } }) => void;
  onRoomKicked: (data: { reason: string }) => void;
  onTurnTimeout: (data: { playerId: string; name: string }) => void;
  onError: (error: string) => void;
  onConnectionChange: (status: ConnectionStatus) => void;
}

export interface IGameTransport {
  readonly mode: 'online' | 'local_host' | 'local_client';
  getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connect(): Promise<void>;
  disconnect(): void;
  createRoom(name: string): void;
  joinRoom(roomId: string, name: string): void;
  reconnectRoom(roomId: string, playerId: string, token: string): void;
  setPlayerReady(ready: boolean): Promise<{ success: boolean; error?: string }>;
  startGame(): Promise<{ success: boolean; error?: string }>;
  setRounds(rounds: number): void;
  markNumber(r: number, c: number): void;
  setBoard(board: number[][]): void;
  sendMessage(text: string): void;
  addBot(): Promise<{ success: boolean; error?: string }>;
  kickPlayer(targetPlayerId: string): Promise<{ success: boolean; error?: string }>;
  leaveRoom(): void;
  resetRoom(): void;
}

/**
 * ONLINE TRANSPORT
 * Preserves 100% existing Socket.IO connection to Render Backend
 */
export class OnlineSocketTransport implements IGameTransport {
  public readonly mode = 'online';
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private serverUrl: string;
  private events: TransportEvents;

  constructor(serverUrl: string, events: TransportEvents) {
    this.serverUrl = serverUrl;
    this.events = events;
  }

  public getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.socket;
  }

  public async connect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
    }

    const newSocket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      autoConnect: true
    });

    this.socket = newSocket;

    newSocket.on('connect', () => {
      this.events.onConnectionChange('connected');
    });

    newSocket.on('connect_error', (err) => {
      this.events.onConnectionChange('connecting');
      this.events.onError(`Server connection error: ${err.message}`);
    });

    newSocket.on('reconnect_attempt', () => {
      this.events.onConnectionChange('reconnecting');
    });

    newSocket.on('disconnect', () => {
      this.events.onConnectionChange('disconnected');
    });

    newSocket.on('session-init', (data) => this.events.onSessionInit(data));
    newSocket.on('room-update', (state) => this.events.onRoomUpdate(state));
    newSocket.on('chat-message', (msg) => this.events.onChatMessage(msg));
    newSocket.on('player:joined', (data) => this.events.onPlayerJoined(data));
    newSocket.on('player:reconnected', (data) => this.events.onPlayerReconnected(data));
    newSocket.on('room:kicked', (data) => this.events.onRoomKicked(data));
    newSocket.on('game:turn-timeout', (data) => this.events.onTurnTimeout(data));
    newSocket.on('error', (msg) => this.events.onError(msg));
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public createRoom(name: string): void {
    this.socket?.emit('create-room', name);
  }

  public joinRoom(roomId: string, name: string): void {
    this.socket?.emit('join-room', roomId, name);
  }

  public reconnectRoom(roomId: string, playerId: string, token: string): void {
    this.socket?.emit('reconnect-room', roomId, playerId, token);
  }

  public setPlayerReady(ready: boolean): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const state = fastCache.get<string>('bingo_room_id') || '';
      this.socket?.emit('player:set-ready', { roomId: state, ready }, (res) => resolve(res || { success: true }));
    });
  }

  public startGame(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomId = fastCache.get<string>('bingo_room_id') || '';
      this.socket?.emit('game:start', roomId, (res) => resolve(res || { success: true }));
    });
  }

  public setRounds(rounds: number): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('set-rounds', roomId, rounds);
  }

  public markNumber(r: number, c: number): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('mark-number', roomId, r, c);
  }

  public setBoard(board: number[][]): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('set-board', roomId, board);
  }

  public sendMessage(text: string): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('send-message', roomId, text);
  }

  public addBot(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomId = fastCache.get<string>('bingo_room_id') || '';
      this.socket?.emit('room:add-bot', roomId, (res) => resolve(res || { success: true }));
    });
  }

  public kickPlayer(targetPlayerId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomId = fastCache.get<string>('bingo_room_id') || '';
      this.socket?.emit('room:kick-player', { roomId, targetPlayerId }, (res) => resolve(res || { success: true }));
    });
  }

  public leaveRoom(): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('leave-room', roomId);
  }

  public resetRoom(): void {
    const roomId = fastCache.get<string>('bingo_room_id') || '';
    this.socket?.emit('reset-room', roomId);
  }
}

/**
 * LOCAL HOST TRANSPORT
 * Authoritative Host running on phone via native LocalServer plugin and localRoomManager
 */
export class LocalHostTransport implements IGameTransport {
  public readonly mode = 'local_host';
  private events: TransportEvents;
  private manager: LocalRoomManager;
  private hostPlayerId: string | null = null;
  private cleanups: Array<() => void> = [];

  constructor(events: TransportEvents) {
    this.events = events;

    this.manager = new LocalRoomManager({
      broadcast: (event, data) => {
        // Broadcast over LAN WebSocket to all connected peers
        LocalServer.broadcast({
          message: JSON.stringify({ event, data })
        }).catch((e) => console.warn('[LocalHost] Broadcast failed:', e));

        // Also notify host's own local listeners
        this.dispatchLocalEvent(event, data);
      },
      sendToClient: (clientId, event, data) => {
        LocalServer.sendToClient({
          clientId,
          message: JSON.stringify({ event, data })
        }).catch((e) => console.warn('[LocalHost] Send to client failed:', e));
      },
      onRoomStateChange: (state) => {
        if (state) {
          LocalServer.updateServerState({
            roomCode: state.roomId,
            players: state.players.length,
            maxPlayers: 5
          }).catch(() => {});
        }
      }
    });
  }

  public getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return null;
  }

  public async connect(): Promise<void> {
    this.events.onConnectionChange('connected');
    this.setupListeners();
  }

  private async setupListeners(): Promise<void> {
    const msgHandle = await LocalServer.addListener('clientMessage', ({ clientId, message }) => {
      try {
        const parsed = JSON.parse(message);
        this.handleClientAction(clientId, parsed.event, parsed.data);
      } catch (err) {
        console.warn('[LocalHost] Error parsing incoming client message:', err);
      }
    });

    const discHandle = await LocalServer.addListener('clientDisconnected', ({ clientId }) => {
      this.manager.handleClientDisconnect(clientId);
    });

    this.cleanups.push(() => msgHandle.remove());
    this.cleanups.push(() => discHandle.remove());
  }

  private handleClientAction(clientId: string, event: string, data: any): void {
    switch (event) {
      case 'join-room':
        this.manager.joinRoom(clientId, data.name, data.playerId, data.reconnectToken);
        break;
      case 'player:set-ready':
        this.manager.setPlayerReady(data.playerId, data.ready);
        break;
      case 'set-board':
        this.manager.setBoard(data.playerId, data.board);
        break;
      case 'mark-number':
        this.manager.markNumber(data.playerId, data.r, data.c);
        break;
      case 'send-message':
        this.manager.sendMessage(data.senderName, data.text);
        break;
      case 'leave-room':
        this.manager.leaveRoom(data.playerId);
        break;
      default:
        console.warn('[LocalHost] Unknown client event:', event);
    }
  }

  private dispatchLocalEvent(event: string, data: any): void {
    switch (event) {
      case 'room-update':
        this.events.onRoomUpdate(data);
        break;
      case 'chat-message':
        this.events.onChatMessage(data);
        break;
      case 'player:joined':
        this.events.onPlayerJoined(data);
        break;
      case 'player:reconnected':
        this.events.onPlayerReconnected(data);
        break;
      case 'room:kicked':
        this.events.onRoomKicked(data);
        break;
      case 'game:turn-timeout':
        this.events.onTurnTimeout(data);
        break;
      case 'error':
        this.events.onError(data);
        break;
    }
  }

  public disconnect(): void {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    this.manager.destroy();
    LocalServer.stopServer().catch(() => {});
    this.events.onConnectionChange('disconnected');
  }

  public createRoom(name: string): void {
    const { room, playerId, token } = this.manager.createRoom(name);
    this.hostPlayerId = playerId;

    // Start native server with roomCode
    LocalServer.startServer({
      port: 8765,
      roomCode: room.roomId,
      hostName: name,
      players: 1,
      maxPlayers: 5
    }).catch((e) => console.warn('[LocalHost] Native server start error:', e));

    this.events.onSessionInit({
      sessionId: 'host_local',
      playerId,
      reconnectToken: token,
      roomId: room.roomId
    });
    this.events.onRoomUpdate(room);
  }

  public joinRoom(): void {}
  public reconnectRoom(): void {}

  public async setPlayerReady(ready: boolean): Promise<{ success: boolean; error?: string }> {
    if (!this.hostPlayerId) return { success: false, error: 'Host not ready' };
    return this.manager.setPlayerReady(this.hostPlayerId, ready);
  }

  public async startGame(): Promise<{ success: boolean; error?: string }> {
    if (!this.hostPlayerId) return { success: false, error: 'Host not ready' };
    return this.manager.startGame(this.hostPlayerId);
  }

  public setRounds(rounds: number): void {
    if (this.hostPlayerId) this.manager.setRounds(this.hostPlayerId, rounds);
  }

  public markNumber(r: number, c: number): void {
    if (this.hostPlayerId) this.manager.markNumber(this.hostPlayerId, r, c);
  }

  public setBoard(board: number[][]): void {
    if (this.hostPlayerId) this.manager.setBoard(this.hostPlayerId, board);
  }

  public sendMessage(text: string): void {
    const state = this.manager.getRoomState();
    const host = state?.players.find((p) => p.isHost);
    this.manager.sendMessage(host?.name || 'Host', text);
  }

  public async addBot(): Promise<{ success: boolean; error?: string }> {
    if (!this.hostPlayerId) return { success: false, error: 'Host not initialized' };
    return this.manager.addBot(this.hostPlayerId);
  }

  public async kickPlayer(targetPlayerId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.hostPlayerId) return { success: false, error: 'Host not initialized' };
    return this.manager.kickPlayer(this.hostPlayerId, targetPlayerId);
  }

  public leaveRoom(): void {
    if (this.hostPlayerId) this.manager.leaveRoom(this.hostPlayerId);
    this.disconnect();
  }

  public resetRoom(): void {
    if (this.hostPlayerId) this.manager.resetRoom(this.hostPlayerId);
  }
}

/**
 * LOCAL CLIENT TRANSPORT
 * Connects over LAN / Hotspot to Host device's native WebSocket server (ws://<host-ip>:8765)
 */
export class LocalClientTransport implements IGameTransport {
  public readonly mode = 'local_client';
  private ws: WebSocket | null = null;
  private hostIp: string;
  private hostPort: number;
  private events: TransportEvents;
  private playerId: string | null = null;
  private reconnectToken: string | null = null;
  private cachedRoomId: string | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private isIntentionallyClosed = false;

  constructor(hostIp: string, hostPort: number = 8765, events: TransportEvents) {
    this.hostIp = hostIp;
    this.hostPort = hostPort;
    this.events = events;
  }

  public getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return null;
  }

  public async connect(): Promise<void> {
    this.isIntentionallyClosed = false;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }

    const wsUrl = `ws://${this.hostIp}:${this.hostPort}`;
    console.log(`[LocalClient] Connecting to host: ${wsUrl}`);
    this.events.onConnectionChange('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[LocalClient] Connected to Local Host successfully');
        this.events.onConnectionChange('connected');

        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }

        // Auto-reconnect if player credentials exist
        if (this.cachedRoomId && this.playerId && this.reconnectToken) {
          this.send('join-room', {
            name: '',
            playerId: this.playerId,
            reconnectToken: this.reconnectToken
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const { event: ev, data } = JSON.parse(event.data);
          this.handleIncoming(ev, data);
        } catch (e) {
          console.warn('[LocalClient] Malformed packet from host:', e);
        }
      };

      this.ws.onerror = () => {
        this.events.onError(`Could not reach Local Host at ${this.hostIp}:${this.hostPort}`);
      };

      this.ws.onclose = () => {
        this.events.onConnectionChange('disconnected');
        if (!this.isIntentionallyClosed) {
          this.events.onError('Host connection closed. Reconnecting...');
          this.scheduleReconnect();
        }
      };
    } catch (err: any) {
      this.events.onConnectionChange('disconnected');
      this.events.onError(`Failed to connect to Local Host: ${err.message}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval || this.isIntentionallyClosed) return;
    this.events.onConnectionChange('reconnecting');
    let attempts = 0;

    this.reconnectInterval = setInterval(() => {
      attempts++;
      if (attempts > 15 || this.isIntentionallyClosed) {
        clearInterval(this.reconnectInterval!);
        this.reconnectInterval = null;
        this.events.onError('Host disconnected. The local game has ended.');
        return;
      }
      this.initWebSocket();
    }, 2500);
  }

  private handleIncoming(event: string, data: any): void {
    switch (event) {
      case 'room-update':
        this.events.onRoomUpdate(data);
        break;
      case 'session-init':
        this.playerId = data.playerId;
        this.reconnectToken = data.reconnectToken;
        this.cachedRoomId = data.roomId;
        this.events.onSessionInit(data);
        break;
      case 'chat-message':
        this.events.onChatMessage(data);
        break;
      case 'player:joined':
        this.events.onPlayerJoined(data);
        break;
      case 'player:reconnected':
        this.events.onPlayerReconnected(data);
        break;
      case 'room:kicked':
        this.events.onRoomKicked(data);
        break;
      case 'game:turn-timeout':
        this.events.onTurnTimeout(data);
        break;
      case 'error':
        this.events.onError(data);
        break;
    }
  }

  private send(event: string, data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.events.onConnectionChange('disconnected');
  }

  public createRoom(): void {}

  public joinRoom(roomId: string, name: string): void {
    this.cachedRoomId = roomId;
    this.send('join-room', { name, roomId });
  }

  public reconnectRoom(roomId: string, playerId: string, token: string): void {
    this.playerId = playerId;
    this.reconnectToken = token;
    this.cachedRoomId = roomId;
    this.send('join-room', { name: '', playerId, reconnectToken: token, roomId });
  }

  public async setPlayerReady(ready: boolean): Promise<{ success: boolean; error?: string }> {
    this.send('player:set-ready', { playerId: this.playerId, ready });
    return { success: true };
  }

  public async startGame(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Only host can start local game' };
  }

  public setRounds(): void {}

  public markNumber(r: number, c: number): void {
    this.send('mark-number', { playerId: this.playerId, r, c });
  }

  public setBoard(board: number[][]): void {
    this.send('set-board', { playerId: this.playerId, board });
  }

  public sendMessage(text: string): void {
    const name = fastCache.get<string>('bingo_player_name') || 'Player';
    this.send('send-message', { senderName: name, text });
  }

  public async addBot(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Only host can add bots' };
  }

  public async kickPlayer(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Only host can kick players' };
  }

  public leaveRoom(): void {
    this.send('leave-room', { playerId: this.playerId });
    this.disconnect();
  }

  public resetRoom(): void {}
}
