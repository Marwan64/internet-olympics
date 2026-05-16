'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, usePersonalData, useActiveChaos } from '@/store/gameStore';
import { useSocket } from '@/hooks/useSocket';

// ── Score Popup ───────────────────────────────────────────────────────────────

interface ScorePopup { id: number; points: number; x: number }

// ── Word Display ──────────────────────────────────────────────────────────────

function WordDisplay({ word, chaosType }: { word: string; chaosType?: string }) {
  const isMirror = chaosType === 'MIRROR';
  const isFlipped = chaosType === 'WORD_FLIP';
  const isTiny = chaosType === 'TINY_TEXT';
  const isScrambled = chaosType === 'WORD_SCRAMBLE';

  let displayWord = word;

  return (
    <div className="relative">
      <motion.div
        key={word}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="font-display font-black text-center"
        style={{
          fontSize: isTiny ? '1.5rem' : 'clamp(2.5rem, 8vw, 5rem)',
          color: '#F59E0B',
          textShadow: '0 0 20px rgba(245,158,11,0.6)',
          transform: `${isMirror ? 'scaleX(-1)' : ''} ${isFlipped ? 'scaleY(-1)' : ''}`,
        }}
      >
        {displayWord}
      </motion.div>
    </div>
  );
}

// ── Upcoming Words ────────────────────────────────────────────────────────────

function UpcomingWords({ words }: { words: string[] }) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {words.slice(0, 3).map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="font-mono text-lg font-semibold"
          style={{
            color: `rgba(255,255,255,${0.4 - i * 0.1})`,
            fontSize: `${1.2 - i * 0.15}rem`,
          }}
        >
          {word}
        </motion.span>
      ))}
    </div>
  );
}

// ── Combo Display ─────────────────────────────────────────────────────────────

function ComboDisplay({ combo }: { combo: number }) {
  if (combo < 3) return null;

  const level = combo >= 20 ? 'ultra' : combo >= 10 ? 'mega' : combo >= 5 ? 'hot' : 'nice';
  const config = {
    nice: { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.5)', text: '#F59E0B', label: '🔥 COMBO' },
    hot: { bg: 'rgba(236,72,153,0.2)', border: 'rgba(236,72,153,0.5)', text: '#EC4899', label: '💥 HOT STREAK' },
    mega: { bg: 'rgba(124,58,237,0.2)', border: 'rgba(124,58,237,0.5)', text: '#A78BFA', label: '⚡ MEGA COMBO' },
    ultra: { bg: 'rgba(6,182,212,0.2)', border: 'rgba(6,182,212,0.5)', text: '#67E8F9', label: '🌊 ULTRA COMBO' },
  }[level];

  return (
    <motion.div
      key={combo}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
      style={{ background: config.bg, border: `1px solid ${config.border}` }}
    >
      <span className="font-display font-black text-xl" style={{ color: config.text }}>
        {combo}x
      </span>
      <span className="font-bold text-sm" style={{ color: config.text }}>
        {config.label}
      </span>
    </motion.div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ wordsCompleted, wpm, accuracy }: { wordsCompleted: number; wpm: number; accuracy: number }) {
  return (
    <div className="flex gap-4 sm:gap-8 justify-center">
      {[
        { label: 'Words', value: wordsCompleted, unit: '' },
        { label: 'WPM', value: wpm, unit: '' },
        { label: 'Accuracy', value: accuracy, unit: '%' },
      ].map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="font-display font-black text-2xl text-white">{stat.value}{stat.unit}</div>
          <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Game ─────────────────────────────────────────────────────────────────

export default function SpeedTypingGame() {
  const personal = usePersonalData();
  const chaos = useActiveChaos();
  const { sendInput } = useSocket();

  const [inputValue, setInputValue] = useState('');
  const [inputState, setInputState] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [scorePopups, setScorePopups] = useState<ScorePopup[]>([]);
  const [accuracy, setAccuracy] = useState(100);
  const [attemptCount, setAttemptCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevWordCount = useRef(0);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Detect successful word completion
  useEffect(() => {
    if (!personal) return;
    if (personal.wordsCompleted > prevWordCount.current) {
      prevWordCount.current = personal.wordsCompleted;
      // Visual feedback
      setInputState('correct');
      addScorePopup();
      setTimeout(() => setInputState('idle'), 200);
    }
  }, [personal?.wordsCompleted]);

  function addScorePopup() {
    const popup: ScorePopup = {
      id: Date.now(),
      points: 100 + (personal?.combo ?? 0) * 10,
      x: 40 + Math.random() * 60,
    };
    setScorePopups((prev) => [...prev, popup]);
    setTimeout(() => {
      setScorePopups((prev) => prev.filter((p) => p.id !== popup.id));
    }, 1000);
  }

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      // Check if user typed a space (word submission trigger)
      if (value.endsWith(' ') || value.endsWith('\n')) {
        const typed = value.trim().toLowerCase();
        const expected = (personal?.currentWord ?? '').toLowerCase();

        setAttemptCount((c) => c + 1);

        if (typed === expected) {
          setHitCount((c) => c + 1);
          sendInput('word_submit', {
            word: typed,
            wordIndex: personal?.wordIndex ?? 0,
          });
        } else {
          setInputState('incorrect');
          // Haptic feedback on mobile
          if ('vibrate' in navigator) navigator.vibrate(30);
          setTimeout(() => setInputState('idle'), 300);
        }

        setInputValue('');
        return;
      }

      setInputValue(value);

      // Live accuracy update
      const newAttempts = attemptCount;
      if (newAttempts > 0) setAccuracy(Math.round((hitCount / newAttempts) * 100));
    },
    [personal, sendInput, attemptCount, hitCount]
  );

  // Keyboard shortcut: Enter also submits
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const typed = inputValue.trim().toLowerCase();
      const expected = (personal?.currentWord ?? '').toLowerCase();

      setAttemptCount((c) => c + 1);
      if (typed === expected) {
        setHitCount((c) => c + 1);
        sendInput('word_submit', { word: typed, wordIndex: personal?.wordIndex ?? 0 });
      } else {
        setInputState('incorrect');
        setTimeout(() => setInputState('idle'), 300);
      }
      setInputValue('');
    }
  }

  const currentWord = personal?.currentWord ?? '...';
  const upcomingWords = personal?.upcomingWords ?? [];

  return (
    <div className="relative min-h-[500px] flex flex-col">
      {/* Score popups */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {scorePopups.map((popup) => (
            <motion.div
              key={popup.id}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -80 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute score-popup"
              style={{ left: `${popup.x}%` }}
            >
              +{popup.points}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className={`flex flex-col items-center gap-6 py-8 px-4 ${
        chaos?.type === 'SCREEN_SHAKE' ? 'chaos-shake' : ''
      } ${chaos?.type === 'DISCO_MODE' ? 'chaos-disco' : ''}`}>

        {/* Stats */}
        <StatsBar
          wordsCompleted={personal?.wordsCompleted ?? 0}
          wpm={personal?.wpm ?? 0}
          accuracy={accuracy}
        />

        {/* Combo */}
        <AnimatePresence>
          {(personal?.combo ?? 0) >= 3 && (
            <ComboDisplay key={personal?.combo} combo={personal?.combo ?? 0} />
          )}
        </AnimatePresence>

        {/* Word display area */}
        <div className="glass rounded-2xl p-8 w-full max-w-lg text-center relative"
          style={{ border: '1px solid rgba(245,158,11,0.2)', minHeight: '160px' }}>

          {/* Upcoming words (dimmed behind) */}
          <div className="mb-4">
            <UpcomingWords words={upcomingWords} />
          </div>

          {/* Current word */}
          <AnimatePresence mode="wait">
            <WordDisplay
              key={currentWord}
              word={currentWord}
              chaosType={chaos?.type}
            />
          </AnimatePresence>
        </div>

        {/* Input field */}
        <div className="w-full max-w-lg relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type the word, press space..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            className={`game-input ${inputState === 'correct' ? 'correct' : inputState === 'incorrect' ? 'incorrect' : ''}`}
            style={{
              transform: chaos?.type === 'MIRROR' ? 'scaleX(-1)' : 'none',
            }}
          />

          {/* Live match indicator */}
          {inputValue && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {currentWord.toLowerCase().startsWith(inputValue.toLowerCase()) ? (
                <span className="text-green-400 text-lg">✓</span>
              ) : (
                <span className="text-red-400 text-lg">✗</span>
              )}
            </div>
          )}
        </div>

        {/* Mobile hint */}
        <p className="text-white/20 text-xs text-center">
          Space or Enter to submit • Keep the combo going!
        </p>
      </div>
    </div>
  );
}
