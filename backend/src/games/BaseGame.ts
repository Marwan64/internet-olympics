import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { GameState, GameType, GameResults, ChaosEvent, ChaosEventType } from '../types';
import { logger } from '../utils/logger';

export interface GameConfig {
  roomId: string;
  playerIds: string[];
  duration: number; // seconds
  enableChaos: boolean;
  gameNumber: number;
  totalGames: number;
}

export abstract class BaseGame extends EventEmitter {
  protected io: Server;
  protected config: GameConfig;
  protected scores: Record<string, number> = {};
  protected totalScores: Record<string, number>;
  protected phase: 'intro' | 'playing' | 'results' = 'intro';
  protected timeRemaining: number;
  protected gameTimer: NodeJS.Timeout | null = null;
  protected chaosTimer: NodeJS.Timeout | null = null;
  protected isRunning = false;

  abstract readonly gameType: GameType;
  abstract readonly displayName: string;

  constructor(io: Server, config: GameConfig, previousScores: Record<string, number> = {}) {
    super(); // EventEmitter
    this.io = io;
    this.config = config;
    this.timeRemaining = config.duration;
    this.totalScores = { ...previousScores };

    // Initialize scores for all players
    for (const id of config.playerIds) {
      this.scores[id] = 0;
      if (!this.totalScores[id]) this.totalScores[id] = 0;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.isRunning = true;
    this.phase = 'intro';

    logger.info(`[${this.gameType}] Starting in room ${this.config.roomId}`);

    await this.onStart();

    // Brief intro phase
    this.broadcastState();

    await this.sleep(3000);

    this.phase = 'playing';
    this.startTimer();

    if (this.config.enableChaos) {
      this.scheduleChaos();
    }

    this.broadcastState();
    await this.onPlayStart();
  }

  stop(): GameResults {
    this.isRunning = false;
    this.clearTimers();
    this.phase = 'results';

    const results = this.buildResults();
    this.broadcastState();

    logger.info(
      `[${this.gameType}] Ended in room ${this.config.roomId}. Scores: ${JSON.stringify(this.scores)}`
    );

    return results;
  }

  handleInput(playerId: string, input: { type: string; payload: Record<string, unknown> }): void {
    if (!this.isRunning || this.phase !== 'playing') return;
    if (!this.config.playerIds.includes(playerId)) return;

    this.onInput(playerId, input);
  }

  // ── Abstract hooks ─────────────────────────────────────────────────────────

  protected abstract onStart(): Promise<void>;
  protected abstract onPlayStart(): Promise<void>;
  protected abstract onInput(
    playerId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void;
  protected abstract onTick(remaining: number): void;
  protected abstract getGameData(): unknown;
  protected abstract buildResults(): GameResults;

  // ── Timer ──────────────────────────────────────────────────────────────────

  protected startTimer(): void {
    this.gameTimer = setInterval(() => {
      this.timeRemaining--;
      this.onTick(this.timeRemaining);

      if (this.timeRemaining % 5 === 0 || this.timeRemaining <= 5) {
        this.broadcastState();
      }

      if (this.timeRemaining <= 0) {
        this.clearTimers();
        this.isRunning = false;
        this.phase = 'results';
        this.broadcastState();
        const results = this.buildResults();
        this.io.to(this.config.roomId).emit('game:end', results);
        this.emit('ended', results);
      }
    }, 1000);
  }

  protected clearTimers(): void {
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.chaosTimer) clearTimeout(this.chaosTimer);
    this.gameTimer = null;
    this.chaosTimer = null;
  }

  // ── Chaos System ───────────────────────────────────────────────────────────

  protected readonly CHAOS_EVENTS: ChaosEventType[] = [
    'SCREEN_SHAKE',
    'WORD_FLIP',
    'SPEED_UP',
    'FAKE_WORDS',
    'MIRROR',
    'TINY_TEXT',
    'DISCO_MODE',
    'WORD_SCRAMBLE',
    'SUPER_SPEED',
    'LOW_GRAVITY',
  ];

  protected readonly CHAOS_ANNOUNCEMENTS = [
    '⚡ EVERYONE HAS SUPER SPEED!',
    '🌊 LOW GRAVITY MODE ACTIVATED!',
    '🔄 REVERSE CONTROLS!',
    '👻 INVISIBILITY CHAOS!',
    '🎲 RANDOM MADNESS!',
    '🌀 WORD SCRAMBLE TIME!',
    '✨ DISCO MODE!',
    '🎯 TINY TEXT CHALLENGE!',
    '🪞 MIRROR MIRROR!',
  ];

  private scheduleChaos(): void {
    const delay = 8000 + Math.random() * 7000; // 8-15 seconds

    this.chaosTimer = setTimeout(() => {
      if (!this.isRunning || this.timeRemaining < 5) return;

      this.triggerChaos();

      if (this.isRunning) {
        this.scheduleChaos(); // schedule next
      }
    }, delay);
  }

  protected triggerChaos(): void {
    const eventType = this.CHAOS_EVENTS[Math.floor(Math.random() * this.CHAOS_EVENTS.length)];
    const announcement =
      this.CHAOS_ANNOUNCEMENTS[Math.floor(Math.random() * this.CHAOS_ANNOUNCEMENTS.length)];

    const chaos: ChaosEvent = {
      type: eventType,
      duration: 3000 + Math.random() * 4000,
      message: announcement,
      intensity: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
    };

    this.io.to(this.config.roomId).emit('chaos:event', chaos);
    this.io.to(this.config.roomId).emit('chaos:announcement', announcement);

    logger.debug(`[CHAOS] ${eventType} in room ${this.config.roomId}`);
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────

  protected broadcastState(): void {
    const state: GameState = {
      type: this.gameType,
      phase: this.phase,
      timeRemaining: this.timeRemaining,
      scores: { ...this.scores },
      totalScores: { ...this.totalScores },
      data: this.getGameData() as GameState['data'],
      gameNumber: this.config.gameNumber,
      totalGames: this.config.totalGames,
    };

    this.io.to(this.config.roomId).emit('game:state', state);
  }

  // ── Score helpers ──────────────────────────────────────────────────────────

  protected addScore(playerId: string, points: number): void {
    if (!this.scores[playerId]) this.scores[playerId] = 0;
    this.scores[playerId] += points;
    if (!this.totalScores[playerId]) this.totalScores[playerId] = 0;
    this.totalScores[playerId] += points;
  }

  protected getLeaderboard(): { playerId: string; score: number }[] {
    return Object.entries(this.scores)
      .map(([playerId, score]) => ({ playerId, score }))
      .sort((a, b) => b.score - a.score);
  }

  // ── Util ───────────────────────────────────────────────────────────────────

  protected sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
