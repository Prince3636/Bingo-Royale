import assert from 'node:assert';
import { LocalRoomManager } from '../src/utils/localRoomManager';
import { GameState } from '../src/types/game';

async function runLocalMultiplayerTests() {
  console.log('==================================================');
  console.log('BINGO ROYALE LOCAL / LAN MULTIPLAYER TEST SUITE');
  console.log('==================================================\n');

  let broadcastEvents: Array<{ event: string; data: any }> = [];
  let clientEvents: Array<{ clientId: string; event: string; data: any }> = [];
  let lastState: GameState | null = null;

  const manager = new LocalRoomManager({
    broadcast: (event, data) => {
      broadcastEvents.push({ event, data });
      if (event === 'room-update') {
        lastState = data;
      }
    },
    sendToClient: (clientId, event, data) => {
      clientEvents.push({ clientId, event, data });
    },
    onRoomStateChange: (state) => {
      lastState = state;
    }
  });

  // 1. Host creates local room
  console.log('[1/7] Testing Host creation of local room...');
  const { room, playerId: hostId, token: hostToken } = manager.createRoom('PrinceHost');
  assert(room.roomId.startsWith('LOCAL_'), 'Room ID should start with LOCAL_');
  assert.strictEqual(room.players.length, 1, 'Should have 1 player (Host)');
  assert.strictEqual(room.players[0].name, 'PrinceHost');
  assert.strictEqual(room.players[0].isHost, true);
  console.log('✓ Host created room:', room.roomId);

  // 2. Client joins local room
  console.log('[2/7] Testing Client joining local room over LAN...');
  const joinResult = manager.joinRoom('client_phone_b', 'RajPlayer');
  assert(joinResult.success, 'Join room should succeed');
  assert(joinResult.playerId, 'Player ID must be generated');
  assert.strictEqual(lastState?.players.length, 2, 'Room should now have 2 players');
  assert.strictEqual(lastState?.players[1].name, 'RajPlayer');
  assert.strictEqual(lastState?.players[1].ready, false, 'Non-host starts unready');
  console.log('✓ Client joined successfully as player 2');

  // 3. Client sets ready
  console.log('[3/7] Testing Player ready check...');
  const clientPlayerId = joinResult.playerId!;
  const readyResult = manager.setPlayerReady(clientPlayerId, true);
  assert(readyResult.success, 'setPlayerReady should succeed');
  assert.strictEqual(lastState?.players[1].ready, true, 'Player 2 must be ready');
  console.log('✓ Player 2 ready state synchronized');

  // 4. Host starts game
  console.log('[4/7] Testing Host starts game...');
  const startResult = manager.startGame(hostId);
  assert(startResult.success, 'Host should be able to start game');
  assert.strictEqual(lastState?.status, 'playing', 'Game status must be playing');
  assert(lastState?.currentTurn, 'currentTurn must be assigned');
  console.log('✓ Game started with active turn:', lastState?.currentTurn);

  // 5. Number calling & Bingo checks
  console.log('[5/7] Testing number marking and turn progression...');
  const activePlayer = lastState!.players.find(p => p.id === lastState!.currentTurn)!;
  const numToCall = activePlayer.board[0][0];

  const markResult = manager.markNumber(activePlayer.id, 0, 0);
  assert(markResult.success, 'Valid move on turn must succeed');
  assert(lastState?.drawnNumbers.includes(numToCall), 'Drawn numbers must include called number');
  console.log('✓ Number', numToCall, 'called and marked across players');

  // 6. Chat messaging
  console.log('[6/7] Testing Local chat messaging...');
  manager.sendMessage('PrinceHost', 'GG and good luck!');
  const lastChat = broadcastEvents.find(e => e.event === 'chat-message');
  assert(lastChat, 'Chat message should have been broadcast');
  assert.strictEqual(lastChat.data.text, 'GG and good luck!');
  console.log('✓ Local chat broadcast verified');

  // 7. Client disconnect and leave
  console.log('[7/7] Testing Client disconnect & Host cleanup...');
  manager.handleClientDisconnect('client_phone_b');
  assert.strictEqual(lastState?.players[1].connected, false, 'Client should be marked disconnected');

  manager.leaveRoom(hostId);
  assert.strictEqual(manager.getRoomState(), null, 'Room should be destroyed when Host leaves');
  console.log('✓ Disconnect and cleanup verified');

  console.log('\n==================================================');
  console.log('ALL 7/7 LOCAL MULTIPLAYER TESTS PASSED!');
  console.log('==================================================');
}

runLocalMultiplayerTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
