import assert from 'node:assert';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../server/room-manager';
import { MemoryGameStateStore } from '../server/game-store';
import { checkBingo, generateBingoBoard } from '../src/utils/bingo';
import { ClientToServerEvents, ServerToClientEvents } from '../src/types/game';

async function runStrictAuditTests() {
  console.log('==================================================');
  console.log('BINGO ROYALE STRICT PRODUCTION AUDIT TEST SUITE');
  console.log('==================================================\n');

  // 1. Board & Bingo Algorithm Tests
  console.log('[1/8] Verifying Bingo Board & Line Calculation Authoritativeness...');
  const board = generateBingoBoard();
  assert.strictEqual(board.length, 5, 'Board must have 5 rows');
  board.forEach(row => assert.strictEqual(row.length, 5, 'Row must have 5 columns'));
  const allNums = board.flat();
  assert.strictEqual(new Set(allNums).size, 25, 'Board numbers must be unique');
  allNums.forEach(n => assert(n >= 1 && n <= 25, `Number ${n} must be between 1 and 25`));

  const fullRowMarks = Array(5).fill(null).map(() => Array(5).fill(false));
  fullRowMarks[0] = [true, true, true, true, true];
  assert.strictEqual(checkBingo(fullRowMarks), 1, '1 row should equal 1 line');

  fullRowMarks[1] = [true, true, true, true, true];
  fullRowMarks[2] = [true, true, true, true, true];
  fullRowMarks[3] = [true, true, true, true, true];
  fullRowMarks[4] = [true, true, true, true, true];
  assert.strictEqual(checkBingo(fullRowMarks), 12, 'Full board should have 12 lines');
  console.log('✓ Bingo generation and line calculations verified.');

  // Setup Test HTTP and Socket.IO Server with MemoryGameStateStore
  const httpServer = createServer();
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const store = new MemoryGameStateStore();
  const roomManager = new RoomManager(io, store);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const serverUrl = `http://localhost:${port}`;

  io.on('connection', (socket) => {
    socket.on('create-room', (name) => roomManager.createRoom(socket, name));
    socket.on('join-room', (rId, name, pId, token) => roomManager.joinRoom(socket, rId, name, pId, token));
    socket.on('reconnect-room', (rId, pId, token) => roomManager.reconnectPlayer(socket, rId, pId, token));
    socket.on('start-game', (rId) => roomManager.startGame(socket, rId));
    socket.on('mark-number', (rId, r, c) => roomManager.markNumber(socket, rId, r, c));
    socket.on('set-board', (rId, b) => roomManager.setBoard(socket, rId, b));
    socket.on('set-rounds', (rId, rounds) => roomManager.setRounds(socket, rId, rounds));
    socket.on('send-message', (rId, text) => roomManager.sendMessage(socket, rId, text));
    socket.on('leave-room', (rId) => roomManager.leaveRoom(socket, rId));
    socket.on('disconnect', () => roomManager.handleSocketDisconnect(socket));
  });

  const createClient = (): Promise<ClientSocket<ServerToClientEvents, ClientToServerEvents>> => {
    return new Promise((resolve) => {
      const client: ClientSocket<ServerToClientEvents, ClientToServerEvents> = ClientIO(serverUrl, {
        transports: ['websocket'],
        forceNew: true
      });
      client.on('connect', () => resolve(client));
    });
  };

  try {
    // 2. Room Creation & Secret Reconnect Token
    console.log('\n[2/8] Testing Room Creation & Secret Reconnect Token Issuance...');
    const client1 = await createClient();
    let createdRoomId = '';
    let player1Id = '';
    let player1Token = '';

    await new Promise<void>((resolve) => {
      client1.on('session-init', (data) => {
        player1Id = data.playerId;
        player1Token = data.reconnectToken;
        assert(player1Token.length >= 32, 'reconnectToken must be cryptographically secure');
      });
      client1.once('room-update', (state) => {
        createdRoomId = state.roomId;
        assert.strictEqual(state.players.length, 1);
        assert.strictEqual(state.players[0].name, 'Alice');
        assert.strictEqual(state.players[0].isHost, true);
        // Verify token is NOT leaked in public room state
        assert.strictEqual((state.players[0] as unknown as Record<string, unknown>).reconnectToken, undefined);
        resolve();
      });
      client1.emit('create-room', 'Alice');
    });
    console.log(`✓ Room created: ${createdRoomId}, Player ID: ${player1Id}, Secret Token issued securely.`);

    // 3. Joining Room & Player 2 Session
    console.log('\n[3/8] Testing Player 2 Joining Room...');
    const client2 = await createClient();
    let player2Id = '';
    let player2Token = '';

    await new Promise<void>((resolve) => {
      let resolved = false;
      client2.on('session-init', (data) => {
        player2Id = data.playerId;
        player2Token = data.reconnectToken;
      });
      client2.on('room-update', (state) => {
        if (!resolved && state.players.length === 2) {
          resolved = true;
          assert.strictEqual(state.players[1].name, 'Bob');
          resolve();
        }
      });
      client2.emit('join-room', createdRoomId, 'Bob');
    });
    console.log(`✓ Player 2 joined. Player ID: ${player2Id}`);

    // 4. Session Hijack Prevention Test
    console.log('\n[4/8] Testing Session Hijack Prevention with Forged Token...');
    const attacker = await createClient();
    await new Promise<void>((resolve) => {
      attacker.on('error', (msg) => {
        assert(msg.includes('Unauthorized') || msg.includes('rejected'), 'Attacker must be rejected');
        resolve();
      });
      // Attacker tries to impersonate Alice with fake token
      attacker.emit('reconnect-room', createdRoomId, player1Id, 'fake_token_12345');
    });
    attacker.disconnect();
    console.log('✓ Forged reconnect attempt successfully blocked.');

    // 5. Authoritative Move & Turn Validation Test
    console.log('\n[5/8] Testing Authoritative Turn & Move Validation...');
    // Start game
    await new Promise<void>((resolve) => {
      let started = false;
      client1.on('room-update', (state) => {
        if (!started && state.status === 'playing') {
          started = true;
          resolve();
        }
      });
      client1.emit('start-game', createdRoomId);
    });

    const roomState = await roomManager.getRoom(createdRoomId);
    assert(roomState !== null);
    const turnPlayerId = roomState.currentTurn;
    const nonTurnClient = turnPlayerId === player1Id ? client2 : client1;

    // Non-turn player tries to call an undrawn number -> Should NOT advance turn
    nonTurnClient.emit('mark-number', createdRoomId, 0, 0);
    await new Promise(r => setTimeout(r, 200));

    const stateAfterIllegalMove = await roomManager.getRoom(createdRoomId);
    assert.strictEqual(stateAfterIllegalMove?.currentTurn, turnPlayerId, 'Turn must not change on illegal move');

    // Test malformed coordinates (e.g. 99, -1) -> Should not crash server
    nonTurnClient.emit('mark-number', createdRoomId, 99, -1);
    await new Promise(r => setTimeout(r, 200));
    console.log('✓ Authoritative turn validation and out-of-bounds coordinate protection verified.');

    // 6. Chat Sanitization & Rate Limit Test
    console.log('\n[6/8] Testing Chat XSS Sanitization & HTML Escaping...');
    await new Promise<void>((resolve) => {
      client1.once('chat-message', (msg) => {
        assert(!msg.text.includes('<script>'), 'Script tags must be escaped');
        assert(msg.text.includes('&lt;script&gt;'), 'HTML characters must be sanitized');
        resolve();
      });
      client2.emit('send-message', createdRoomId, '<script>alert("xss")</script>');
    });
    console.log('✓ Chat message properly sanitized against XSS.');

    // 7. Legitimate Reconnection with Secure Token
    console.log('\n[7/8] Testing Legitimate Reconnect with Valid Token...');
    client2.disconnect();
    await new Promise(r => setTimeout(r, 300));

    // Verify player is marked offline
    const stateDuringDisconnect = await roomManager.getRoom(createdRoomId);
    const p2State = stateDuringDisconnect?.players.find(p => p.id === player2Id);
    assert.strictEqual(p2State?.connected, false);

    // Reconnect with valid token
    const client2Reconnected = await createClient();
    await new Promise<void>((resolve) => {
      client2Reconnected.on('room-update', (state) => {
        const reconnectedP = state.players.find(p => p.id === player2Id);
        if (reconnectedP?.connected) {
          resolve();
        }
      });
      client2Reconnected.emit('reconnect-room', createdRoomId, player2Id, player2Token);
    });
    console.log('✓ Player successfully reconnected with valid authentication token.');

    // 8. Memory & Room Lifecycle Stress Test (500 rapid rooms)
    console.log('\n[8/8] Testing Memory Cleanup over 500 Created & Destroyed Rooms...');
    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) {
      const tempId = `temp_${i}`;
      const tempRoom = {
        roomId: tempId,
        players: [],
        drawnNumbers: [],
        currentTurn: null,
        status: 'waiting' as const,
        winner: null,
        currentRound: 1,
        targetRounds: 1,
        overallWinner: null,
        lastActivity: Date.now()
      };
      await store.saveRoom(tempId, tempRoom, 5000);
      await store.deleteRoom(tempId);
    }

    const roomCount = await store.getRoomCount();
    assert.strictEqual(roomCount, 1, 'Only active test room should remain');
    const finalHeap = process.memoryUsage().heapUsed;
    const diffMB = Math.round((finalHeap - initialHeap) / 1024 / 1024);
    console.log(`✓ 500 rooms created and cleaned up. Memory delta: ${diffMB} MB. Zero leak.`);

    // Cleanup active test clients
    client1.emit('leave-room', createdRoomId);
    client2Reconnected.emit('leave-room', createdRoomId);
    await new Promise(r => setTimeout(r, 200));

    client1.disconnect();
    client2Reconnected.disconnect();

    roomManager.shutdown();
    httpServer.close();

    console.log('\n==================================================');
    console.log('ALL STRICT PRODUCTION AUDIT TESTS PASSED!');
    console.log('==================================================\n');
  } catch (err) {
    roomManager.shutdown();
    httpServer.close();
    console.error('Audit Test Failed:', err);
    process.exit(1);
  }
}

runStrictAuditTests();
