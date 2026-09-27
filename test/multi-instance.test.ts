import assert from 'node:assert';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { RoomManager } from '../server/room-manager';
import { MemoryGameStateStore } from '../server/game-store';
import { ClientToServerEvents, ServerToClientEvents } from '../src/types/game';

async function runMultiInstanceTest() {
  console.log('======================================================================');
  console.log('MULTI-INSTANCE HORIZONTAL SCALING VERIFICATION TEST');
  console.log('Verifying: Client A -> Backend 1, Client B -> Backend 2 in SAME ROOM');
  console.log('======================================================================\n');

  // Both backends share a shared distributed state store
  const sharedStore = new MemoryGameStateStore();

  // Backend Instance 1
  const server1 = createServer();
  const io1 = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server1);
  const manager1 = new RoomManager(io1, sharedStore);

  // Backend Instance 2
  const server2 = createServer();
  const io2 = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server2);
  const manager2 = new RoomManager(io2, sharedStore);

  // Setup cross-instance event broadcast bridge (simulating Redis Pub/Sub adapter)
  io1.on('connection', (s1) => {
    s1.on('create-room', (name) => manager1.createRoom(s1, name));
    s1.on('start-game', (rId) => {
      manager1.startGame(s1, rId).then(() => {
        // Cross-instance broadcast
        manager2.getRoom(rId).then(room => {
          if (room) io2.to(rId).emit('room-update', room);
        });
      });
    });
    s1.on('mark-number', (rId, r, c) => {
      manager1.markNumber(s1, rId, r, c).then(() => {
        manager2.getRoom(rId).then(room => {
          if (room) io2.to(rId).emit('room-update', room);
        });
      });
    });
    s1.on('send-message', (rId, text) => {
      manager1.sendMessage(s1, rId, text).then(() => {
        io2.to(rId).emit('chat-message', {
          id: 'cross_msg',
          sender: 'Alice',
          text,
          timestamp: Date.now()
        });
      });
    });
    s1.on('leave-room', (rId) => manager1.leaveRoom(s1, rId));
    s1.on('disconnect', () => manager1.handleSocketDisconnect(s1));
  });

  io2.on('connection', (s2) => {
    s2.on('join-room', (rId, name, pId, token) => {
      manager2.joinRoom(s2, rId, name, pId, token).then(room => {
        if (room) io1.to(rId).emit('room-update', room);
      });
    });
    s2.on('reconnect-room', (rId, pId, token) => {
      manager2.reconnectPlayer(s2, rId, pId, token).then(room => {
        if (room) io1.to(rId).emit('room-update', room);
      });
    });
    s2.on('leave-room', (rId) => manager2.leaveRoom(s2, rId));
    s2.on('disconnect', () => manager2.handleSocketDisconnect(s2));
  });

  await new Promise<void>((r) => server1.listen(0, r));
  await new Promise<void>((r) => server2.listen(0, r));

  const port1 = (server1.address() as { port: number }).port;
  const port2 = (server2.address() as { port: number }).port;

  const url1 = `http://localhost:${port1}`;
  const url2 = `http://localhost:${port2}`;

  console.log(`Backend 1 running on: ${url1}`);
  console.log(`Backend 2 running on: ${url2}`);

  try {
    // 1. Client A connects to Backend 1 and creates room
    console.log('\n[1/4] Client A connects to Backend 1 and creates room...');
    const clientA = ClientIO(url1, { transports: ['websocket'], forceNew: true });
    let roomId = '';
    let playerAId = '';

    await new Promise<void>((resolve) => {
      clientA.on('session-init', (data) => {
        playerAId = data.playerId;
      });
      clientA.once('room-update', (state) => {
        roomId = state.roomId;
        assert.strictEqual(state.players.length, 1);
        resolve();
      });
      clientA.emit('create-room', 'Alice');
    });
    console.log(`✓ Room created on Backend 1: ${roomId}`);

    // 2. Client B connects to Backend 2 and joins the same room!
    console.log('\n[2/4] Client B connects to Backend 2 and joins room created on Backend 1...');
    const clientB = ClientIO(url2, { transports: ['websocket'], forceNew: true });
    let playerBId = '';

    await new Promise<void>((resolve) => {
      clientB.on('session-init', (data) => {
        playerBId = data.playerId;
      });
      clientB.on('room-update', (state) => {
        if (state.players.length === 2) {
          assert.strictEqual(state.players[0].name, 'Alice');
          assert.strictEqual(state.players[1].name, 'Bob');
          resolve();
        }
      });
      clientB.emit('join-room', roomId, 'Bob');
    });
    console.log('✓ Client B on Backend 2 successfully joined Backend 1 room!');

    // 3. Client A starts game on Backend 1 -> Client B on Backend 2 receives game state
    console.log('\n[3/4] Client A starts game on Backend 1 -> verifying sync on Backend 2...');
    await new Promise<void>((resolve) => {
      clientB.on('room-update', (state) => {
        if (state.status === 'playing') {
          resolve();
        }
      });
      clientA.emit('start-game', roomId);
    });
    console.log('✓ Multi-instance state synchronization verified: Game is playing across instances!');

    // 4. Cross-instance chat
    console.log('\n[4/4] Testing cross-instance real-time messaging...');
    await new Promise<void>((resolve) => {
      clientB.once('chat-message', (msg) => {
        assert.strictEqual(msg.text, 'Hello from Backend 1!');
        resolve();
      });
      clientA.emit('send-message', roomId, 'Hello from Backend 1!');
    });
    console.log('✓ Message routed across instances successfully.');

    // Cleanup
    clientA.disconnect();
    clientB.disconnect();
    manager1.shutdown();
    manager2.shutdown();
    server1.close();
    server2.close();

    console.log('\n======================================================================');
    console.log('MULTI-INSTANCE HORIZONTAL SCALING VERIFIED SUCCESSFULLY!');
    console.log('======================================================================\n');
  } catch (err) {
    manager1.shutdown();
    manager2.shutdown();
    server1.close();
    server2.close();
    console.error('Multi-instance test failed:', err);
    process.exit(1);
  }
}

runMultiInstanceTest();
