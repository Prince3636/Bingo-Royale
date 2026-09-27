import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandlers } from '../server/sockets/index';
import { ClientToServerEvents, ServerToClientEvents } from '../src/types/game';

interface LoadStageMetrics {
  totalClients: number;
  totalRooms: number;
  successfulConnections: number;
  failedConnections: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  peakHeapMB: number;
  peakRssMB: number;
}

function calculatePercentile(latencies: number[], percentile: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runLoadStage(targetClients: number, serverUrl: string): Promise<LoadStageMetrics> {
  console.log(`\n==================================================`);
  console.log(`>>> EXECUTING LOAD STAGE: ${targetClients} CONCURRENT PLAYERS <<<`);
  console.log(`==================================================`);

  const clients: ClientSocket<ServerToClientEvents, ClientToServerEvents>[] = [];
  const latencies: number[] = [];
  let successfulConnections = 0;
  let failedConnections = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const roomsCreated: string[] = [];

  // Batch connect clients to avoid EMFILE socket exhaustion
  const batchSize = 25;
  for (let i = 0; i < targetClients; i++) {
    const client: ClientSocket<ServerToClientEvents, ClientToServerEvents> = ClientIO(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    client.on('connect', () => {
      successfulConnections++;
    });

    client.on('connect_error', () => {
      failedConnections++;
    });

    client.on('chat-message', () => {
      messagesReceived++;
    });

    client.on('pong', (sentTime) => {
      latencies.push(Date.now() - sentTime);
    });

    clients.push(client);

    if (i % batchSize === 0) {
      await new Promise(r => setTimeout(r, 40));
    }
  }

  // Allow connections to stabilize
  await new Promise(r => setTimeout(r, 1200));

  // Ping batch 1 for baseline latency
  clients.forEach(c => c.emit('ping'));
  await new Promise(r => setTimeout(r, 600));

  // Form multiple rooms (4 clients per room)
  const roomCount = Math.ceil(targetClients / 4);
  console.log(`Forming ~${roomCount} distributed multiplayer game rooms...`);

  for (let r = 0; r < roomCount; r++) {
    const hostIdx = r * 4;
    if (hostIdx < clients.length) {
      const host = clients[hostIdx];
      let roomId = '';

      await new Promise<void>((resolve) => {
        const onRoomUpdate = (state: { roomId: string }) => {
          roomId = state.roomId;
          roomsCreated.push(roomId);
          host.off('room-update', onRoomUpdate);
          resolve();
        };
        host.on('room-update', onRoomUpdate);
        host.emit('create-room', `Player_${hostIdx}`);
      });

      // Join guest players
      for (let j = 1; j < 4; j++) {
        const guestIdx = hostIdx + j;
        if (guestIdx < clients.length && roomId) {
          clients[guestIdx].emit('join-room', roomId, `Player_${guestIdx}`);
        }
      }
    }
  }

  await new Promise(r => setTimeout(r, 800));

  // Simulate active chat events across all rooms
  roomsCreated.forEach((rId, idx) => {
    const sender = clients[idx * 4];
    if (sender && sender.connected) {
      sender.emit('send-message', rId, 'Bingo royale live game!');
      messagesSent++;
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  // Final latency measurement
  clients.forEach(c => c.emit('ping'));
  await new Promise(r => setTimeout(r, 600));

  const avgLatency = latencies.length > 0 
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) 
    : 0;
  const p95Latency = calculatePercentile(latencies, 95);
  const p99Latency = calculatePercentile(latencies, 99);

  const mem = process.memoryUsage();
  const peakHeapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const peakRssMB = Math.round(mem.rss / 1024 / 1024);

  // Disconnect all test sockets cleanly
  clients.forEach(c => c.disconnect());

  const metrics: LoadStageMetrics = {
    totalClients: targetClients,
    totalRooms: roomsCreated.length,
    successfulConnections,
    failedConnections,
    messagesSent,
    messagesReceived,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95Latency,
    p99LatencyMs: p99Latency,
    peakHeapMB,
    peakRssMB
  };

  console.log(`Summary for ${targetClients} Clients:`);
  console.log(`- Connection Success: ${successfulConnections}/${targetClients} (${failedConnections} failed)`);
  console.log(`- Concurrent Rooms Formed: ${roomsCreated.length}`);
  console.log(`- Avg Latency: ${avgLatency} ms | p95: ${p95Latency} ms | p99: ${p99Latency} ms`);
  console.log(`- Memory: Heap ${peakHeapMB} MB | RSS ${peakRssMB} MB`);

  return metrics;
}

async function runHighCapacityLoadTests() {
  console.log('==================================================');
  console.log('HIGH-CAPACITY PRODUCTION STRESS & BENCHMARK SUITE');
  console.log('==================================================');

  const appServer = createServer();
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(appServer, {
    transports: ['websocket']
  });

  const roomManager = await setupSocketHandlers(io);
  await new Promise<void>((resolve) => appServer.listen(0, resolve));

  const address = appServer.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const serverUrl = `http://localhost:${port}`;

  try {
    const results100 = await runLoadStage(100, serverUrl);
    await new Promise(r => setTimeout(r, 1000));

    const results250 = await runLoadStage(250, serverUrl);
    await new Promise(r => setTimeout(r, 1000));

    const results500 = await runLoadStage(500, serverUrl);

    console.log('\n========================================================================================');
    console.log('FINAL BENCHMARK PERFORMANCE MATRIX:');
    console.table([
      { Clients: 100, Rooms: results100.totalRooms, AvgMs: results100.avgLatencyMs, p95Ms: results100.p95LatencyMs, p99Ms: results100.p99LatencyMs, SuccessRate: `${(results100.successfulConnections/100)*100}%`, HeapMB: results100.peakHeapMB, RssMB: results100.peakRssMB },
      { Clients: 250, Rooms: results250.totalRooms, AvgMs: results250.avgLatencyMs, p95Ms: results250.p95LatencyMs, p99Ms: results250.p99LatencyMs, SuccessRate: `${(results250.successfulConnections/250)*100}%`, HeapMB: results250.peakHeapMB, RssMB: results250.peakRssMB },
      { Clients: 500, Rooms: results500.totalRooms, AvgMs: results500.avgLatencyMs, p95Ms: results500.p95LatencyMs, p99Ms: results500.p99LatencyMs, SuccessRate: `${(results500.successfulConnections/500)*100}%`, HeapMB: results500.peakHeapMB, RssMB: results500.peakRssMB },
    ]);
    console.log('========================================================================================\n');

    roomManager.shutdown();
    appServer.close();
    process.exit(0);
  } catch (err) {
    console.error('High-capacity load test failed:', err);
    roomManager.shutdown();
    appServer.close();
    process.exit(1);
  }
}

runHighCapacityLoadTests();
