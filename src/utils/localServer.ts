import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { isNative } from './mobile';

export interface DiscoveredHost {
  ip: string;
  port: number;
  roomCode: string;
  hostName: string;
  players: number;
  maxPlayers: number;
}

export interface ClientConnectionInfo {
  clientId: string;
  ip: string;
}

export interface ClientMessageInfo {
  clientId: string;
  message: string;
}

export interface BingoLocalServerPluginInterface {
  getLocalIp(): Promise<{ ip: string; isHotspot: boolean }>;
  startServer(options: { port?: number; roomCode?: string; hostName?: string; players?: number; maxPlayers?: number }): Promise<{ success: boolean; ip: string; port: number; roomCode: string }>;
  updateServerState(options: { roomCode?: string; players?: number; maxPlayers?: number }): Promise<{ success: boolean }>;
  stopServer(): Promise<{ success: boolean }>;
  broadcast(options: { message: string }): Promise<{ success: boolean }>;
  sendToClient(options: { clientId: string; message: string }): Promise<{ success: boolean }>;
  disconnectClient(options: { clientId: string }): Promise<{ success: boolean }>;
  startDiscovery(): Promise<{ success: boolean }>;
  stopDiscovery(): Promise<{ success: boolean }>;
  addListener(eventName: 'clientConnected', listenerFunc: (info: ClientConnectionInfo) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'clientDisconnected', listenerFunc: (info: { clientId: string; code?: number; reason?: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'clientMessage', listenerFunc: (info: ClientMessageInfo) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'hostDiscovered', listenerFunc: (host: DiscoveredHost) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// Fallback implementation for Desktop Browsers / DEV
class WebLocalServerFallback implements BingoLocalServerPluginInterface {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private mockPort = 8765;
  private mockIp = '127.0.0.1';

  async getLocalIp(): Promise<{ ip: string; isHotspot: boolean }> {
    return { ip: this.mockIp, isHotspot: false };
  }

  async startServer(options: { port?: number; roomCode?: string; hostName?: string }): Promise<{ success: boolean; ip: string; port: number; roomCode: string }> {
    console.log('[WebLocalServer] Mock server started for dev testing:', options);
    return {
      success: true,
      ip: this.mockIp,
      port: options.port || this.mockPort,
      roomCode: options.roomCode || 'LOCAL1'
    };
  }

  async updateServerState(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async stopServer(): Promise<{ success: boolean }> {
    console.log('[WebLocalServer] Mock server stopped');
    return { success: true };
  }

  async broadcast(options: { message: string }): Promise<{ success: boolean }> {
    console.log('[WebLocalServer] Mock broadcast:', options.message.slice(0, 80));
    return { success: true };
  }

  async sendToClient(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async disconnectClient(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async startDiscovery(): Promise<{ success: boolean }> {
    console.log('[WebLocalServer] Mock discovery started');
    // Emulate discovering a local host in dev mode
    setTimeout(() => {
      const handlers = this.listeners.get('hostDiscovered') || [];
      handlers.forEach(h => h({
        ip: '127.0.0.1',
        port: 8765,
        roomCode: 'LOCAL1',
        hostName: 'DevHost',
        players: 1,
        maxPlayers: 5
      }));
    }, 1200);
    return { success: true };
  }

  async stopDiscovery(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async addListener(eventName: string, listenerFunc: (...args: any[]) => void): Promise<PluginListenerHandle> {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)!.push(listenerFunc);

    return {
      remove: async () => {
        const arr = this.listeners.get(eventName) || [];
        const idx = arr.indexOf(listenerFunc);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  async removeAllListeners(): Promise<void> {
    this.listeners.clear();
  }
}

export const LocalServer = registerPlugin<BingoLocalServerPluginInterface>('BingoLocalServer', {
  web: () => new WebLocalServerFallback()
});
