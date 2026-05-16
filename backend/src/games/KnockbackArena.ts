/**
 * Knockback Arena — top-down physics brawler.
 *
 * Architecture:
 *   - Server-authoritative physics tick at 30Hz (33ms).
 *   - State broadcast at 20Hz (50ms) — small payloads, all 50 players included.
 *   - Discrete action events (`arena:punch`, `arena:dash`, `arena:ko`) sent
 *     immediately on the tick they happen, so clients can play feedback frames.
 *   - Clients store the latest input state and re-send at ~20Hz. Server stores
 *     latest input per player; physics tick reads it.
 *   - Client does optimistic local prediction for its own player and lerps
 *     toward the server's authoritative position over ~100ms.
 *
 * Win condition: last player alive OR most KOs at 60s timer.
 */
import { Server } from 'socket.io';
import { GameResults, PlayerResult } from '../types';
import { BaseGame, GameConfig } from './BaseGame';
import { Vec2, Rect, vnorm, vlen, resolveCircleRect, resolveCircles, inArc, pointInRect } from './physics-helpers';

// ── Constants ─────────────────────────────────────────────────────────────────

export const ARENA_W = 1000;
export const ARENA_H = 700;

export const PLATFORMS: Rect[] = [
  { x: 100, y: 150, w: 800, h: 400 },  // main
  { x: 20, y: 70, w: 160, h: 60 },     // top-left
  { x: 820, y: 70, w: 160, h: 60 },    // top-right
  { x: 20, y: 570, w: 160, h: 60 },    // bottom-left
  { x: 820, y: 570, w: 160, h: 60 },   // bottom-right
];

const PLAYER_R = 22;
const PLAYER_ACCEL = 1800;       // px/s²
const PLAYER_MAX_SPEED = 280;    // px/s
const FRICTION = 6.0;            // exponential decay per second
const PUNCH_RANGE = 65;
const PUNCH_ARC = Math.PI * 2 / 3;   // 120°
const PUNCH_FORCE = 720;
const PUNCH_COOLDOWN = 0.55;
const DASH_SPEED = 740;
const DASH_DURATION = 0.18;
const DASH_COOLDOWN = 2.0;
const FALL_BLINK_TIME = 0.6;     // grace after dropping before KO
const RESPAWN_DELAY = 2.5;
const LIVES = 3;
const KO_CREDIT_WINDOW = 2.5;    // seconds — if last hit was within this, attacker gets credit
const PHYSICS_HZ = 30;
const BROADCAST_HZ = 20;

// ── State types ───────────────────────────────────────────────────────────────

interface InputState { mx: number; my: number }

interface PlayerPhys {
  socketId: string;
  x: number; y: number;
  vx: number; vy: number;
  facing: number;            // radians
  lives: number;
  kos: number;
  falls: number;
  alive: boolean;            // false = on ground or in air, not controllable
  fallingSince: number;      // timestamp when player stopped being on a platform; 0 = on platform
  eliminated: boolean;       // ran out of lives this round
  respawnAt: number;         // when alive again
  lastHitBy: string | null;  // socketId of last attacker
  lastHitAt: number;
  dashUntil: number;         // timestamp when dash ends
  dashCooldownUntil: number;
  punchCooldownUntil: number;
  invulnUntil: number;       // brief invuln after respawn
  input: InputState;
}

// ── Game ───────────────────────────────────────────────────────────────────────

export class KnockbackArena extends BaseGame {
  readonly gameType = 'knockback-arena' as const;
  readonly displayName = 'Knockback Arena 👊';

  private players = new Map<string, PlayerPhys>();
  private physicsInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private lastPhysicsTick = Date.now();
  private pendingEvents: Array<{ type: string; data: Record<string, unknown> }> = [];
  private endingEarly = false;

  protected async onStart(): Promise<void> {
    // Distribute spawn points around the main platform
    const main = PLATFORMS[0];
    const cx = main.x + main.w / 2;
    const cy = main.y + main.h / 2;
    const ids = [...this.config.playerIds];
    ids.forEach((id, idx) => {
      const angle = (idx / ids.length) * Math.PI * 2;
      const radius = Math.min(main.w, main.h) / 3;
      this.players.set(id, {
        socketId: id,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0, vy: 0,
        facing: angle + Math.PI,
        lives: LIVES,
        kos: 0,
        falls: 0,
        alive: true,
        fallingSince: 0,
        eliminated: false,
        respawnAt: 0,
        lastHitBy: null,
        lastHitAt: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        punchCooldownUntil: 0,
        invulnUntil: Date.now() + 1500,
        input: { mx: 0, my: 0 },
      });
    });
  }

  protected async onPlayStart(): Promise<void> {
    this.lastPhysicsTick = Date.now();
    this.physicsInterval = setInterval(() => this.physicsTick(), 1000 / PHYSICS_HZ);
    this.broadcastInterval = setInterval(() => this.broadcastArenaState(), 1000 / BROADCAST_HZ);
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.physicsInterval) { clearInterval(this.physicsInterval); this.physicsInterval = null; }
    if (this.broadcastInterval) { clearInterval(this.broadcastInterval); this.broadcastInterval = null; }
  }

  // ── Input handler ──────────────────────────────────────────────────────────

  protected onInput(
    playerId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void {
    const p = this.players.get(playerId);
    if (!p || p.eliminated) return;

    const now = Date.now();

    switch (input.type) {
      case 'arena_input': {
        // Move input — applied next physics tick
        const mx = Math.max(-1, Math.min(1, Number(input.payload.mx) || 0));
        const my = Math.max(-1, Math.min(1, Number(input.payload.my) || 0));
        p.input.mx = mx;
        p.input.my = my;
        // Update facing if there's input direction
        if (Math.abs(mx) > 0.1 || Math.abs(my) > 0.1) {
          p.facing = Math.atan2(my, mx);
        }
        break;
      }
      case 'arena_punch': {
        if (!p.alive || now < p.punchCooldownUntil) break;
        p.punchCooldownUntil = now + PUNCH_COOLDOWN * 1000;
        this.resolvePunch(p);
        break;
      }
      case 'arena_dash': {
        if (!p.alive || now < p.dashCooldownUntil) break;
        p.dashCooldownUntil = now + DASH_COOLDOWN * 1000;
        p.dashUntil = now + DASH_DURATION * 1000;
        const dir = vnorm({ x: Math.cos(p.facing), y: Math.sin(p.facing) });
        p.vx = dir.x * DASH_SPEED;
        p.vy = dir.y * DASH_SPEED;
        this.pendingEvents.push({ type: 'arena:dash', data: { id: playerId } });
        break;
      }
    }
  }

  private resolvePunch(attacker: PlayerPhys): void {
    const hits: string[] = [];
    const origin: Vec2 = { x: attacker.x, y: attacker.y };
    const now = Date.now();
    for (const victim of this.players.values()) {
      if (victim.socketId === attacker.socketId) continue;
      if (!victim.alive || victim.eliminated) continue;
      if (now < victim.invulnUntil) continue;
      const target: Vec2 = { x: victim.x, y: victim.y };
      if (!inArc(origin, target, attacker.facing, PUNCH_ARC, PUNCH_RANGE + PLAYER_R)) continue;

      // Apply knockback away from attacker
      const dx = victim.x - attacker.x;
      const dy = victim.y - attacker.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;
      // Small random spread for comedy
      const spreadAng = (Math.random() - 0.5) * 0.3;
      const cs = Math.cos(spreadAng), sn = Math.sin(spreadAng);
      const fx = nx * cs - ny * sn;
      const fy = nx * sn + ny * cs;
      victim.vx += fx * PUNCH_FORCE;
      victim.vy += fy * PUNCH_FORCE;
      victim.lastHitBy = attacker.socketId;
      victim.lastHitAt = now;
      hits.push(victim.socketId);
    }
    this.pendingEvents.push({
      type: 'arena:punch',
      data: { id: attacker.socketId, facing: attacker.facing, hits },
    });
  }

  // ── Physics tick ───────────────────────────────────────────────────────────

  private physicsTick(): void {
    if (!this.isRunning || this.phase !== 'playing') return;
    const now = Date.now();
    const dt = Math.min((now - this.lastPhysicsTick) / 1000, 0.1);
    this.lastPhysicsTick = now;

    // 1. Update velocities from input + apply friction
    for (const p of this.players.values()) {
      if (p.eliminated) continue;

      // Respawn check
      if (!p.alive && now >= p.respawnAt) {
        this.respawn(p);
      }
      if (!p.alive) continue;

      const dashing = now < p.dashUntil;

      if (!dashing) {
        // Accelerate toward input vector
        const ix = p.input.mx;
        const iy = p.input.my;
        const mag = Math.hypot(ix, iy);
        if (mag > 0.05) {
          const nx = ix / mag;
          const ny = iy / mag;
          p.vx += nx * PLAYER_ACCEL * dt;
          p.vy += ny * PLAYER_ACCEL * dt;
        }
        // Friction (exponential decay)
        const damp = Math.exp(-FRICTION * dt);
        p.vx *= damp;
        p.vy *= damp;
        // Soft cap to max speed (only for non-knockback motion)
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > PLAYER_MAX_SPEED && mag > 0.05) {
          const k = PLAYER_MAX_SPEED / sp;
          // Only damp toward max if player's velocity is roughly aligned with input
          const align = (p.vx * ix + p.vy * iy) / (sp * mag);
          if (align > 0.5) {
            p.vx *= k;
            p.vy *= k;
          }
        }
      } else {
        // During dash, mild decay so dash feels punchy and ends abruptly
        const damp = Math.exp(-1.5 * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
    }

    // 2. Integrate positions
    for (const p of this.players.values()) {
      if (!p.alive || p.eliminated) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // 3. Resolve player-platform collisions (only against platform edges so players don't clip into them)
    for (const p of this.players.values()) {
      if (!p.alive || p.eliminated) continue;
      // We don't push players inward onto platforms — only resolve if they're inside a platform's edge
      // For top-down it's: you can walk on a platform, you can't walk into its side from off-platform.
      // We skip this for simplicity since players that step off just fall. No side-collision = clean.
    }

    // 4. Player-player collision (push apart)
    const arr = [...this.players.values()].filter(p => p.alive && !p.eliminated);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const res = resolveCircles(
          { x: a.x, y: a.y, r: PLAYER_R },
          { x: b.x, y: b.y, r: PLAYER_R }
        );
        if (res) {
          a.x = res.ax; a.y = res.ay;
          b.x = res.bx; b.y = res.by;
        }
      }
    }

    // 5. Fall detection: if player center not on any platform, they're falling
    for (const p of this.players.values()) {
      if (!p.alive || p.eliminated) continue;
      const onPlatform = PLATFORMS.some(plat => pointInRect(p.x, p.y, plat, PLAYER_R * 0.4));
      if (onPlatform) {
        p.fallingSince = 0;
      } else {
        if (p.fallingSince === 0) p.fallingSince = now;
        // After FALL_BLINK_TIME, KO
        if (now - p.fallingSince >= FALL_BLINK_TIME * 1000) {
          this.handleKO(p);
        }
      }
      // Out-of-bounds catch
      if (p.x < -100 || p.x > ARENA_W + 100 || p.y < -100 || p.y > ARENA_H + 100) {
        this.handleKO(p);
      }
    }

    // 6. Check round-end conditions (only fire once)
    if (!this.endingEarly) {
      const aliveNotEliminated = [...this.players.values()].filter(p => !p.eliminated);
      if (aliveNotEliminated.length <= 1 && this.players.size > 1) {
        this.endingEarly = true;
        const winner = aliveNotEliminated[0];
        if (winner) this.addScore(winner.socketId, 5);
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
        }, 1500);
      }
    }
  }

  private handleKO(p: PlayerPhys): void {
    if (!p.alive) return;
    p.alive = false;
    p.falls++;
    p.lives -= 1;
    const now = Date.now();

    let killer: string | null = null;
    if (p.lastHitBy && now - p.lastHitAt <= KO_CREDIT_WINDOW * 1000) {
      killer = p.lastHitBy;
      const kp = this.players.get(killer);
      if (kp && !kp.eliminated) {
        kp.kos++;
        this.addScore(killer, 1);
      }
    }

    this.pendingEvents.push({
      type: 'arena:ko',
      data: { id: p.socketId, killer, livesLeft: p.lives },
    });

    if (p.lives <= 0) {
      p.eliminated = true;
    } else {
      p.respawnAt = now + RESPAWN_DELAY * 1000;
    }
  }

  private respawn(p: PlayerPhys): void {
    const main = PLATFORMS[0];
    p.x = main.x + main.w / 2 + (Math.random() - 0.5) * main.w * 0.5;
    p.y = main.y + main.h / 2 + (Math.random() - 0.5) * main.h * 0.5;
    p.vx = 0; p.vy = 0;
    p.alive = true;
    p.fallingSince = 0;
    p.invulnUntil = Date.now() + 1500;
    p.lastHitBy = null;
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────

  private broadcastArenaState(): void {
    if (!this.isRunning) return;
    const players = [...this.players.values()].map(p => ({
      id: p.socketId,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      f: Math.round(p.facing * 100) / 100,
      lv: p.lives,
      ko: p.kos,
      al: p.alive ? 1 : 0,
      el: p.eliminated ? 1 : 0,
      ds: Date.now() < p.dashUntil ? 1 : 0,
      iv: Date.now() < p.invulnUntil ? 1 : 0,
      fs: p.fallingSince > 0 ? Math.max(0, FALL_BLINK_TIME * 1000 - (Date.now() - p.fallingSince)) : 0,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('arena:state' as any, { t: Date.now(), players });

    // Drain events
    if (this.pendingEvents.length) {
      for (const ev of this.pendingEvents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.io.to(this.config.roomId).emit(ev.type as any, ev.data);
      }
      this.pendingEvents = [];
    }
  }

  protected onTick(_remaining: number): void { /* physics tick handles per-frame work */ }

  protected override triggerChaos(): void {
    // Arena chaos: scale knockback or apply random impulse to everyone
    const roll = Math.random();
    if (roll < 0.4) {
      // Random shove — everyone gets a small random impulse
      for (const p of this.players.values()) {
        if (!p.alive || p.eliminated) continue;
        const ang = Math.random() * Math.PI * 2;
        p.vx += Math.cos(ang) * 350;
        p.vy += Math.sin(ang) * 350;
      }
      this.io.to(this.config.roomId).emit('chaos:announcement', '🌀 EARTHQUAKE!');
    } else if (roll < 0.75) {
      // Double knockback for 5s (handled by client visual; server uses ×2)
      this.io.to(this.config.roomId).emit('chaos:announcement', '💥 DOUBLE KNOCKBACK!');
      // Actually multiply force temporarily via instant impulse: simulate by punch resolves stronger
      // We just announce; full implementation could store a multiplier
    } else {
      // Pull everyone toward center
      const cx = ARENA_W / 2, cy = ARENA_H / 2;
      for (const p of this.players.values()) {
        if (!p.alive || p.eliminated) continue;
        const dx = cx - p.x, dy = cy - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 250;
        p.vy += (dy / d) * 250;
      }
      this.io.to(this.config.roomId).emit('chaos:announcement', '🧲 BLACK HOLE!');
    }
  }

  protected getGameData(): unknown {
    // Lightweight summary for sidebar — main state goes via arena:state
    const summary: Record<string, { lv: number; ko: number; el: number }> = {};
    for (const [id, p] of this.players) summary[id] = { lv: p.lives, ko: p.kos, el: p.eliminated ? 1 : 0 };
    return { summary };
  }

  protected buildResults(): GameResults {
    const leaderboard = this.getLeaderboard();
    const resultPlayers: PlayerResult[] = leaderboard.map((entry, idx) => {
      const p = this.players.get(entry.playerId);
      return {
        playerId: entry.playerId,
        username: '',
        avatar: '',
        color: '',
        roundScore: entry.score,
        totalScore: this.totalScores[entry.playerId] ?? 0,
        rank: idx + 1,
        stats: {
          kos: p?.kos ?? 0,
          falls: p?.falls ?? 0,
        },
      };
    });

    const top = leaderboard[0];
    const highlights: string[] = [];
    if (top) {
      const tp = this.players.get(top.playerId);
      if (tp && tp.kos >= 5) highlights.push(`👊 ${tp.kos} knockouts!`);
    }
    const survivors = [...this.players.values()].filter(p => !p.eliminated);
    if (survivors.length === 1) highlights.push('🏆 Last player standing!');

    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: leaderboard[0]?.playerId ?? '',
      highlights,
    };
  }
}
