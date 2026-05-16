import { v4 as uuidv4 } from 'uuid';
import { Room, Player, RoomConfig, GameType, ChatMessage } from '../types';
import { logger } from '../utils/logger';

const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 20,
  isPublic: true,
  gameCount: 3,
  enableChaos: true,
  roundDuration: 60,
};

const GAME_POOL: GameType[] = ['mario-race', 'knockback-arena', 'shopping-cart-racing'];

function buildPlaylist(count: number): GameType[] {
  const shuffled = [...GAME_POOL].sort(() => Math.random() - 0.5);
  // Ensure no two consecutive identical games
  const result: GameType[] = [];
  for (const game of shuffled) {
    if (result[result.length - 1] !== game) result.push(game);
    if (result.length >= count) break;
  }
  while (result.length < count) {
    const pick = GAME_POOL[Math.floor(Math.random() * GAME_POOL.length)];
    if (result[result.length - 1] !== pick) result.push(pick);
  }
  return result;
}

const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours max room life
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000; // 5 min empty room cleanup

// ── Internal room data (richer than public Room type) ─────────────────────────

interface InternalRoom {
  room: Room;
  socketToPlayerId: Map<string, string>;
  lastActivity: number;
}

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private codeToId = new Map<string, string>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodically clean up abandoned rooms
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  // ── Room Lifecycle ─────────────────────────────────────────────────────────

  createRoom(
    hostSocketId: string,
    playerData: { username: string; avatar: string; color: string },
    config?: Partial<RoomConfig>
  ): { room: Room; playerId: string } {
    const roomId = uuidv4();
    const code = this.generateCode();
    const playerId = uuidv4();

    const host: Player = {
      id: playerId,
      socketId: hostSocketId,
      username: playerData.username,
      avatar: playerData.avatar,
      color: playerData.color,
      score: 0,
      roundScore: 0,
      ready: false,
      isHost: true,
      isConnected: true,
      joinedAt: Date.now(),
      streak: 0,
      xp: 0,
    };

    const roomConfig: RoomConfig = { ...DEFAULT_CONFIG, ...config };

    const room: Room = {
      id: roomId,
      code,
      hostId: playerId,
      players: [host],
      status: 'lobby',
      gamePlaylist: buildPlaylist(roomConfig.gameCount),
      currentGameIndex: 0,
      config: roomConfig,
      chat: [],
      createdAt: Date.now(),
      maxPlayers: roomConfig.maxPlayers,
    };

    this.rooms.set(roomId, {
      room,
      socketToPlayerId: new Map([[hostSocketId, playerId]]),
      lastActivity: Date.now(),
    });
    this.codeToId.set(code, roomId);

    logger.info(`Room created: code=${code} host=${playerData.username}`);
    return { room, playerId };
  }

  joinRoom(
    code: string,
    socketId: string,
    playerData: { username: string; avatar: string; color: string }
  ): { room: Room; playerId: string } | { error: string } {
    const internal = this.getRoomByCode(code);
    if (!internal) return { error: 'Room not found. Check your code!' };

    const { room } = internal;

    if (room.status !== 'lobby') return { error: 'Game already in progress!' };
    if (room.players.length >= room.maxPlayers) return { error: 'Room is full!' };

    // Prevent duplicate usernames
    const nameTaken = room.players.some(
      (p) => p.username.toLowerCase() === playerData.username.toLowerCase() && p.isConnected
    );
    if (nameTaken) return { error: 'Username taken in this room. Pick another!' };

    const playerId = uuidv4();

    const player: Player = {
      id: playerId,
      socketId,
      username: playerData.username,
      avatar: playerData.avatar,
      color: playerData.color,
      score: 0,
      roundScore: 0,
      ready: false,
      isHost: false,
      isConnected: true,
      joinedAt: Date.now(),
      streak: 0,
      xp: 0,
    };

    room.players.push(player);
    internal.socketToPlayerId.set(socketId, playerId);
    internal.lastActivity = Date.now();

    this.addSystemMessage(room, `${playerData.username} joined the party! 🎉`);

    logger.info(`Player joined: username=${playerData.username} room=${code}`);
    return { room, playerId };
  }

  leaveRoom(socketId: string): { room: Room | null; playerId: string | null; wasHost: boolean } {
    const result = this.findRoomBySocket(socketId);
    if (!result) return { room: null, playerId: null, wasHost: false };

    const { internal, playerId } = result;
    const { room } = internal;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { room: null, playerId: null, wasHost: false };

    const wasHost = player.isHost;
    player.isConnected = false;
    internal.socketToPlayerId.delete(socketId);
    internal.lastActivity = Date.now();

    this.addSystemMessage(room, `${player.username} left the room.`);

    // If host left, pick new host
    if (wasHost) {
      const nextPlayer = room.players.find((p) => p.isConnected && p.id !== playerId);
      if (nextPlayer) {
        nextPlayer.isHost = true;
        room.hostId = nextPlayer.id;
        this.addSystemMessage(room, `${nextPlayer.username} is now the host. 👑`);
        logger.info(`Host transferred to ${nextPlayer.username} in room ${room.code}`);
      }
    }

    // Remove fully disconnected players in lobby
    if (room.status === 'lobby') {
      room.players = room.players.filter((p) => p.isConnected);
    }

    // Destroy empty rooms
    if (room.players.filter((p) => p.isConnected).length === 0) {
      this.destroyRoom(room.id);
      return { room: null, playerId, wasHost };
    }

    return { room, playerId, wasHost };
  }

  // Reconnect a player who disconnected mid-game
  reconnectPlayer(
    code: string,
    socketId: string,
    username: string
  ): { room: Room; playerId: string } | { error: string } {
    const internal = this.getRoomByCode(code);
    if (!internal) return { error: 'Room no longer exists.' };

    const { room } = internal;
    const player = room.players.find(
      (p) => p.username.toLowerCase() === username.toLowerCase() && !p.isConnected
    );

    if (!player) return { error: 'Player not found or already connected.' };

    player.socketId = socketId;
    player.isConnected = true;
    internal.socketToPlayerId.set(socketId, player.id);
    internal.lastActivity = Date.now();

    logger.info(`Player reconnected: username=${username} room=${code}`);
    return { room, playerId: player.id };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  setPlayerReady(socketId: string, ready: boolean): { room: Room | null; playerId: string | null } {
    const result = this.findRoomBySocket(socketId);
    if (!result) return { room: null, playerId: null };

    const { internal, playerId } = result;
    const player = internal.room.players.find((p) => p.id === playerId);
    if (player) {
      player.ready = ready;
      internal.lastActivity = Date.now();
    }

    return { room: internal.room, playerId };
  }

  setRoomStatus(roomId: string, status: Room['status']): void {
    const internal = this.rooms.get(roomId);
    if (internal) {
      internal.room.status = status;
      internal.lastActivity = Date.now();
    }
  }

  resetRoundScores(roomId: string): void {
    const internal = this.rooms.get(roomId);
    if (!internal) return;
    for (const p of internal.room.players) p.roundScore = 0;
  }

  applyGameResults(roomId: string, scoresByPlayerId: Record<string, number>): void {
    const internal = this.rooms.get(roomId);
    if (!internal) return;

    for (const p of internal.room.players) {
      const gained = scoresByPlayerId[p.id] ?? 0;
      p.roundScore = gained;
      p.score += gained;
    }
    internal.lastActivity = Date.now();
  }

  addChatMessage(socketId: string, message: string): ChatMessage | null {
    const result = this.findRoomBySocket(socketId);
    if (!result) return null;

    const { internal, playerId } = result;
    const player = internal.room.players.find((p) => p.id === playerId);
    if (!player) return null;

    const chatMsg: ChatMessage = {
      id: uuidv4(),
      playerId: player.id,
      username: player.username,
      avatar: player.avatar,
      color: player.color,
      message: message.slice(0, 200),
      timestamp: Date.now(),
      type: 'chat',
    };

    internal.room.chat.push(chatMsg);
    if (internal.room.chat.length > 100) {
      internal.room.chat = internal.room.chat.slice(-100);
    }

    return chatMsg;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getRoom(id: string): Room | null {
    return this.rooms.get(id)?.room ?? null;
  }

  getPlayerBySocket(socketId: string): { room: Room; playerId: string } | null {
    const result = this.findRoomBySocket(socketId);
    if (!result) return null;
    return { room: result.internal.room, playerId: result.playerId };
  }

  getPlayerIdBySocket(socketId: string): string | null {
    return this.findRoomBySocket(socketId)?.playerId ?? null;
  }

  getSocketIds(roomId: string): string[] {
    const internal = this.rooms.get(roomId);
    if (!internal) return [];
    return internal.room.players
      .filter((p) => p.isConnected)
      .map((p) => p.socketId);
  }

  isHost(socketId: string): boolean {
    const result = this.findRoomBySocket(socketId);
    if (!result) return false;
    const player = result.internal.room.players.find((p) => p.id === result.playerId);
    return player?.isHost ?? false;
  }

  getPublicRooms(): Room[] {
    return Array.from(this.rooms.values())
      .filter((i) => i.room.config.isPublic && i.room.status === 'lobby')
      .map((i) => i.room);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private getRoomByCode(code: string): InternalRoom | null {
    const id = this.codeToId.get(code.toUpperCase());
    if (!id) return null;
    return this.rooms.get(id) ?? null;
  }

  private findRoomBySocket(socketId: string): { internal: InternalRoom; playerId: string } | null {
    for (const internal of this.rooms.values()) {
      const playerId = internal.socketToPlayerId.get(socketId);
      if (playerId) return { internal, playerId };
    }
    return null;
  }

  private addSystemMessage(room: Room, message: string): void {
    room.chat.push({
      id: uuidv4(),
      playerId: 'system',
      username: 'System',
      avatar: '🏆',
      color: '#7C3AED',
      message,
      timestamp: Date.now(),
      type: 'system',
    });
  }

  private destroyRoom(roomId: string): void {
    const internal = this.rooms.get(roomId);
    if (!internal) return;
    this.codeToId.delete(internal.room.code);
    this.rooms.delete(roomId);
    logger.info(`Room destroyed: id=${roomId}`);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, internal] of this.rooms.entries()) {
      const { room, lastActivity } = internal;
      const age = now - room.createdAt;
      const idle = now - lastActivity;

      const connectedPlayers = room.players.filter((p) => p.isConnected).length;

      if (age > ROOM_TTL_MS || (connectedPlayers === 0 && idle > EMPTY_ROOM_TTL_MS)) {
        this.destroyRoom(id);
      }
    }
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (this.codeToId.has(code));
    return code;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
