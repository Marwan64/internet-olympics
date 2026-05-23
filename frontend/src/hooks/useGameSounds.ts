'use client';
// Unique procedural Web Audio sounds for each game in Internet Olympics
// All sounds are synthesized — no audio files required.

let _ctx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function gain(value: number, start?: number): GainNode {
  const g = ctx().createGain();
  g.gain.setValueAtTime(value, start ?? ctx().currentTime);
  return g;
}

function osc(type: OscillatorType, freq: number, start: number, end: number, g: GainNode) {
  const o = ctx().createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  o.connect(g);
  o.start(start);
  o.stop(end);
}

function ramp(param: AudioParam, from: number, to: number, atTime: number, duration: number) {
  param.setValueAtTime(from, atTime);
  param.exponentialRampToValueAtTime(Math.max(to, 0.001), atTime + duration);
}

function noise(dur: number, vol: number, filterFreq: number, filterType: BiquadFilterType = 'bandpass'): void {
  const c = ctx();
  const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur);
}

// ─────────────────────────────────────────────
//  FLOOR IS LAVA
// ─────────────────────────────────────────────
export function lava_batSwing() {
  // Whoosh: high-pass filtered noise sweep
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.22, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass';
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(3500, t + 0.1);
  f.frequency.exponentialRampToValueAtTime(800, t + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.55, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.22);

  // Impact thud
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t + 0.05);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const gImpact = c.createGain();
  gImpact.gain.setValueAtTime(0.35, t + 0.05);
  gImpact.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(gImpact); gImpact.connect(c.destination);
  o.start(t + 0.05); o.stop(t + 0.18);
}

export function lava_jump() {
  // Satisfying boing — sine with fast attack, slight pitch fall
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(440, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.22);
}

export function lava_death() {
  // Descending sizzle — falling tone + noise burst
  const c = ctx(); const t = c.currentTime;
  noise(0.6, 0.4, 1200, 'bandpass');

  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(600, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.55);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.55);
}

export function lava_hitPlayer() {
  // Short hit feedback when bat connects with a player
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.12);
}

// ─────────────────────────────────────────────
//  PHYSICS SOCCER
// ─────────────────────────────────────────────
export function soccer_kick() {
  // Sharp thud — low thump + click
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.1);
  noise(0.05, 0.25, 2000, 'highpass');
}

export function soccer_goal() {
  // Air horn + ascending fanfare
  const c = ctx(); const t = c.currentTime;

  // Air horn: rich sawtooth at 233 Hz (Bb3)
  const horn = c.createOscillator(); horn.type = 'sawtooth';
  horn.frequency.setValueAtTime(233, t);
  const hornGain = c.createGain();
  hornGain.gain.setValueAtTime(0.0, t);
  hornGain.gain.linearRampToValueAtTime(0.35, t + 0.03);
  hornGain.gain.setValueAtTime(0.35, t + 0.6);
  hornGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  horn.connect(hornGain); hornGain.connect(c.destination);
  horn.start(t); horn.stop(t + 0.8);

  // Fanfare: 3-note ascending arpeggio
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + 0.85 + i * 0.12);
    g.gain.linearRampToValueAtTime(0.18, t + 0.87 + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.97 + i * 0.12);
    o.connect(g); g.connect(c.destination);
    o.start(t + 0.85 + i * 0.12); o.stop(t + 1.0 + i * 0.12);
  });
}

export function soccer_dash() {
  // Quick burst whoosh
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.18, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(800, t);
  f.frequency.exponentialRampToValueAtTime(3000, t + 0.08);
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.18);
}

export function soccer_wallHit() {
  // Light bounce sound
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(280, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.1);
}

// ─────────────────────────────────────────────
//  RAGE OBBY
// ─────────────────────────────────────────────
export function obby_jump() {
  // Bouncy spring boing — fast pitch up
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(340, t + 0.16);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.2);
}

export function obby_death() {
  // Rage death: descending tri + ticking noise
  const c = ctx(); const t = c.currentTime;
  // Falling whine
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(800, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.7);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.setValueAtTime(0.25, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.7);
  // Splat noise
  noise(0.18, 0.45, 600, 'lowpass');
}

export function obby_checkpoint() {
  // Pleasant bell ding — sine pair
  const c = ctx(); const t = c.currentTime;
  const freqs = [880, 1320]; // A5, E6 — perfect fifth
  freqs.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + i * 0.05);
    g.gain.linearRampToValueAtTime(0.22, t + i * 0.05 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.55);
    o.connect(g); g.connect(c.destination);
    o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.6);
  });
}

export function obby_spikeDeath() {
  // Sharp impale — high click + low thud
  const c = ctx(); const t = c.currentTime;
  noise(0.06, 0.5, 5000, 'highpass');
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(80, t + 0.02);
  o.frequency.exponentialRampToValueAtTime(35, t + 0.14);
  const g = c.createGain();
  g.gain.setValueAtTime(0.4, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g); g.connect(c.destination);
  o.start(t + 0.02); o.stop(t + 0.16);
}

// ─────────────────────────────────────────────
//  MARIO RACE
// ─────────────────────────────────────────────
export function mario_jump() {
  // Classic square wave pitch rise
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(300, t);
  o.frequency.exponentialRampToValueAtTime(600, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.16);
}

export function mario_blockHit() {
  // Block bump — low square thud
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.1);
  noise(0.05, 0.2, 800, 'bandpass');
}

export function mario_powerUp() {
  // 8-bit ascending arpeggio
  const c = ctx(); const t = c.currentTime;
  const scale = [523, 659, 784, 1047]; // C5 E5 G5 C6
  scale.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + i * 0.08);
    g.gain.linearRampToValueAtTime(0.16, t + i * 0.08 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.1);
    o.connect(g); g.connect(c.destination);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.12);
  });
}

export function mario_stomp() {
  // Enemy stomp — quick low thud
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  const g = c.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.12);
}

export function mario_finish() {
  // Finish fanfare — bright ascending 8-bit
  const c = ctx(); const t = c.currentTime;
  const melody = [523, 659, 784, 1047, 784, 1047]; // C E G C G C
  const timings = [0, 0.1, 0.2, 0.3, 0.42, 0.54];
  melody.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + timings[i]);
    g.gain.linearRampToValueAtTime(0.2, t + timings[i] + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + timings[i] + 0.14);
    o.connect(g); g.connect(c.destination);
    o.start(t + timings[i]); o.stop(t + timings[i] + 0.16);
  });
}

// ─────────────────────────────────────────────
//  KNOCKBACK ARENA
// ─────────────────────────────────────────────
export function arena_punch() {
  // Heavy impact — layered thud
  const c = ctx(); const t = c.currentTime;
  // Low body
  const o1 = c.createOscillator(); o1.type = 'sine';
  o1.frequency.setValueAtTime(150, t);
  o1.frequency.exponentialRampToValueAtTime(50, t + 0.1);
  const g1 = c.createGain();
  g1.gain.setValueAtTime(0.5, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o1.connect(g1); g1.connect(c.destination);
  o1.start(t); o1.stop(t + 0.12);
  // High click
  noise(0.04, 0.35, 3500, 'highpass');
  // Mid grunt
  const o2 = c.createOscillator(); o2.type = 'sawtooth';
  o2.frequency.setValueAtTime(300, t + 0.01);
  o2.frequency.exponentialRampToValueAtTime(80, t + 0.07);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.18, t + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o2.connect(g2); g2.connect(c.destination);
  o2.start(t + 0.01); o2.stop(t + 0.09);
}

export function arena_punchHit() {
  // Punch that connects — more dramatic
  const c = ctx(); const t = c.currentTime;
  arena_punch();
  // Extra crunch layer
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(80, t + 0.02);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(c.destination);
  o.start(t + 0.02); o.stop(t + 0.2);
}

export function arena_ko() {
  // Dramatic KO — downward crash + silence beat + boom
  const c = ctx(); const t = c.currentTime;
  // Crash cymbal (noise)
  const buf = c.createBuffer(1, c.sampleRate * 0.8, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.7);

  // Low boom after beat
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t + 0.3);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.75);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0, t + 0.3);
  g2.gain.linearRampToValueAtTime(0.6, t + 0.33);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(g2); g2.connect(c.destination);
  o.start(t + 0.3); o.stop(t + 0.82);

  // "KO" pitch melody: G4-E4
  const notes = [392, 330];
  notes.forEach((freq, i) => {
    const no = c.createOscillator(); no.type = 'square';
    no.frequency.value = freq;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.18, t + 0.85 + i * 0.15);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.85 + i * 0.15 + 0.18);
    no.connect(ng); ng.connect(c.destination);
    no.start(t + 0.85 + i * 0.15); no.stop(t + 1.05 + i * 0.15);
  });
}

export function arena_dash() {
  // Rapid burst — short noise sweep up
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(200, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.15);
}

// ─────────────────────────────────────────────
//  SHOPPING CART RACING
// ─────────────────────────────────────────────
export function cart_drift() {
  // Tire screech — pitched noise sustained
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 3;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.06);
  g.gain.setValueAtTime(0.4, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.52);

  // Pitch layer
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.setValueAtTime(200, t + 0.1);
  const og = c.createGain();
  og.gain.setValueAtTime(0.08, t + 0.05);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(og); og.connect(c.destination);
  o.start(t + 0.04); o.stop(t + 0.46);
}

export function cart_boost() {
  // Turbo boost — rising tone burst
  const c = ctx(); const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.22);
  // Whoosh
  noise(0.2, 0.3, 1800, 'bandpass');
}

export function cart_collision() {
  // Metal crash — noise burst + low resonance
  const c = ctx(); const t = c.currentTime;
  noise(0.35, 0.55, 1200, 'bandpass');
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(140, t + 0.02);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.4, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(g); g.connect(c.destination);
  o.start(t + 0.02); o.stop(t + 0.33);
}

export function cart_finish() {
  // Shopping bell — cheerful jingle ding
  const c = ctx(); const t = c.currentTime;
  const bells = [1047, 1319, 1568, 2093]; // C6 E6 G6 C7
  bells.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + i * 0.1);
    g.gain.linearRampToValueAtTime(0.25, t + i * 0.1 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.6);
    o.connect(g); g.connect(c.destination);
    o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.65);
  });
  // Harmony
  const harmony = [1319, 1047]; // invert
  harmony.forEach((freq, i) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0, t + 0.45 + i * 0.1);
    g.gain.linearRampToValueAtTime(0.12, t + 0.46 + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.46 + i * 0.1 + 0.5);
    o.connect(g); g.connect(c.destination);
    o.start(t + 0.45 + i * 0.1); o.stop(t + 0.97 + i * 0.1);
  });
}
