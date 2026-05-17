/**
 * Floor is Lava — server manages lava height + player state relay.
 *
 * Physics run on the client. The server receives:
 *   lava_pos  — position updates (20 Hz)
 *   lava_die  — player touched the lava
 *
 * Server broadcasts at 20 Hz:
 *   lava:state  — { t, lavaY, players: [{id, x, y, z, alive}] }
 *   lava:eliminated — { id, rank }
 *   lava:chaos  — { type, duration }
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

const BROADCAST_HZ = 20;

// Lava speed phases (units / second)
const LAVA_START_Y  = -3;
const LAVA_SPD_SLOW = 0.25; // > 50 s remaining
const LAVA_SPD_MED  = 0.5;  // 20-50 s remaining
const LAVA_SPD_FAST = 1.2;  // < 20 s remaining

// Survival points per second
const SCORE_PER_SEC = 1;

// Rank bonuses for survivors still alive when the timer ends (sorted by height)
const SURVIVOR_BONUS = [500, 300, 150, 75, 50];

interface LavaPlayer {
  socketId: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  survivalTime: number; // seconds
  maxHeight: number;
  eliminationRank: number;
}

export class FloorIsLava extends BaseGame {
  readonly gameType = 'floor-is-lava' as const;
  readonly displayName = 'Floor is Lava 🌋';

  private players = new Map<string, LavaPlayer>();
  private lavaY = LAVA_START_Y;
  private eliminationCount = 0;
  private endingEarly = false;

  private broadcastInterval: NodeJS.Timeout | null = null;
  private physicsInterval: NodeJS.Timeout | null = null;
  private scoreInterval: NodeJS.Timeout | null = null;

  protected async onStart(): Promise<void> {
    this.lavaY = LAVA_START_Y;
    for (const id of this.config.playerIds) {
      this.players.set(id, {
        socketId: id,
        x: 0, y: 1.9, z: 0,
        alive: true,
        survivalTime: 0,
        maxHeight: 1.9,
        eliminationRank: 0,
      });
    }
  }

  protected async onPlayStart(): Promise<void> {
    this.broadcastInterval = setInterval(() => this.broadcast(), 1000 / BROADCAST_HZ);
    this.physicsInterval   = setInterval(() => this.stepLava(), 50); // 20 Hz
    this.scoreInterval     = setInterval(() => this.awardSurvival(), 1000);
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    if (this.physicsInterval)   clearInterval(this.physicsInterval);
    if (this.scoreInterval)     clearInterval(this.scoreInterval);
    this.broadcastInterval = null;
    this.physicsInterval   = null;
    this.scoreInterval     = null;
  }

  // ── Lava physics (20 Hz) ───────────────────────────────────────────────────

  private stepLava(): void {
    if (!this.isRunning) return;
    const dt = 0.05; // 50 ms
    let spd = LAVA_SPD_SLOW;
    if (this.timeRemaining <= 20) spd = LAVA_SPD_FAST;
    else if (this.timeRemaining <= 50) spd = LAVA_SPD_MED;
    this.lavaY += spd * dt;
  }

  private awardSurvival(): void {
    for (const p of this.players.values()) {
      if (p.alive) {
        p.survivalTime++;
        this.addScore(p.socketId, SCORE_PER_SEC);
      }
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  protected onInput(playerId: string, input: { type: string; payload: Record<string, unknown> }): void {
    const p = this.players.get(playerId);
    if (!p) return;

    switch (input.type) {
      case 'lava_pos':
        if (typeof input.payload.x === 'number') p.x = input.payload.x;
        if (typeof input.payload.y === 'number') {
          p.y = input.payload.y;
          if (p.y > p.maxHeight) p.maxHeight = p.y;
        }
        if (typeof input.payload.z === 'number') p.z = input.payload.z;
        break;

      case 'lava_bat': {
        const targetId = input.payload.targetId as string;
        const target = this.players.get(targetId);
        if (!target || !target.alive || !p.alive) break;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 4.5) break;
        const len = Math.max(0.3, dist);
        const KBF = 20;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.io.to(this.config.roomId).emit('lava:hit' as any, {
          id: targetId,
          vx: (dx / len) * KBF,
          vy: 6,
          vz: (dz / len) * KBF,
        });
        break;
      }

      case 'lava_die':
        if (p.alive) {
          p.alive = false;
          this.eliminationCount++;
          p.eliminationRank = this.eliminationCount;

          // Height bonus: 10 pts per unit above ground (top=1)
          const heightBonus = Math.max(0, Math.round((p.maxHeight - 1) * 10));
          if (heightBonus > 0) this.addScore(playerId, heightBonus);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.io.to(this.config.roomId).emit('lava:eliminated' as any, {
            id: playerId,
            rank: p.eliminationRank,
          });

          this.checkAllGone();
        }
        break;
    }
  }

  private checkAllGone(): void {
    const alive = [...this.players.values()].filter(p => p.alive).length;
    if (alive === 0 && !this.endingEarly) {
      this.endingEarly = true;
      setTimeout(() => this.endEarly(), 2000);
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

  // ── Broadcast ──────────────────────────────────────────────────────────────

  private broadcast(): void {
    if (!this.isRunning) return;
    const players = [...this.players.values()].map(p => ({
      id: p.socketId,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      alive: p.alive,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('lava:state' as any, {
      t: Date.now(),
      lavaY: Math.round(this.lavaY * 100) / 100,
      players,
    });
  }

  // ── Chaos ──────────────────────────────────────────────────────────────────

  protected override triggerChaos(): void {
    const types = ['low_gravity', 'slippery', 'lava_surge', 'collapsing'];
    const type = types[Math.floor(Math.random() * types.length)];
    const labels: Record<string, string> = {
      low_gravity: '🌙 LOW GRAVITY! Float above the lava!',
      slippery:    '🧊 ICY FLOORS! Grip is for losers!',
      lava_surge:  '🌋 LAVA SURGE! It rises FASTER!',
      collapsing:  '💥 PLATFORMS COLLAPSING!',
    };
    const msg = labels[type] ?? '⚡ CHAOS!';
    this.io.to(this.config.roomId).emit('chaos:announcement', msg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('lava:chaos' as any, { type, duration: 5000 });

    if (type === 'lava_surge') {
      // Momentary jump in lava height
      this.lavaY += 2.5;
    }
  }

  // ── Timer tick ─────────────────────────────────────────────────────────────

  protected onTick(_remaining: number): void {}

  // ── Results ────────────────────────────────────────────────────────────────

  protected getGameData(): unknown {
    return {
      lavaY: this.lavaY,
      aliveCount: [...this.players.values()].filter(p => p.alive).length,
    };
  }

  protected buildResults(): GameResults {
    // Award bonuses to survivors, sorted by max height reached
    const survivors = [...this.players.values()]
      .filter(p => p.alive)
      .sort((a, b) => b.maxHeight - a.maxHeight);

    survivors.forEach((p, i) => {
      const bonus = SURVIVOR_BONUS[i] ?? 25;
      this.addScore(p.socketId, bonus);
    });

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
        stats: {
          survivalTime: p.survivalTime,
          maxHeight: Math.round(p.maxHeight * 10) / 10,
          survived: p.alive ? 1 : 0,
        },
      };
    });

    const survived = [...this.players.values()].filter(p => p.alive).length;
    const highlights: string[] = survived > 0
      ? [`🏆 ${survived} player${survived !== 1 ? 's' : ''} survived the lava!`]
      : ['🌋 The lava consumed everyone!'];

    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: lb[0]?.playerId ?? '',
      highlights,
    };
  }
}
