'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameState, useGameStore } from '@/store/gameStore';
import { useSocketActions } from '@/hooks/useSocket';
import { FakeTriviaData, TriviaAnswer } from '@/types';

// ── Category badge ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  animals: '#10B981',
  science: '#06B6D4',
  history: '#F59E0B',
  space: '#7C3AED',
  food: '#EF4444',
  tech: '#3B82F6',
  culture: '#EC4899',
  language: '#F97316',
  body: '#84CC16',
  geography: '#14B8A6',
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? '#7C3AED';
  return (
    <span
      className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
      style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}
    >
      {category}
    </span>
  );
}

// ── Answer Button ─────────────────────────────────────────────────────────────

interface AnswerButtonProps {
  choice: 'real' | 'fake';
  selected: boolean;
  revealed: boolean;
  correct: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function AnswerButton({ choice, selected, revealed, correct, disabled, onSelect }: AnswerButtonProps) {
  const isReal = choice === 'real';

  let bg = isReal
    ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))'
    : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.1))';
  let border = isReal ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
  let textColor = isReal ? '#34D399' : '#F87171';
  let glow = 'none';

  if (revealed) {
    if (correct) {
      bg = 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(16,185,129,0.15))';
      border = '#10B981';
      glow = '0 0 20px rgba(16,185,129,0.4)';
    } else if (selected && !correct) {
      bg = 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(239,68,68,0.15))';
      border = '#EF4444';
      glow = '0 0 20px rgba(239,68,68,0.4)';
    } else {
      bg = 'rgba(255,255,255,0.03)';
      border = 'rgba(255,255,255,0.05)';
      textColor = 'rgba(255,255,255,0.3)';
    }
  } else if (selected) {
    bg = isReal
      ? 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(6,182,212,0.2))'
      : 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(245,158,11,0.2))';
    glow = isReal ? '0 0 20px rgba(16,185,129,0.4)' : '0 0 20px rgba(239,68,68,0.4)';
    border = isReal ? '#10B981' : '#EF4444';
  }

  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className="w-full p-5 rounded-2xl text-left transition-all relative overflow-hidden"
      style={{
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: glow,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {/* Icon */}
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: selected ? `${isReal ? '#10B981' : '#EF4444'}25` : 'rgba(255,255,255,0.05)' }}
        >
          {isReal ? '✅' : '🤥'}
        </div>
        <div>
          <div className="font-display font-black text-xl" style={{ color: textColor }}>
            {isReal ? 'REAL FACT' : 'FAKE FACT'}
          </div>
          <div className="text-white/40 text-sm mt-0.5">
            {isReal ? 'This actually happened/is true' : 'AI made this up'}
          </div>
        </div>
      </div>

      {/* Result indicators */}
      {revealed && correct && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 text-xl"
        >
          ✅
        </motion.div>
      )}
      {revealed && selected && !correct && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 text-xl"
        >
          ❌
        </motion.div>
      )}
    </motion.button>
  );
}

// ── Player Answer Indicators ──────────────────────────────────────────────────

function PlayerAnswerTracker({
  answers,
  totalPlayers,
}: {
  answers: Record<string, TriviaAnswer | null>;
  totalPlayers: number;
}) {
  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: totalPlayers }).map((_, i) => {
          const answered = i < answeredCount;
          return (
            <motion.div
              key={i}
              initial={answered ? { scale: 0 } : {}}
              animate={answered ? { scale: 1 } : {}}
              className="w-3 h-3 rounded-full"
              style={{ background: answered ? '#10B981' : 'rgba(255,255,255,0.1)' }}
            />
          );
        })}
      </div>
      <span className="text-white/50 text-xs">
        {answeredCount}/{totalPlayers} answered
      </span>
    </div>
  );
}

// ── Results Breakdown ─────────────────────────────────────────────────────────

function ResultsBreakdown({
  data,
  room,
}: {
  data: FakeTriviaData;
  room: ReturnType<typeof useGameStore['getState']>['room'];
}) {
  if (!room) return null;

  const entries = Object.entries(data.playerAnswers);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 mt-4"
    >
      {data.question.explanation && (
        <div className="mb-4 p-3 rounded-lg"
          style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)' }}>
          <p className="text-brand-cyan text-xs font-bold mb-1">💡 Fun Fact</p>
          <p className="text-white/70 text-sm">{data.question.explanation}</p>
        </div>
      )}
      <div className="space-y-2">
        {entries.map(([playerId, answer]) => {
          const player = room.players.find((p) => p.id === playerId);
          if (!player || !answer) return null;
          return (
            <div key={playerId} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ background: `${player.color}30`, border: `2px solid ${player.color}` }}
              >
                {player.avatar}
              </div>
              <span className="flex-1 text-sm text-white">{player.username}</span>
              <span className="text-sm font-bold">
                {answer.correct ? (
                  <span className="text-green-400">+{answer.points} pts ✅</span>
                ) : (
                  <span className="text-red-400">✗ wrong</span>
                )}
              </span>
              <span className="text-xs text-white/30">{answer.answer}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Main Trivia Game ──────────────────────────────────────────────────────────

export default function FakeTriviaGame() {
  const gameState = useGameState();
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const { sendInput } = useSocketActions();

  const [myAnswer, setMyAnswer] = useState<'real' | 'fake' | null>(null);
  const [startTime] = useState(Date.now());

  const data = gameState?.data as FakeTriviaData | null;

  // Reset answer when question changes
  useEffect(() => {
    setMyAnswer(null);
  }, [data?.questionNumber]);

  if (!data || !gameState) return null;

  const connectedPlayers = room?.players.filter((p) => p.isConnected) ?? [];
  const myExistingAnswer = playerId ? data.playerAnswers[playerId] : null;
  const hasAnswered = !!myExistingAnswer || !!myAnswer;
  const showResults = data.showResults;

  function selectAnswer(choice: 'real' | 'fake') {
    if (hasAnswered || showResults) return;

    const timeMs = Date.now() - startTime;
    setMyAnswer(choice);
    sendInput('trivia_answer', { answer: choice, timeMs });
  }

  const correctAnswer = data.correctAnswer;
  const isCorrect = myAnswer ? myAnswer === correctAnswer : myExistingAnswer?.correct ?? false;

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4 max-w-2xl mx-auto">
      {/* Question number */}
      <div className="flex items-center gap-4 w-full">
        <CategoryBadge category={data.question.category} />
        <span className="text-white/40 text-sm ml-auto">
          Question {data.questionNumber} / {data.totalQuestions}
        </span>
      </div>

      {/* Progress dots */}
      <div className="flex gap-2">
        {Array.from({ length: data.totalQuestions }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 w-8 rounded-full transition-all"
            style={{
              background: i < data.questionNumber - 1
                ? '#10B981'
                : i === data.questionNumber - 1
                ? '#F59E0B'
                : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>

      {/* Question card */}
      <motion.div
        key={data.question.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-6 w-full text-center"
        style={{ border: '1px solid rgba(255,255,255,0.08)', minHeight: '120px' }}
      >
        <p className="text-white text-xl sm:text-2xl font-medium leading-relaxed">
          "{data.question.text}"
        </p>
      </motion.div>

      {/* Answer buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <AnswerButton
          choice="real"
          selected={myAnswer === 'real' || myExistingAnswer?.answer === 'real'}
          revealed={showResults}
          correct={correctAnswer === 'real'}
          disabled={hasAnswered || showResults}
          onSelect={() => selectAnswer('real')}
        />
        <AnswerButton
          choice="fake"
          selected={myAnswer === 'fake' || myExistingAnswer?.answer === 'fake'}
          revealed={showResults}
          correct={correctAnswer === 'fake'}
          disabled={hasAnswered || showResults}
          onSelect={() => selectAnswer('fake')}
        />
      </div>

      {/* Answer tracker */}
      <PlayerAnswerTracker
        answers={data.playerAnswers}
        totalPlayers={connectedPlayers.length}
      />

      {/* Waiting / Result feedback */}
      <AnimatePresence>
        {hasAnswered && !showResults && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="text-white/60 text-lg">
              {myAnswer === 'real' ? '✅ You said: Real' : '🤥 You said: Fake'}
            </div>
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-white/30 text-sm mt-1"
            >
              Waiting for others...
            </motion.p>
          </motion.div>
        )}

        {showResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            {hasAnswered ? (
              isCorrect ? (
                <div className="font-display font-black text-2xl text-green-400">
                  ✅ CORRECT! +{myExistingAnswer?.points ?? 0} pts
                </div>
              ) : (
                <div className="font-display font-black text-2xl text-red-400">
                  ❌ WRONG! It was {correctAnswer?.toUpperCase()}
                </div>
              )
            ) : (
              <div className="font-display font-bold text-xl text-white/50">
                ⏱️ Too slow! The answer was {correctAnswer?.toUpperCase()}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results breakdown */}
      {showResults && (
        <ResultsBreakdown data={data} room={room} />
      )}
    </div>
  );
}
