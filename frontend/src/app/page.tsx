'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocket } from '@/hooks/useSocket';
import { AVATAR_OPTIONS, COLOR_OPTIONS } from '@/types';
import LobbyRoom from '@/components/lobby/LobbyRoom';
import GameScreen from '@/components/games/GameScreen';
import PodiumScreen from '@/components/ui/PodiumScreen';
import ToastContainer from '@/components/ui/ToastContainer';

// ── Floating Particle ─────────────────────────────────────────────────────────

function Particle({ delay, color }: { delay: number; color: string }) {
  const left = Math.random() * 100;
  const duration = 8 + Math.random() * 12;
  const drift = (Math.random() - 0.5) * 200;

  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${left}%`,
        bottom: '-10px',
        width: Math.random() * 4 + 2,
        height: Math.random() * 4 + 2,
        background: color,
        boxShadow: `0 0 6px ${color}`,
        '--drift': `${drift}px`,
      } as React.CSSProperties}
      animate={{
        y: [0, -(window?.innerHeight ?? 800) - 50],
        x: [0, drift],
        opacity: [0, 0.8, 0.8, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

const PARTICLE_COLORS = ['#7C3AED', '#06B6D4', '#EC4899', '#F59E0B', '#10B981'];
const GAMES_SHOWCASE = [
  { emoji: '⌨️', name: 'Speed Typing Chaos', desc: 'Type faster than your friends... while everything falls apart', color: '#06B6D4' },
  { emoji: '🧠', name: 'Real or Fake?', desc: 'Can you spot the AI-generated fake facts from the real ones?', color: '#EC4899' },
  { emoji: '⚽', name: 'Physics Soccer', desc: 'Ragdoll chaos. Everyone slides everywhere. Nobody knows the rules.', color: '#F59E0B' },
  { emoji: '🎨', name: 'Chaotic Drawing', desc: 'Draw. Let AI guess. Laugh at the results.', color: '#7C3AED' },
  { emoji: '🖼️', name: 'Guess the AI Image', desc: 'Absurd images. Weirder prompts. You all lose anyway.', color: '#10B981' },
  { emoji: '🎵', name: 'Sound Mimic', desc: 'Make noises. Get voted. Deeply regret your choices.', color: '#EF4444' },
];

const CHAOS_ANNOUNCEMENTS = [
  '⚡ EVERYONE HAS SUPER SPEED!',
  '🌊 LOW GRAVITY MODE!',
  '🔄 REVERSE CONTROLS!',
  '💀 SUDDEN DEATH!',
  '🎲 RANDOM MADNESS!',
  '✨ DISCO MODE!',
  '🪞 MIRROR MIRROR!',
  '🤯 ULTRA CHAOS!',
];

// ── Main Home Screen ──────────────────────────────────────────────────────────

type FlowStep = 'home' | 'setup' | 'join';

export default function HomePage() {
  const screen = useGameStore((s) => s.screen);
  const room = useGameStore((s) => s.room);

  if (screen === 'lobby' && room) return <LobbyWrapper />;
  if (screen === 'game') return <GameScreen />;
  if (screen === 'podium') return <PodiumScreen />;
  return <HomeContent />;
}

function LobbyWrapper() {
  return (
    <>
      <LobbyRoom />
      <ToastContainer />
    </>
  );
}

function HomeContent() {
  const [flow, setFlow] = useState<FlowStep>('home');
  const [announcement, setAnnouncement] = useState(CHAOS_ANNOUNCEMENTS[0]);
  const announcementIdx = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      announcementIdx.current = (announcementIdx.current + 1) % CHAOS_ANNOUNCEMENTS.length;
      setAnnouncement(CHAOS_ANNOUNCEMENTS[announcementIdx.current]);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen bg-game-bg overflow-hidden">
      {/* Particles */}
      <div className="particles-bg">
        {Array.from({ length: 30 }).map((_, i) => (
          <Particle key={i} delay={i * 0.4} color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]} />
        ))}
      </div>

      {/* Radial glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #EC4899 0%, transparent 70%)' }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="text-2xl">🏆</div>
          <span className="font-display font-bold text-xl text-white">Internet Olympics</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <span className="hidden sm:flex items-center gap-2 text-sm text-white/50">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <AnimateCounter target={2847} /> playing now
          </span>
        </motion.div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-4 pt-8 pb-16">
        {/* Chaos ticker */}
        <AnimatePresence mode="wait">
          <motion.div
            key={announcement}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="mb-6 px-4 py-2 rounded-full text-sm font-bold font-display"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))',
              border: '1px solid rgba(124,58,237,0.5)',
              color: '#A78BFA',
            }}
          >
            {announcement}
          </motion.div>
        </AnimatePresence>

        {/* Main title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="font-display font-bold leading-none mb-4"
          style={{ fontSize: 'clamp(3rem, 10vw, 7rem)' }}
        >
          <span className="block" style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #A78BFA 40%, #67E8F9 70%, #F9A8D4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            INTERNET
          </span>
          <span className="block" style={{
            background: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 50%, #7C3AED 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            OLYMPICS
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-white/60 text-lg sm:text-xl max-w-xl mb-10"
        >
          The most chaotic multiplayer party game platform.
          No download. No accounts. Pure chaos.
        </motion.p>

        {/* CTA Buttons */}
        <AnimatePresence mode="wait">
          {flow === 'home' && (
            <motion.div
              key="home-ctas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 w-full max-w-sm"
            >
              <GlowButton
                onClick={() => setFlow('setup')}
                gradient="linear-gradient(135deg, #7C3AED, #EC4899)"
                glow="rgba(124,58,237,0.5)"
                className="flex-1 text-lg py-4"
              >
                🚀 Create Room
              </GlowButton>
              <GlowButton
                onClick={() => setFlow('join')}
                gradient="linear-gradient(135deg, #06B6D4, #7C3AED)"
                glow="rgba(6,182,212,0.5)"
                className="flex-1 text-lg py-4"
              >
                🎮 Join Game
              </GlowButton>
            </motion.div>
          )}

          {flow === 'setup' && (
            <motion.div
              key="setup-flow"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <SetupFlow onBack={() => setFlow('home')} mode="create" />
            </motion.div>
          )}

          {flow === 'join' && (
            <motion.div
              key="join-flow"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md"
            >
              <SetupFlow onBack={() => setFlow('home')} mode="join" />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Stats bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="relative z-10 flex justify-center gap-8 sm:gap-16 py-8 px-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {[
          { label: 'Players Online', value: '2,847', emoji: '🟢' },
          { label: 'Games Played Today', value: '14,392', emoji: '🎮' },
          { label: 'Max Players/Room', value: '50', emoji: '👥' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl sm:text-3xl font-display font-bold text-white">{stat.value}</div>
            <div className="text-xs sm:text-sm text-white/40 mt-1">{stat.emoji} {stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Games Showcase */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 py-12">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display font-bold text-3xl sm:text-4xl text-center text-white mb-3"
        >
          6 Games. All Chaos.
        </motion.h2>
        <p className="text-center text-white/50 mb-10">Rounds last 30-90 seconds. No boring downtime.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAMES_SHOWCASE.map((game, idx) => (
            <motion.div
              key={game.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              whileHover={{ y: -4, scale: 1.01 }}
              className="glass rounded-2xl p-6 cursor-default group"
              style={{ borderColor: `${game.color}30` }}
            >
              <div className="text-4xl mb-3">{game.emoji}</div>
              <h3 className="font-display font-bold text-white text-lg mb-2 group-hover:text-opacity-90"
                style={{ color: game.color }}>
                {game.name}
              </h3>
              <p className="text-white/50 text-sm leading-relaxed">{game.desc}</p>
              <div className="mt-4 text-xs font-mono"
                style={{ color: `${game.color}80` }}>
                ▶ 30-60s rounds
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: '📱', title: 'Mobile Controller', desc: 'Use your phone as a controller or play right in the browser. Works on every device.' },
            { icon: '📺', title: 'Streamer Ready', desc: 'Spectator mode, clip replay button, and audience voting baked right in.' },
            { icon: '⚡', title: 'Zero Install', desc: 'Share a 6-letter code. Everyone\'s in within 10 seconds. No accounts required.' },
          ].map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-6 text-center"
            >
              <div className="text-5xl mb-4">{feat.icon}</div>
              <h3 className="font-display font-bold text-white text-lg mb-2">{feat.title}</h3>
              <p className="text-white/50 text-sm">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 text-center py-16 px-4">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="font-display font-bold text-4xl sm:text-5xl text-white mb-4"
        >
          Ready to cause chaos?
        </motion.h2>
        <p className="text-white/50 mb-8 text-lg">Your friends are waiting. Probably.</p>
        <GlowButton
          onClick={() => setFlow('setup')}
          gradient="linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #F59E0B 100%)"
          glow="rgba(124,58,237,0.6)"
          className="text-xl px-12 py-5 mx-auto"
        >
          🏆 Start Playing Free
        </GlowButton>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-white/20 text-sm"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        Internet Olympics — Built for chaos, friendship, and viral clips.
      </footer>

      <ToastContainer />
    </div>
  );
}

// ── Setup / Join Flow ─────────────────────────────────────────────────────────

function SetupFlow({ onBack, mode }: { onBack: () => void; mode: 'create' | 'join' }) {
  const { createRoom, joinRoom } = useSocket();
  const [username, setUsername] = useState(useGameStore.getState().playerName);
  const [avatar, setAvatar] = useState(useGameStore.getState().playerAvatar);
  const [color, setColor] = useState(useGameStore.getState().playerColor);
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addToast = useGameStore((s) => s.addToast);

  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const setPlayerAvatar = useGameStore((s) => s.setPlayerAvatar);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter a username first!'); return; }
    if (mode === 'join' && roomCode.trim().length < 4) { setError('Enter a valid room code!'); return; }

    setLoading(true);
    setError('');

    setPlayerName(username.trim());
    setPlayerAvatar(avatar);
    setPlayerColor(color);

    try {
      if (mode === 'create') {
        await createRoom(username.trim(), avatar, color);
        addToast({ type: 'success', message: '🎉 Room created! Share the code.' });
      } else {
        await joinRoom(roomCode.trim().toUpperCase(), username.trim(), avatar, color);
        addToast({ type: 'success', message: '🎮 Joined the party!' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again!');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass rounded-3xl p-6 shadow-card text-left" style={{ border: '1px solid rgba(124,58,237,0.3)' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-white/40 hover:text-white transition-colors text-lg">←</button>
        <h2 className="font-display font-bold text-xl text-white">
          {mode === 'create' ? '🚀 Create Room' : '🎮 Join Game'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
        <div>
          <label className="block text-sm text-white/60 mb-2 font-medium">Your Name</label>
          <input
            type="text"
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-purple transition-colors text-lg font-display font-semibold"
            autoFocus
          />
        </div>

        {/* Room Code (join mode) */}
        {mode === 'join' && (
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Room Code</label>
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-cyan transition-colors text-2xl font-mono font-bold tracking-[0.3em] text-center uppercase"
            />
          </div>
        )}

        {/* Avatar picker */}
        <div>
          <label className="block text-sm text-white/60 mb-2 font-medium">Avatar</label>
          <div className="grid grid-cols-8 gap-2">
            {AVATAR_OPTIONS.slice(0, 16).map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setAvatar(em)}
                className={`text-xl p-2 rounded-lg transition-all ${
                  avatar === em
                    ? 'bg-brand-purple scale-110 shadow-glow-purple'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-sm text-white/60 mb-2 font-medium">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${
                  color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-game-card' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm text-center bg-red-500/10 rounded-lg py-2 px-3"
          >
            {error}
          </motion.p>
        )}

        {/* Submit */}
        <GlowButton
          type="submit"
          disabled={loading}
          gradient={mode === 'create'
            ? 'linear-gradient(135deg, #7C3AED, #EC4899)'
            : 'linear-gradient(135deg, #06B6D4, #7C3AED)'}
          glow={mode === 'create' ? 'rgba(124,58,237,0.5)' : 'rgba(6,182,212,0.5)'}
          className="w-full py-4 text-lg"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                ⟳
              </motion.span>
              {mode === 'create' ? 'Creating...' : 'Joining...'}
            </span>
          ) : (
            mode === 'create' ? '🚀 Create Room' : '🎮 Join Now'
          )}
        </GlowButton>
      </form>
    </div>
  );
}

// ── Shared UI Components ──────────────────────────────────────────────────────

interface GlowButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  gradient: string;
  glow: string;
  className?: string;
  disabled?: boolean;
}

function GlowButton({ children, onClick, type = 'button', gradient, glow, className = '', disabled }: GlowButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className={`relative font-display font-bold text-white rounded-2xl px-6 cursor-pointer transition-all select-none ${className}`}
      style={{
        background: disabled ? 'rgba(255,255,255,0.1)' : gradient,
        boxShadow: pressed || disabled ? 'none' : `0 4px 20px ${glow}, 0 0 40px ${glow}40`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </motion.button>
  );
}

function AnimateCounter({ target }: { target: number }) {
  const [value, setValue] = useState(target - 50);

  useEffect(() => {
    const timer = setInterval(() => {
      setValue((v) => {
        const next = v + Math.floor(Math.random() * 3 - 1);
        return Math.max(target - 100, Math.min(target + 100, next));
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [target]);

  return <span className="font-bold text-white">{value.toLocaleString()}</span>;
}
