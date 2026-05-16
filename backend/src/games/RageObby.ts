/**
 * Rage Obby — server-side progress tracker.
 *
 * Physics run entirely on the client. The server receives:
 *   obby_pos       — position updates (15 Hz)
 *   obby_checkpoint — player reached a checkpoint
 *   obby_death      — player died
 *   obby_finish     — player crossed the finish line
 *
 * Server broadcasts player progress at 20 Hz so everyone can see ghosts.
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

const BROADCAST_HZ = 20;

const CHECKPOINT_COUNT = 5; // ids 0-4
const RANK_POINTS = [1000, 700, 500, 350, 250, 200];
// Points awarded to players who didn't finish, based on last checkpoint reached
const CP_CONSOLATION = [0, 100, 220, 360, 520];

interface ObbyPlayer {
  socketId: string;
  x: number;
  y: number;
  checkpoint: number;
  deaths: number;
  finished: boolean;
  finishRank: number;
}

export class RageObby extends BaseGame {
  readonly gameType = 'rage-obby' as const;
  readonly displayName = 'Rage Obby 🏃';

  private players = new Map<string, ObbyPlayer>();
  private finishCount = 0;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private endingEarly = false;

  protected async onStart(): Promise<void> {
    for (const id of this.config.playerIds) {
      this.players.set(id, {
        socketId: id,
        x: 80, y: 384,
        checkpoint: 0,
        deaths: 0,
        finished: false,
        finishRank: 0,
      });
    }
  }

  protected async onPlayStart(): Promise<void> {
    this.broadcastInterval = setInterval(() => this.broadcast(), 1000 / BROADCAST_HZ);
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = null;
  }

  protected onInput(playerId: string, input: { type: string; payload: Record<string, unknown> }): void {
    const p = this.players.get(playerId);
    if (!p) return;

    switch (input.type) {
      case 'obby_pos':
        if (typeof input.payload.x === 'number') p.x = input.payload.x;
        if (typeof input.payload.y === 'number') p.y = input.payload.y;
        break;

      case 'obby_checkpoint': {
        const id = typeof input.payload.id === 'number' ? input.payload.id : -1;
        if (id > p.checkpoint && id < CHECKPOINT_COUNT) p.checkpoint = id;
        break;
      }

      case 'obby_death':
        p.deaths++;
        break;

      case 'obby_finish':
        if (!p.finished) {
          p.finished = true;
          this.finishCount++;
          p.finishRank = this.finishCount;
          const pts = RANK_POINTS[this.finishCount - 1] ?? 100;
          this.addScore(playerId, pts);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.io.to(this.config.roomId).emit('obby:finished' as any, {
            id: playerId, rank: p.finishRank, points: pts,
          });
          if (!this.endingEarly && this.finishCount >= this.players.size) {
            this.endingEarly = true;
            setTimeout(() => this.endEarly(), 2000);
          }
        }
        break;
    }
  }

  private endEarly(): void {
    if (!this.isRunning) return;
    this.clearTimers();
    this.isRunning = false;
    this.phase = 'results';
    this.broadcastState();
    const results = this.buildResults();
    this.io.to(this.config.roomId).emit('game:end', results);
    this.emit('ended', results);
  }

  private broadcast(): void {
    if (!this.isRunning) return;
    const players = [...this.players.values()].map(p => ({
      id: p.socketId,
      x: Math.round(p.x),
      y: Math.round(p.y),
      cp: p.checkpoint,
      d: p.deaths,
      fn: p.finishRank,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('obby:state' as any, { t: Date.now(), players });
  }

  protected onTick(_remaining: number): void {}

  protected override triggerChaos(): void {
    this.io.to(this.config.roomId).emit('chaos:announcement', '🌀 CHAOS! Extra slippery floors!');
  }

  protected getGameData(): unknown {
    const summary: Record<string, { cp: number; deaths: number; fn: number }> = {};
    for (const [id, p] of this.players) {
      summary[id] = { cp: p.checkpoint, deaths: p.deaths, fn: p.finishRank };
    }
    return { summary };
  }

  protected buildResults(): GameResults {
    for (const p of this.players.values()) {
      if (!p.finished) {
        this.addScore(p.socketId, CP_CONSOLATION[p.checkpoint] ?? 0);
      }
    }
    const lb = this.getLeaderboard();
    const resultPlayers: PlayerResult[] = lb.map((entry, idx) => {
      const p = this.players.get(entry.playerId)!;
      return {
        playerId: entry.playerId,
        username: '',
        avatar: '',
        color: '',
        roundScore: entry.score,
        totalScore: this.totalScores[entry.playerId] ?? 0,
        rank: idx + 1,
        stats: { deaths: p.deaths, checkpoint: p.checkpoint, finished: p.finished ? 1 : 0 },
      };
    });
    const finishers = [...this.players.values()].filter(p => p.finished).length;
    const highlights: string[] = finishers > 0
      ? [`🏁 ${finishers} player${finishers > 1 ? 's' : ''} survived the rage!`]
      : ['💀 Nobody escaped! The obby wins.'];
    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: lb[0]?.playerId ?? '',
      highlights,
    };
  }
}
