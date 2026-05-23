'use client';
import { useRef, useCallback } from 'react';

// Singleton AudioContext shared across all hook instances
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function beep(freq: number, dur: number, vol = 0.09, type: OscillatorType = 'sine', delay = 0) {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.connect(g); g.connect(c.destination);
  osc.type = type; osc.frequency.value = freq;
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.02);
}

export function useSounds() {
  const sfxOn = useRef<boolean>(
    typeof window !== 'undefined' ? localStorage.getItem('io_sfx') !== '0' : true
  );

  // Ambient music state
  const musicRef = useRef<{ master: GainNode; oscs: OscillatorNode[] } | null>(null);

  // ── SFX ────────────────────────────────────────────────────────────────────

  const click = useCallback(() => {
    if (!sfxOn.current) return;
    beep(600, 0.07, 0.08);
  }, []);

  const confirm = useCallback(() => {
    if (!sfxOn.current) return;
    [440, 554, 659].forEach((f, i) => beep(f, 0.22, 0.08, 'sine', i * 0.07));
  }, []);

  const tick = useCallback((last = false) => {
    if (!sfxOn.current) return;
    beep(last ? 880 : 440, 0.08, 0.07, 'square');
  }, []);

  const gameStart = useCallback(() => {
    if (!sfxOn.current) return;
    [261, 329, 392, 523, 659].forEach((f, i) => beep(f, 0.3, 0.09, 'triangle', i * 0.07));
  }, []);

  const win = useCallback(() => {
    if (!sfxOn.current) return;
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => beep(f, 0.32, 0.09, 'triangle', i * 0.1));
  }, []);

  const copy = useCallback(() => {
    if (!sfxOn.current) return;
    beep(900, 0.06, 0.07); beep(1200, 0.06, 0.07, 'sine', 0.07);
  }, []);

  const toggleSfx = useCallback(() => {
    sfxOn.current = !sfxOn.current;
    if (typeof window !== 'undefined') localStorage.setItem('io_sfx', sfxOn.current ? '1' : '0');
    return sfxOn.current;
  }, []);

  // ── Ambient music ──────────────────────────────────────────────────────────

  const startMusic = useCallback(() => {
    const c = getCtx(); if (!c || musicRef.current) return;
    const master = c.createGain();
    master.gain.setValueAtTime(0, c.currentTime);
    master.gain.linearRampToValueAtTime(0.03, c.currentTime + 2.5);
    master.connect(c.destination);

    const oscs: OscillatorNode[] = [];
    // Dark ambient pad — A minor drone: A1, E2, A2, C3
    [[55,'sine',0.5],[82.4,'sine',0.3],[110,'triangle',0.22],[130.8,'sine',0.15]].forEach(([freq, type, vol], i) => {
      const osc = c.createOscillator() as OscillatorNode;
      const g   = c.createGain();
      const lfo = c.createOscillator() as OscillatorNode;
      const lfoG = c.createGain();
      lfo.frequency.value = 0.04 + i * 0.025;
      lfoG.gain.value = 1.2;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      osc.type  = type as OscillatorType;
      osc.frequency.value = freq as number;
      g.gain.value = vol as number;
      osc.connect(g); g.connect(master);
      osc.start(); lfo.start();
      oscs.push(osc, lfo);
    });
    musicRef.current = { master, oscs };
  }, []);

  const stopMusic = useCallback(() => {
    if (!musicRef.current) return;
    const c = getCtx(); if (!c) return;
    const { master, oscs } = musicRef.current;
    master.gain.setValueAtTime(master.gain.value, c.currentTime);
    master.gain.linearRampToValueAtTime(0, c.currentTime + 1.5);
    setTimeout(() => {
      oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
      musicRef.current = null;
    }, 1700);
  }, []);

  const toggleMusic = useCallback(() => {
    if (musicRef.current) stopMusic(); else startMusic();
    return !musicRef.current;
  }, [startMusic, stopMusic]);

  const isMusicPlaying = useCallback(() => !!musicRef.current, []);

  return { click, confirm, tick, gameStart, win, copy, toggleSfx, toggleMusic, startMusic, stopMusic, isMusicPlaying, sfxOn };
}
