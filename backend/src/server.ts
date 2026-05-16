import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { RoomManager } from './managers/RoomManager';
import { GameManager } from './managers/GameManager';
import { withRateLimit, validateUsername, filterProfanity } from './middleware/rateLimiter';
import { logger } from './utils/logger';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  CreateRoomData,
  JoinRoomData,
} from './types';

// ── App Setup ──────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const PORT = Number(process.env.PORT ?? 3001);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ── Socket.IO ──────────────────────────────────────────────────────────────────

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
  pingTimeout: 20_000,
  pingInterval: 5_000,
  transports: ['websocket', 'polling'],
  connectionStateRecovery: {
    maxDisconnectionDuration: 30_000,
    skipMiddlewares: true,
  },
});

// ── Managers ───────────────────────────────────────────────────────────────────

const roomManager = new RoomManager();
const gameManager = new GameManager(io, roomManager);

// ── REST Endpoints ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), players: 0 });
});

app.get('/api/rooms/public', (_req, res) => {
  const rooms = roomManager.getPublicRooms().map((r) => ({
    code: r.code,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    status: r.status,
  }));
  res.json({ rooms });
});

// ── Socket Events ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // ── Lobby: Create ────────────────────────────────────────────────────────

  socket.on('lobby:create', (data: CreateRoomData, callback) => {
    withRateLimit(socket, 'lobby:create', () => {
      const usernameCheck = validateUsername(data.username ?? '');
      if (!usernameCheck.valid) {
        callback({ success: false, error: usernameCheck.reason! });
        return;
      }

      const result = roomManager.createRoom(socket.id, {
        username: data.username.trim(),
        avatar: data.avatar ?? '🎮',
        color: data.color ?? '#7C3AED',
      }, data.config);

      socket.join(result.room.id);
      socket.data.roomId = result.room.id;
      socket.data.playerId = result.playerId;

      callback({ success: true, data: { room: result.room, playerId: result.playerId } });
      logger.info(`Room created: code=${result.room.code} by ${data.username}`);
    });
  });

  // ── Lobby: Join ──────────────────────────────────────────────────────────

  socket.on('lobby:join', (data: JoinRoomData, callback) => {
    withRateLimit(socket, 'lobby:join', () => {
      const usernameCheck = validateUsername(data.username ?? '');
      if (!usernameCheck.valid) {
        callback({ success: false, error: usernameCheck.reason! });
        return;
      }

      const result = roomManager.joinRoom(
        (data.code ?? '').trim().toUpperCase(),
        socket.id,
        {
          username: data.username.trim(),
          avatar: data.avatar ?? '🎮',
          color: data.color ?? '#06B6D4',
        }
      );

      if ('error' in result) {
        callback({ success: false, error: result.error });
        return;
      }

      socket.join(result.room.id);
      socket.data.roomId = result.room.id;
      socket.data.playerId = result.playerId;

      // Notify existing players
      socket.to(result.room.id).emit('lobby:updated', result.room);

      callback({ success: true, data: { room: result.room, playerId: result.playerId } });
    });
  });

  // ── Lobby: Leave ─────────────────────────────────────────────────────────

  socket.on('lobby:leave', () => {
    handleDisconnect(socket.id);
  });

  // ── Lobby: Ready ─────────────────────────────────────────────────────────

  socket.on('lobby:ready', (ready: boolean) => {
    withRateLimit(socket, 'lobby:ready', () => {
      const { room, playerId } = roomManager.setPlayerReady(socket.id, ready);
      if (!room || !playerId) return;

      io.to(room.id).emit('lobby:playerReady', playerId, ready);
      io.to(room.id).emit('lobby:updated', room);
    });
  });

  // ── Lobby: Start ─────────────────────────────────────────────────────────

  socket.on('lobby:start', () => {
    withRateLimit(socket, 'lobby:start', () => {
      if (!roomManager.isHost(socket.id)) {
        socket.emit('lobby:error', { message: 'Only the host can start the game.' });
        return;
      }

      const data = roomManager.getPlayerBySocket(socket.id);
      if (!data) return;

      const { room } = data;
      if (room.players.filter((p) => p.isConnected).length < 1) {
        socket.emit('lobby:error', { message: 'Need at least 1 player to start.' });
        return;
      }

      gameManager.startSession(room.id);
      logger.info(`Session started in room ${room.code}`);
    });
  });

  // ── Lobby: Set Playlist (host only) ─────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (socket as any).on('lobby:set_playlist', (playlist: unknown) => {
    if (!roomManager.isHost(socket.id)) return;
    if (!Array.isArray(playlist) || playlist.length < 1 || playlist.length > 6) return;
    const validGames = ['mario-race','knockback-arena','shopping-cart-racing','rage-obby','floor-is-lava','physics-soccer'];
    const clean = (playlist as string[]).filter(g => validGames.includes(g));
    if (clean.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = roomManager.getPlayerBySocket(socket.id);
    if (!data) return;
    const updated = roomManager.updatePlaylist(data.room.id, clean as import('./types').GameType[]);
    if (updated) io.to(updated.id).emit('lobby:updated', updated);
  });

  // ── Lobby: Chat ──────────────────────────────────────────────────────────

  socket.on('lobby:chat', (message: string) => {
    withRateLimit(socket, 'lobby:chat', () => {
      if (!message || typeof message !== 'string') return;

      const { clean } = filterProfanity(message.trim().slice(0, 200));
      const chatMsg = roomManager.addChatMessage(socket.id, clean);
      if (!chatMsg) return;

      const data = roomManager.getPlayerBySocket(socket.id);
      if (!data) return;

      io.to(data.room.id).emit('lobby:chat', chatMsg);
    });
  });

  // ── Lobby: Kick ──────────────────────────────────────────────────────────

  socket.on('lobby:kick', (targetPlayerId: string) => {
    withRateLimit(socket, 'lobby:kick', () => {
      if (!roomManager.isHost(socket.id)) return;

      const data = roomManager.getPlayerBySocket(socket.id);
      if (!data) return;

      const target = data.room.players.find((p) => p.id === targetPlayerId);
      if (!target) return;

      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('lobby:error', { message: 'You were kicked from the room.', code: 'KICKED' });
        targetSocket.disconnect(true);
      }
    });
  });

  // ── Game: Input ──────────────────────────────────────────────────────────

  socket.on('game:input', (input) => {
    // No rate limit — physics games send input at 20Hz by design.
    // Server-side game logic validates each input (cooldowns, distances, etc).
    if (!input || typeof input.type !== 'string') return;
    gameManager.handleInput(socket.id, input);
  });

  // ── Ping/Pong for latency ────────────────────────────────────────────────

  socket.on('system:pong', (ts: number) => {
    const latency = Date.now() - ts;
    socket.data.latency = latency;
  });

  // Proactive ping every 10s
  const pingInterval = setInterval(() => {
    const ts = Date.now();
    socket.emit('system:ping', ts);
  }, 10_000);

  // ── Disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    logger.info(`Socket disconnected: ${socket.id} reason=${reason}`);
    clearInterval(pingInterval);
    handleDisconnect(socket.id);
  });
});

// ── Disconnect Handler ─────────────────────────────────────────────────────────

function handleDisconnect(socketId: string): void {
  const { room, playerId, wasHost } = roomManager.leaveRoom(socketId);

  if (!room || !playerId) return;

  io.to(room.id).emit('lobby:updated', room);

  if (wasHost) {
    io.to(room.id).emit('lobby:hostChanged', room.hostId);
  }

  const connectedCount = room.players.filter((p) => p.isConnected).length;
  if (connectedCount === 0) {
    gameManager.cleanupRoom(room.id);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  logger.info(`🏆 Internet Olympics server running on port ${PORT}`);
  logger.info(`   Frontend: ${FRONTEND_URL}`);
  logger.info(`   Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  roomManager.destroy();
  httpServer.close(() => process.exit(0));
});
