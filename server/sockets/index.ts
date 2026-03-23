
import { Server, Socket } from 'socket.io';
import { GameState, Player, ChatMessage } from '../../src/types/game';
import { generateBingoBoard, checkBingo } from '../../src/utils/bingo';

// Simple ID generator to avoid nanoid ESM issues in some environments
const generateId = (length: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const rooms: Record<string, GameState> = {};

export const setupSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', (name: string) => {
      console.log(`Event: create-room from ${socket.id} (name: ${name})`);
      const roomId = generateId(6);
      console.log(`Created Room ID: ${roomId}`);
      const host: Player = {
        id: socket.id,
        name,
        isHost: true,
        isBot: false,
        board: generateBingoBoard(),
        marked: Array(5).fill(null).map(() => Array(5).fill(false)),
        completedLines: 0,
        score: 0
      };
      // Free space is marked
      host.marked[2][2] = true;

      rooms[roomId] = {
        roomId,
        players: [host],
        drawnNumbers: [],
        currentTurn: socket.id,
        status: 'waiting',
        winner: null,
        currentRound: 1,
        targetRounds: 1,
        overallWinner: null
      };

      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      socket.emit('room-update', rooms[roomId]);
    });

    socket.on('join-room', (roomId: string, name: string) => {
      const cleanRoomId = roomId.trim().toUpperCase();
      console.log(`Join attempt: Room ${cleanRoomId} by ${name}`);
      const room = rooms[cleanRoomId];
      if (!room) {
        console.log(`Room ${cleanRoomId} not found. Available:`, Object.keys(rooms));
        return socket.emit('error', 'Room not found');
      }
      if (room.players.length >= 5) {
        console.log(`Room ${cleanRoomId} is full`);
        return socket.emit('error', 'Room is full');
      }
      if (room.status !== 'waiting') {
        console.log(`Room ${cleanRoomId} game already in progress`);
        return socket.emit('error', 'Game already in progress');
      }

      const player: Player = {
        id: socket.id,
        name,
        isHost: false,
        isBot: false,
        board: generateBingoBoard(),
        marked: Array(5).fill(null).map(() => Array(5).fill(false)),
        completedLines: 0,
        score: 0
      };
      player.marked[2][2] = true;

      room.players.push(player);
      socket.join(cleanRoomId);
      console.log(`Socket ${socket.id} joined room ${cleanRoomId}`);
      io.to(cleanRoomId).emit('room-update', room);
    });

    socket.on('set-rounds', (roomId: string, rounds: number) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'waiting') return;
      
      const requester = room.players.find(p => p.id === socket.id);
      if (!requester || !requester.isHost) return;

      room.targetRounds = rounds;
      io.to(roomId).emit('room-update', room);
    });

    socket.on('start-game', (roomId: string) => {
      const room = rooms[roomId];
      if (!room) return;
      
      const requester = room.players.find(p => p.id === socket.id);
      if (!requester || !requester.isHost) {
        console.log('Start game failed: Not host');
        return;
      }

      room.status = 'playing';
      room.drawnNumbers = [];
      io.to(roomId).emit('room-update', room);
    });

    socket.on('mark-number', (roomId: string, r: number, c: number) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const num = player.board[r][c];
      const isMyTurn = room.currentTurn === socket.id;

      if (isMyTurn) {
        // Calling a new number
        if (!room.drawnNumbers.includes(num)) {
          room.drawnNumbers.push(num);
          
          // Mark this number for EVERYONE who has it
          room.players.forEach(p => {
            for (let row = 0; row < 5; row++) {
              for (let col = 0; col < 5; col++) {
                if (p.board[row][col] === num) {
                  p.marked[row][col] = true;
                }
              }
            }
            p.completedLines = checkBingo(p.marked);
            if (p.completedLines >= 5 && !room.winner) {
              handleWinner(io, roomId, p);
            }
          });

          // Change turn
          const currentIndex = room.players.findIndex(p => p.id === room.currentTurn);
          const nextIndex = (currentIndex + 1) % room.players.length;
          room.currentTurn = room.players[nextIndex].id;

          io.to(roomId).emit('room-update', room);

          // If next player is a bot, trigger bot action
          if (room.players[nextIndex].isBot && room.status === 'playing' && !room.winner) {
            setTimeout(() => {
              triggerBotTurn(io, roomId);
            }, 2000);
          }
        } else if (!player.marked[r][c]) {
          // Just marking an already drawn number on my turn
          player.marked[r][c] = true;
          player.completedLines = checkBingo(player.marked);
          if (player.completedLines >= 5 && !room.winner) {
            handleWinner(io, roomId, player);
          }
          io.to(roomId).emit('room-update', room);
        }
      } else {
        // Not my turn, can only mark if already drawn
        if (room.drawnNumbers.includes(num) && !player.marked[r][c]) {
          player.marked[r][c] = true;
          player.completedLines = checkBingo(player.marked);
          if (player.completedLines >= 5 && !room.winner) {
            handleWinner(io, roomId, player);
          }
          io.to(roomId).emit('room-update', room);
        }
      }
    });

    socket.on('set-board', (roomId: string, board: number[][]) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'waiting') return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      player.board = board;
      io.to(roomId).emit('room-update', room);
    });

    socket.on('send-message', (roomId: string, text: string) => {
      const room = rooms[roomId];
      if (!room) return;
      
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const message: ChatMessage = {
        id: generateId(10),
        sender: player.name,
        text,
        timestamp: Date.now()
      };

      io.to(roomId).emit('chat-message', message);
    });

    socket.on('add-bot', (roomId: string) => {
      const room = rooms[roomId];
      if (!room) return;
      
      const requester = room.players.find(p => p.id === socket.id);
      if (!requester || !requester.isHost || room.players.length >= 5) {
        console.log('Add bot failed: Not host or room full');
        return;
      }

      const bot: Player = {
        id: `bot-${generateId(4)}`,
        name: `Bot ${room.players.length}`,
        isHost: false,
        isBot: true,
        board: generateBingoBoard(),
        marked: Array(5).fill(null).map(() => Array(5).fill(false)),
        completedLines: 0,
        score: 0
      };
      bot.marked[2][2] = true;

      room.players.push(bot);
      io.to(roomId).emit('room-update', room);
    });

    socket.on('remove-player', (roomId: string, playerId: string) => {
      const room = rooms[roomId];
      if (!room) return;

      const requester = room.players.find(p => p.id === socket.id);
      if (!requester || !requester.isHost) return;

      const playerIndex = room.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        const playerToRemove = room.players[playerIndex];
        if (playerToRemove.isHost) return; // Cannot remove host

        room.players.splice(playerIndex, 1);
        
        // If it was a human player, they might need to be notified or disconnected from room
        // For now, room-update will reflect they are gone.
        // If they are still connected, they'll see they are no longer in the room state.
        
        if (room.currentTurn === playerId) {
          const nextIndex = playerIndex % room.players.length;
          room.currentTurn = room.players[nextIndex].id;
        }

        io.to(roomId).emit('room-update', room);
      }
    });

    socket.on('leave-room', (roomId: string) => {
      handleDisconnect(socket, io);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
};

const handleWinner = (io: Server, roomId: string, player: Player) => {
  const room = rooms[roomId];
  if (!room || room.winner) return;

  player.score++;
  room.winner = player;
  
  if (room.currentRound < room.targetRounds) {
    setTimeout(() => {
      startNextRound(io, roomId);
    }, 5000);
  } else {
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    room.overallWinner = sorted[0];
    room.status = 'finished';
  }
};

const triggerBotTurn = (io: Server, roomId: string) => {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing' || room.winner) return;

  const currentPlayer = room.players.find(p => p.id === room.currentTurn);
  if (!currentPlayer || !currentPlayer.isBot) return;

  // Bot picks a number from its board that isn't marked yet
  const unmarkedCells: {r: number, c: number}[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!currentPlayer.marked[r][c]) {
        unmarkedCells.push({r, c});
      }
    }
  }

  if (unmarkedCells.length === 0) return;

  const randomCell = unmarkedCells[Math.floor(Math.random() * unmarkedCells.length)];
  const nextNum = currentPlayer.board[randomCell.r][randomCell.c];

  if (!room.drawnNumbers.includes(nextNum)) {
    room.drawnNumbers.push(nextNum);
    
    // Mark for EVERYONE
    room.players.forEach(p => {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          if (p.board[row][col] === nextNum) {
            p.marked[row][col] = true;
          }
        }
      }
      p.completedLines = checkBingo(p.marked);
      if (p.completedLines >= 5 && !room.winner) {
        handleWinner(io, roomId, p);
      }
    });
  }
  
  const currentIndex = room.players.findIndex(p => p.id === room.currentTurn);
  const nextIndex = (currentIndex + 1) % room.players.length;
  room.currentTurn = room.players[nextIndex].id;

  io.to(roomId).emit('room-update', room);

  if (room.players[nextIndex].isBot && room.status === 'playing' && !room.winner) {
    setTimeout(() => triggerBotTurn(io, roomId), 2000);
  }
};

const startNextRound = (io: Server, roomId: string) => {
  const room = rooms[roomId];
  if (!room) return;

  room.currentRound++;
  room.winner = null;
  room.drawnNumbers = [];
  
  room.players.forEach(p => {
    p.board = generateBingoBoard();
    p.marked = Array(5).fill(null).map(() => Array(5).fill(false));
    p.marked[2][2] = true;
    p.completedLines = 0;
  });

  // Randomize turn for new round
  const randomIndex = Math.floor(Math.random() * room.players.length);
  room.currentTurn = room.players[randomIndex].id;

  io.to(roomId).emit('room-update', room);

  // If new turn is bot
  if (room.players[randomIndex].isBot) {
    setTimeout(() => triggerBotTurn(io, roomId), 2000);
  }
};

const handleDisconnect = (socket: Socket, io: Server) => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== -1) {
      const isHost = room.players[playerIndex].isHost;
      room.players.splice(playerIndex, 1);
      
      if (room.players.length === 0 || room.players.every(p => p.isBot)) {
        delete rooms[roomId];
      } else {
        if (isHost) {
          // Transfer host to first human player
          const firstHuman = room.players.find(p => !p.isBot);
          if (firstHuman) firstHuman.isHost = true;
        }
        if (room.currentTurn === socket.id) {
           const nextIndex = playerIndex % room.players.length;
           room.currentTurn = room.players[nextIndex].id;
        }
        io.to(roomId).emit('room-update', room);
      }
      break;
    }
  }
};
