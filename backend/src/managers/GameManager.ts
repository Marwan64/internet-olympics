import { Server } from 'socket.io';
import { GameType, GameResults } from '../types';
import { RoomManager } from './RoomManager';
import { BaseGame, GameConfig } from '../games/BaseGame';
import { MarioGame } from '../games/MarioGame';
import { KnockbackArena } from '../games/KnockbackArena';
import { ShoppingCart } from '../games/ShoppingCart';
import { RageObby } from '../games/RageObby';
import { logger } from '../utils/logger';

// ── Game Registry ──────────────────────────────────────────────────────────────

type GameConstructor = new (io: Server, config: GameConfig, prevScores: Record<string, number>) => BaseGame;

const GAME_REGISTRY: Record<GameType, GameConstructor> = {
  'mario-race': MarioGame,
  'knockback-arena': KnockbackArena,
  'shopping-cart-racing': ShoppingCart,
  'rage-obby': RageObby,
};

// ── Manager ────────────────────────────────────────────────────────────────────

interface RoomGameState {
  game: BaseGame | null;
  currentGameIndex: number;
  gameHistory: GameResults[];
  cumulativeScores: Record<string, number>;
}

export class GameManager {
  private io: Server;
  private roomManager: RoomManager;
  private roomStates = new Map<string, RoomGameState>();

  constructor(io: Server, roomManager: RoomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async startSession(roomId: string): Promise<void> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    this.roomStates.set(roomId, {
      game: null,
      currentGameIndex: 0,
      gameHistory: [],
      cumulativeScores: {},
    });

    this.roomManager.setRoomStatus(roomId, 'countdown');

    // Countdown
    for (let i = 3; i >= 1; i--) {
      this.io.to(roomId).emit('game:countdown', i);
      await this.sleep(1000);
    }

    await this.loadNextGame(roomId);
  }

  handleInput(
    socketId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void {
    const data = this.roomManager.getPlayerBySocket(socketId);
    if (!data) return;

    const state = this.roomStates.get(data.room.id);
    if (!state?.game) return;

    // Pass socketId — game uses socket IDs as player state keys
    state.game.handleInput(socketId, input);
  }

  onGameEnd(roomId: string, results: GameResults): void {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    state.gameHistory.push(results);

    // Apply scores
    const scoreMap: Record<string, number> = {};
    for (const player of results.scores) {
      scoreMap[player.playerId] = player.roundScore;
      state.cumulativeScores[player.playerId] =
        (state.cumulativeScores[player.playerId] ?? 0) + player.roundScore;
    }

    this.roomManager.applyGameResults(roomId, scoreMap);

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    // Enrich results with player info
    const enrichedResults = {
      ...results,
      scores: results.scores.map((s) => {
        const player = room.players.find((p) => p.socketId === s.playerId);
        return {
          ...s,
          username: player?.username ?? 'Unknown',
          avatar: player?.avatar ?? '🎮',
          color: player?.color ?? '#7C3AED',
          totalScore: state.cumulativeScores[s.playerId] ?? 0,
        };
      }),
    };

    this.io.to(roomId).emit('game:end', enrichedResults);

    // currentGameIndex was incremented at the end of loadNextGame, so it now
    // equals the count of games already started. We have more games iff that
    // count is less than the playlist length.
    const hasMore = state.currentGameIndex < room.gamePlaylist.length;

    if (hasMore) {
      // Brief pause then load next game
      setTimeout(() => this.loadNextGame(roomId), 5000);
    } else {
      setTimeout(() => this.endSession(roomId, state), 5000);
    }
  }

  cleanupRoom(roomId: string): void {
    const state = this.roomStates.get(roomId);
    if (state?.game) {
      try { state.game.stop(); } catch (_) { /* ignore */ }
    }
    this.roomStates.delete(roomId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async loadNextGame(roomId: string): Promise<void> {
    const room = this.roomManager.getRoom(roomId);
    const state = this.roomStates.get(roomId);
    if (!room || !state) return;

    const gameIndex = state.currentGameIndex;
    const gameType = room.gamePlaylist[gameIndex];

    if (!gameType) {
      this.endSession(roomId, state);
      return;
    }

    logger.info(`Loading game ${gameType} (#${gameIndex + 1}) in room ${room.code}`);

    this.roomManager.setRoomStatus(roomId, 'playing');
    this.roomManager.resetRoundScores(roomId);

    const GameClass = GAME_REGISTRY[gameType];
    const GAME_DURATIONS: Partial<Record<GameType, number>> = { 'rage-obby': 90 };
    const config: GameConfig = {
      roomId,
      playerIds: room.players.filter((p) => p.isConnected).map((p) => p.socketId),
      duration: GAME_DURATIONS[gameType] ?? room.config.roundDuration,
      enableChaos: room.config.enableChaos,
      gameNumber: gameIndex + 1,
      totalGames: room.gamePlaylist.length,
    };

    const game = new GameClass(this.io, config, { ...state.cumulativeScores });
    state.game = game;
    state.currentGameIndex++;

    this.io.to(roomId).emit('game:begin', {
      type: gameType,
      phase: 'intro',
      timeRemaining: config.duration,
      scores: {},
      totalScores: { ...state.cumulativeScores },
      data: {},
      gameNumber: gameIndex + 1,
      totalGames: room.gamePlaylist.length,
    });

    // Listen for game ending (timer expires)
    game.once('ended', (results: GameResults) => {
      this.onGameEnd(roomId, results);
    });

    // Start game
    game.start();
  }

  private endSession(roomId: string, state: RoomGameState): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    this.roomManager.setRoomStatus(roomId, 'podium');

    // Build final leaderboard
    const sortedPlayers = [...room.players].sort(
      (a, b) => b.score - a.score
    );

    const awards = this.calculateAwards(sortedPlayers, state.gameHistory);

    this.io.to(roomId).emit('session:podium', {
      players: sortedPlayers.map((p, idx) => ({
        playerId: p.id,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        roundScore: p.roundScore,
        totalScore: p.score,
        rank: idx + 1,
        stats: {},
      })),
      gameHistory: state.gameHistory,
      champion: {
        playerId: sortedPlayers[0]?.id ?? '',
        username: sortedPlayers[0]?.username ?? '',
        avatar: sortedPlayers[0]?.avatar ?? '',
        color: sortedPlayers[0]?.color ?? '',
        roundScore: 0,
        totalScore: sortedPlayers[0]?.score ?? 0,
        rank: 1,
        stats: {},
      },
      awards,
    });

    // Return to lobby after 15s
    setTimeout(() => {
      this.roomManager.setRoomStatus(roomId, 'lobby');
      const updatedRoom = this.roomManager.getRoom(roomId);
      if (updatedRoom) {
        // Reset scores for next session
        for (const p of updatedRoom.players) {
          p.score = 0;
          p.ready = false;
        }
        this.io.to(roomId).emit('lobby:updated', updatedRoom);
      }
      this.roomStates.delete(roomId);
    }, 15_000);
  }

  private calculateAwards(
    players: { id: string; username: string; avatar: string }[],
    _history: GameResults[]
  ) {
    const awards = [];
    if (players[0]) {
      awards.push({ playerId: players[0].id, title: 'CHAMPION', emoji: '🏆', description: 'Highest total score' });
    }
    if (players[players.length - 1] && players.length > 1) {
      awards.push({ playerId: players[players.length - 1].id, title: 'PARTICIPANT', emoji: '🫠', description: 'Just happy to be here' });
    }
    return awards;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
