import { Server } from 'socket.io';
import { GameResults, PlayerResult } from '../types';
import { BaseGame, GameConfig } from './BaseGame';

// ── Level constants (must match frontend) ─────────────────────────────────────

export const LEVEL_WIDTH = 5000;
export const GROUND_Y = 520;
const PLAYER_H = 48;
const GOOMBA_W = 36;
const GOOMBA_H = 36;
const BLOCK_SIZE = 32;
const GOOMBA_SPEED = 70;

export const PLATFORMS = [
  { x: 300, y: 420, w: 160, h: 20 },
  { x: 560, y: 360, w: 140, h: 20 },
  { x: 800, y: 430, w: 160, h: 20 },
  { x: 1060, y: 380, w: 140, h: 20 },
  { x: 1300, y: 320, w: 160, h: 20 },
  { x: 1560, y: 390, w: 140, h: 20 },
  { x: 1800, y: 340, w: 160, h: 20 },
  { x: 2060, y: 410, w: 140, h: 20 },
  { x: 2300, y: 340, w: 160, h: 20 },
  { x: 2560, y: 280, w: 140, h: 20 },
  { x: 2800, y: 370, w: 160, h: 20 },
  { x: 3060, y: 310, w: 140, h: 20 },
  { x: 3300, y: 390, w: 160, h: 20 },
  { x: 3560, y: 330, w: 140, h: 20 },
  { x: 3800, y: 410, w: 160, h: 20 },
  { x: 4060, y: 360, w: 140, h: 20 },
  { x: 4300, y: 300, w: 160, h: 20 },
];

export const QUESTION_BLOCKS = [
  { id: 'b0', x: 130, y: 400, powerUp: 'speed' as const },
  { id: 'b1', x: 720, y: 400, powerUp: 'speed' as const },
  { id: 'b2', x: 1220, y: 400, powerUp: 'star' as const },
  { id: 'b3', x: 1340, y: 200, powerUp: 'speed' as const },
  { id: 'b4', x: 1740, y: 400, powerUp: 'speed' as const },
  { id: 'b5', x: 2580, y: 160, powerUp: 'star' as const },
  { id: 'b6', x: 2740, y: 400, powerUp: 'speed' as const },
  { id: 'b7', x: 3080, y: 190, powerUp: 'speed' as const },
  { id: 'b8', x: 3740, y: 400, powerUp: 'star' as const },
  { id: 'b9', x: 4310, y: 180, powerUp: 'star' as const },
];

const GOOMBAS_INIT = [
  { id: 'g0', startX: 520, minX: 380, maxX: 680 },
  { id: 'g1', startX: 950, minX: 820, maxX: 1080 },
  { id: 'g2', startX: 1450, minX: 1320, maxX: 1580 },
  { id: 'g3', startX: 1950, minX: 1820, maxX: 2080 },
  { id: 'g4', startX: 2450, minX: 2320, maxX: 2580 },
  { id: 'g5', startX: 2950, minX: 2820, maxX: 3080 },
  { id: 'g6', startX: 3450, minX: 3320, maxX: 3580 },
  { id: 'g7', startX: 3950, minX: 3820, maxX: 4080 },
  { id: 'g8', startX: 4450, minX: 4320, maxX: 4620 },
];

export const PIPE = { x: 4650, y: 360, w: 100, h: 160 };
export const PLAYER_START = { x: 80, y: GROUND_Y - PLAYER_H };

// ── Internal state ─────────────────────────────────────────────────────────────

interface GoombaState {
  id: string;
  x: number;
  y: number;
  vx: number;
  minX: number;
  maxX: number;
  alive: boolean;
}

interface BlockState {
  id: string;
  x: number;
  y: number;
  hit: boolean;
  powerUp: 'speed' | 'star' | null;
}

interface PowerUpItem {
  id: string;
  x: number;
  y: number;
  type: 'speed' | 'star';
  collected: boolean;
}

interface MarioPlayerState {
  x: number;
  y: number;
  powerUp: null | 'speed' | 'star';
  powerUpExpiry: number;
  finished: boolean;
  finishRank: number;
  dead: boolean;
  respawnAt: number;
}

// ── Game ───────────────────────────────────────────────────────────────────────

export class MarioGame extends BaseGame {
  readonly gameType = 'mario-race' as const;
  readonly displayName = 'Mario Race! 🍄';

  private playerStates = new Map<string, MarioPlayerState>();
  private goombas: GoombaState[] = [];
  private blocks: BlockState[] = [];
  private powerUps: PowerUpItem[] = [];
  private finishCount = 0;
  private physicsInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();

  protected async onStart(): Promise<void> {
    for (const id of this.config.playerIds) {
      this.playerStates.set(id, {
        x: PLAYER_START.x,
        y: PLAYER_START.y,
        powerUp: null,
        powerUpExpiry: 0,
        finished: false,
        finishRank: 0,
        dead: false,
        respawnAt: 0,
      });
    }

    this.goombas = GOOMBAS_INIT.map(g => ({
      id: g.id,
      x: g.startX,
      y: GROUND_Y - GOOMBA_H,
      vx: -GOOMBA_SPEED,
      minX: g.minX,
      maxX: g.maxX,
      alive: true,
    }));

    this.blocks = QUESTION_BLOCKS.map(b => ({
      id: b.id,
      x: b.x,
      y: b.y,
      hit: false,
      powerUp: b.powerUp,
    }));
  }

  protected async onPlayStart(): Promise<void> {
    this.lastTick = Date.now();
    this.physicsInterval = setInterval(() => this.physicsTick(), 50);
    this.broadcastMarioState();
  }

  private physicsTick(): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;

    // Move Goombas
    for (const g of this.goombas) {
      if (!g.alive) continue;
      g.x += g.vx * dt;
      if (g.x <= g.minX || g.x >= g.maxX - GOOMBA_W) {
        g.vx *= -1;
        g.x = Math.max(g.minX, Math.min(g.maxX - GOOMBA_W, g.x));
      }
    }

    // Expire power-ups
    for (const s of this.playerStates.values()) {
      if (s.powerUp && now > s.powerUpExpiry) s.powerUp = null;
      // Respawn dead players
      if (s.dead && now >= s.respawnAt) {
        s.dead = false;
        s.x = Math.max(80, s.x - 200); // respawn a bit behind
        s.y = PLAYER_START.y;
      }
    }

    this.broadcastMarioState();
  }

  protected onInput(
    playerId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void {
    const state = this.playerStates.get(playerId);
    if (!state || state.finished) return;

    switch (input.type) {
      case 'position_update': {
        if (state.dead) return;
        const nx = Number(input.payload.x);
        const ny = Number(input.payload.y);
        if (isFinite(nx) && isFinite(ny)) {
          state.x = Math.max(0, Math.min(LEVEL_WIDTH, nx));
          state.y = ny;
        }
        break;
      }

      case 'block_hit': {
        const block = this.blocks.find(b => b.id === input.payload.blockId && !b.hit);
        if (!block) break;
        const dx = Math.abs(state.x - block.x);
        const dy = Math.abs(state.y - (block.y + BLOCK_SIZE));
        if (dx > 80 || dy > 80) break; // sanity check

        block.hit = true;
        if (block.powerUp) {
          const pu: PowerUpItem = {
            id: `pu_${block.id}`,
            x: block.x,
            y: block.y - 40,
            type: block.powerUp,
            collected: false,
          };
          this.powerUps.push(pu);
          this.io.to(this.config.roomId).emit('mario:block_hit' as any, {
            blockId: block.id, powerUpId: pu.id, type: pu.type,
          });
        } else {
          this.io.to(this.config.roomId).emit('mario:block_hit' as any, {
            blockId: block.id, powerUpId: null, type: null,
          });
        }
        break;
      }

      case 'powerup_collect': {
        const pu = this.powerUps.find(p => p.id === input.payload.powerUpId && !p.collected);
        if (!pu) break;
        const dx = Math.abs(state.x - pu.x);
        const dy = Math.abs(state.y - pu.y);
        if (dx > 80 || dy > 80) break;

        pu.collected = true;
        state.powerUp = pu.type;
        state.powerUpExpiry = Date.now() + 8000;
        this.io.to(this.config.roomId).emit('mario:powerup_collected' as any, {
          playerId, powerUpId: pu.id, type: pu.type,
        });
        break;
      }

      case 'goomba_stomp': {
        const goomba = this.goombas.find(g => g.id === input.payload.goombaId && g.alive);
        if (!goomba) break;
        const dx = Math.abs(state.x - goomba.x);
        if (dx > 80) break;

        goomba.alive = false;
        this.addScore(playerId, 50);
        this.io.to(this.config.roomId).emit('mario:goomba_stomped' as any, {
          goombaId: goomba.id, playerId,
        });
        break;
      }

      case 'player_hit': {
        if (state.powerUp !== 'star') break;
        const targetId = input.payload.targetId as string;
        const target = this.playerStates.get(targetId);
        if (!target || target.powerUp === 'star' || target.dead || target.finished) break;
        const dx = Math.abs(state.x - target.x);
        const dy = Math.abs(state.y - target.y);
        if (dx > 80 || dy > 80) break;

        target.dead = true;
        target.respawnAt = Date.now() + 3000;
        this.io.to(this.config.roomId).emit('mario:player_hit' as any, {
          attackerId: playerId, targetId,
        });
        break;
      }

      case 'level_complete': {
        if (state.x < PIPE.x - 80) break; // must be near pipe

        state.finished = true;
        this.finishCount++;
        state.finishRank = this.finishCount;

        const rankPts = [1000, 700, 500, 300, 200, 100];
        const pts = rankPts[this.finishCount - 1] ?? 100;
        this.addScore(playerId, pts);

        this.io.to(this.config.roomId).emit('mario:player_finished' as any, {
          playerId, rank: this.finishCount, points: pts,
        });

        // End early if everyone finished
        const total = this.playerStates.size;
        if (this.finishCount >= total) {
          setTimeout(() => {
            if (this.isRunning) {
              this.clearTimers();
              this.isRunning = false;
              this.phase = 'results';
              this.broadcastState();
              const results = this.buildResults();
              this.io.to(this.config.roomId).emit('game:end', results);
              this.emit('ended', results);
            }
          }, 2000);
        }
        break;
      }
    }
  }

  protected onTick(_remaining: number): void { /* physics handled separately */ }

  private broadcastMarioState(): void {
    const players: Record<string, { x: number; y: number; powerUp: string | null; finished: boolean; dead: boolean; rank: number }> = {};
    for (const [id, s] of this.playerStates) {
      players[id] = { x: s.x, y: s.y, powerUp: s.powerUp, finished: s.finished, dead: s.dead, rank: s.finishRank };
    }
    this.io.to(this.config.roomId).emit('mario:state' as any, {
      players,
      goombas: this.goombas.map(g => ({ id: g.id, x: g.x, y: g.y, alive: g.alive })),
      blocks: this.blocks.map(b => ({ id: b.id, hit: b.hit })),
      powerUps: this.powerUps.filter(p => !p.collected).map(p => ({ id: p.id, x: p.x, y: p.y, type: p.type })),
    });
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
  }

  protected override triggerChaos(): void {
    // Mario chaos: spawn bonus Goombas
    const playerXs = [...this.playerStates.values()].map(s => s.x);
    const avgX = playerXs.reduce((a, b) => a + b, 0) / (playerXs.length || 1);
    const spawnX = Math.min(avgX + 300, LEVEL_WIDTH - 200);
    this.goombas.push({
      id: `chaos_${Date.now()}`,
      x: spawnX,
      y: GROUND_Y - GOOMBA_H,
      vx: -GOOMBA_SPEED * 1.5,
      minX: Math.max(0, spawnX - 300),
      maxX: Math.min(LEVEL_WIDTH, spawnX + 300),
      alive: true,
    });
    this.io.to(this.config.roomId).emit('chaos:announcement', '👾 GOOMBA INVASION!');
  }

  protected getGameData(): unknown {
    const players: Record<string, { x: number; finished: boolean; rank: number }> = {};
    for (const [id, s] of this.playerStates) {
      players[id] = { x: s.x, finished: s.finished, rank: s.finishRank };
    }
    return { players };
  }

  protected buildResults(): GameResults {
    const leaderboard = this.getLeaderboard();
    const resultPlayers: PlayerResult[] = leaderboard.map((entry, idx) => {
      const s = this.playerStates.get(entry.playerId);
      return {
        playerId: entry.playerId,
        username: '',
        avatar: '',
        color: '',
        roundScore: entry.score,
        totalScore: this.totalScores[entry.playerId] ?? 0,
        rank: idx + 1,
        stats: {
          finished: s?.finished ? 1 : 0,
          finishRank: s?.finishRank ?? 0,
        },
      };
    });

    const topFinisher = [...this.playerStates.entries()]
      .filter(([, s]) => s.finished)
      .sort(([, a], [, b]) => a.finishRank - b.finishRank)[0];

    const highlights: string[] = [];
    if (topFinisher) highlights.push(`🏁 First to finish!`);
    if (this.finishCount === 0) highlights.push('⏱️ Nobody reached the pipe — so close!');

    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: leaderboard[0]?.playerId ?? '',
      highlights,
    };
  }
}
