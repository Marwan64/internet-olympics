'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, useGameState, useActiveChaos } from '@/store/gameStore';
import SpeedTypingGame from './SpeedTypingGame';
import FakeTriviaGame from './FakeTriviaGame';
import { useSocketActions } from '@/hooks/useSocket';
import { ChaosAnnouncement, ChaosFlash, DiscoFilter } from '@/components/ui/ChaosOverlay';
import ToastContainer from '@/components/ui/ToastContainer';
import { GameState, Player, PlayerResult } from '@/types';

// ── Leaderboard Sidebar ───────────────────────────────────────────────────────

function MiniLeaderboard({ gameState }: { gameState: GameState }) {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  if (!room) return null;

  const entries = room.players
    .filter((p: Player) => p.isConnected)
    .map((p: Player) => ({
      ...p,
      roundScore: gameState.scores[p.id] ?? 0,
      totalScore: gameState.totalScores[p.id] ?? 0,
    }))
    .sort((a: { roundScore: number }, b: { roundScore: number }) => b.roundScore - a.roundScore);

  return (
    <div className="space-y-2">
      {entries.map((p: Player & { roundScore: number }, idx: number) => (
        <motion.div
          key={p.id}
          layout
          className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
            p.id === playerId ? 'bg-brand-purple/20 border border-brand-purple/30' : 'bg-white/5'
          }`}
        >
          <span className="text-white/40 font-mono text-xs w-4">{idx + 1}</span>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-base shrink-0"
            style={{ background: `${p.color}30`, border: `2px solid ${p.color}` }}
          >
            {p.avatar}
          </div>
          <span className="flex-1 text-sm text-white font-medium truncate">{p.username}</span>
          <span className="font-display font-bold text-sm text-white">{p.roundScore.toLocaleString()}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Timer Bar ─────────────────────────────────────────────────────────────────

function TimerBar({ timeRemaining, totalTime }: { timeRemaining: number; totalTime: number }) {
  const pct = Math.max(0, (timeRemaining / totalTime) * 100);
  const isUrgent = timeRemaining <= 10;

  return (
    <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: isUrgent
            ? 'linear-gradient(90deg, #EF4444, #F59E0B)'
            : 'linear-gradient(90deg, #06B6D4, #7C3AED, #EC4899)',
          boxShadow: isUrgent
            ? '0 0 12px rgba(239,68,68,0.6)'
            : '0 0 12px rgba(124,58,237,0.5)',
        }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'linear' }}
      />
      {isUrgent && (
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ repeat: Infinity, duration: 0.5 }}
          style={{ background: 'rgba(239,68,68,0.4)' }}
        />
      )}
    </div>
  );
}

// ── Game Results Screen ────────────────────────────────────────────────────────

function GameResultsScreen() {
  const results = useGameStore((s) => s.gameResults);
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  if (!results) return null;

  const sorted = [...results.scores].sort((a: PlayerResult, b: PlayerResult) => b.roundScore - a.roundScore);
  const myResult = results.scores.find((s: PlayerResult) => s.playerId === playerId);

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <h2 className="font-display font-black text-3xl text-white text-center mb-2">
          Round Over!
        </h2>

        {results.highlights.length > 0 && (
          <div className="text-center mb-6">
            {results.highlights.map((h, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                className="text-amber-400 font-bold text-lg"
              >
                {h}
              </motion.p>
            ))}
          </div>
        )}

        <div className="glass rounded-2xl p-4 space-y-2 mb-6">
          {sorted.map((s: PlayerResult, idx: number) => {
            const player = room?.players.find((p: Player) => p.id === s.playerId);
            const isMe = s.playerId === playerId;
            return (
              <motion.div
                key={s.playerId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  isMe ? 'bg-brand-purple/20 border border-brand-purple/30' : 'bg-white/5'
                }`}
              >
                <span className="text-xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}</span>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                  style={{ background: `${player?.color ?? '#7C3AED'}30`, border: `2px solid ${player?.color ?? '#7C3AED'}` }}
                >
                  {player?.avatar ?? '🎮'}
                </div>
                <span className="flex-1 font-medium text-white truncate">
                  {s.username || player?.username}
                  {isMe && <span className="text-xs text-brand-purple ml-1">(you)</span>}
                </span>
                <div className="text-right">
                  <div className="font-display font-bold text-white">+{s.roundScore.toLocaleString()}</div>
                  <div className="text-xs text-white/40">{s.totalScore.toLocaleString()} total</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {myResult && myResult.rank === 1 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, delay: 0.5 }}
            className="text-center text-2xl font-display font-black text-amber-400 mb-4"
          >
            🏆 YOU WIN THIS ROUND!
          </motion.div>
        )}

        <p className="text-center text-white/40 text-sm">Next game loading...</p>
      </motion.div>
    </div>
  );
}

// ── Game Intro Screen ─────────────────────────────────────────────────────────

function GameIntroScreen({ gameState }: { gameState: GameState }) {
  const gameNames: Record<string, { name: string; emoji: string; desc: string }> = {
    'speed-typing': { name: 'Speed Typing Chaos', emoji: '⌨️', desc: 'Type the words as fast as you can. Chaos incoming.' },
    'fake-trivia': { name: 'Real or Fake?', emoji: '🧠', desc: 'Spot the AI-generated fake facts. Trust nobody.' },
    'drawing': { name: 'Chaotic Drawing', emoji: '🎨', desc: 'Draw. Laugh. Regret.' },
    'physics-soccer': { name: 'Physics Soccer', emoji: '⚽', desc: 'Ragdoll physics. Pure chaos.' },
  };

  const info = gameNames[gameState.type] ?? { name: gameState.type, emoji: '🎮', desc: 'Get ready!' };

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-center"
      >
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 0] }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-8xl mb-6"
        >
          {info.emoji}
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-display font-black text-4xl sm:text-5xl text-white mb-3"
        >
          {info.name}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-white/60 text-xl mb-6"
        >
          {info.desc}
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-white/40 text-sm"
        >
          Game {gameState.gameNumber} of {gameState.totalGames}
        </motion.div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="mt-8 text-white/50 text-lg font-display"
        >
          Get ready...
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Main Game Screen ──────────────────────────────────────────────────────────

export default function GameScreen() {
  const gameState = useGameState();
  const gameResults = useGameStore((s) => s.gameResults);
  const activeChaos = useActiveChaos();
  const { leaveRoom } = useSocketActions();

  if (!gameState) return null;

  const totalTime = 60; // default; games set their own

  return (
    <div className={`min-h-screen bg-game-bg relative overflow-hidden ${
      activeChaos?.type === 'SCREEN_SHAKE' ? 'chaos-shake' : ''
    }`}>
      {/* Chaos visual effects */}
      <ChaosAnnouncement />
      <ChaosFlash />
      <DiscoFilter />

      {/* BG */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-64 opacity-10"
          style={{ background: 'radial-gradient(ellipse, #7C3AED 0%, transparent 70%)' }} />
      </div>

      {/* Top HUD */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-2">
            {/* Timer */}
            <div className="font-display font-black text-3xl text-white tabular-nums min-w-[3ch] text-center"
              style={{ color: gameState.timeRemaining <= 10 ? '#EF4444' : 'white' }}>
              {gameState.timeRemaining}
            </div>
            {/* Timer bar */}
            <div className="flex-1">
              <TimerBar
                timeRemaining={gameState.timeRemaining}
                totalTime={totalTime}
              />
            </div>
            {/* Game info */}
            <div className="text-right">
              <div className="text-white/50 text-xs">Game {gameState.gameNumber}/{gameState.totalGames}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Game area */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {gameResults && gameState.phase === 'results' ? (
                <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <GameResultsScreen />
                </motion.div>
              ) : gameState.phase === 'intro' ? (
                <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <GameIntroScreen gameState={gameState} />
                </motion.div>
              ) : (
                <motion.div key={`game-${gameState.type}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {gameState.type === 'speed-typing' && <SpeedTypingGame />}
                  {gameState.type === 'fake-trivia' && <FakeTriviaGame />}
                  {!['speed-typing', 'fake-trivia'].includes(gameState.type) && (
                    <div className="flex items-center justify-center h-64 text-white/50 text-xl">
                      Coming soon: {gameState.type} 🚧
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar: leaderboard */}
          <div className="lg:col-span-1">
            <div className="glass rounded-2xl p-3 sticky top-4">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-3 font-mono">Scores</p>
              <MiniLeaderboard gameState={gameState} />
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
