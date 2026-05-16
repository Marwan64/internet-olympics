'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocket } from '@/hooks/useSocket';
import { PlayerResult } from '@/types';
import ToastContainer from './ToastContainer';

const RANK_COLORS = ['#F59E0B', '#9CA3AF', '#B45309'];
const RANK_LABELS = ['🥇 CHAMPION', '🥈 RUNNER-UP', '🥉 THIRD'];
const RANK_HEIGHTS = ['h-48', 'h-36', 'h-28'];

export default function PodiumScreen() {
  const podiumData = useGameStore((s) => s.podiumData);
  const playerId = useGameStore((s) => s.playerId);
  const { leaveRoom } = useSocket();

  useEffect(() => {
    // Trigger confetti-like particle burst on mount
  }, []);

  if (!podiumData) return null;

  const top3 = podiumData.players.slice(0, 3);
  const rest = podiumData.players.slice(3);
  const myRank = podiumData.players.findIndex((p) => p.playerId === playerId) + 1;

  function handlePlayAgain() {
    useGameStore.getState().setScreen('lobby');
    useGameStore.getState().clearGame();
  }

  function handleLeave() {
    leaveRoom();
  }

  return (
    <div className="min-h-screen bg-game-bg flex flex-col overflow-hidden relative">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.15) 0%, transparent 60%)',
        }} />
      </div>

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="text-6xl mb-4 animate-bounce">🏆</div>
          <h1 className="font-display font-black text-5xl sm:text-6xl text-white mb-2"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #EC4899, #7C3AED)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            GAME OVER
          </h1>
          {podiumData.champion && (
            <p className="text-white/70 text-xl mt-2">
              {podiumData.champion.avatar} <strong className="text-white">{podiumData.champion.username}</strong> wins! 🎉
            </p>
          )}
          {myRank > 0 && myRank <= 3 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1, type: 'spring', stiffness: 300 }}
              className="inline-block mt-3 px-4 py-2 rounded-full font-bold"
              style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B' }}
            >
              You finished #{myRank}! {myRank === 1 ? '🎊' : myRank === 2 ? '🥈' : '🥉'}
            </motion.div>
          )}
        </motion.div>

        {/* Podium */}
        <div className="flex items-end justify-center gap-2 mb-12 w-full max-w-lg">
          {/* Rearrange to 2nd, 1st, 3rd order */}
          {[top3[1], top3[0], top3[2]].map((player, visualIdx) => {
            if (!player) return <div key={visualIdx} className="flex-1" />;
            const actualRank = visualIdx === 0 ? 2 : visualIdx === 1 ? 1 : 3;
            const heightClass = RANK_HEIGHTS[actualRank - 1];
            const color = RANK_COLORS[actualRank - 1];

            return (
              <motion.div
                key={player.playerId}
                className="flex-1 flex flex-col items-center"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: actualRank * 0.2, type: 'spring', stiffness: 200 }}
              >
                {/* Player card */}
                <div className="flex flex-col items-center mb-2">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-1"
                    style={{ background: `${player.color}30`, border: `3px solid ${player.color}`, boxShadow: `0 0 15px ${player.color}60` }}
                  >
                    {player.avatar}
                  </div>
                  <div className="text-white font-bold text-sm text-center truncate max-w-[80px]">{player.username}</div>
                  <div className="font-display font-black text-lg" style={{ color }}>{player.totalScore.toLocaleString()}</div>
                </div>

                {/* Podium block */}
                <div
                  className={`w-full ${heightClass} rounded-t-xl flex flex-col items-center justify-start pt-3`}
                  style={{
                    background: `linear-gradient(180deg, ${color}30 0%, ${color}15 100%)`,
                    border: `1px solid ${color}50`,
                    borderBottom: 'none',
                  }}
                >
                  <div className="text-2xl">{actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉'}</div>
                  <div className="font-display font-bold text-sm" style={{ color }}>#{actualRank}</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Rest of leaderboard */}
        {rest.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="w-full max-w-md glass rounded-2xl p-4 mb-8"
          >
            <div className="space-y-2">
              {rest.map((player) => (
                <LeaderboardRow key={player.playerId} player={player} isMe={player.playerId === playerId} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Awards */}
        {podiumData.awards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="flex flex-wrap justify-center gap-3 mb-10 max-w-lg"
          >
            {podiumData.awards.map((award) => {
              const player = podiumData.players.find((p) => p.playerId === award.playerId);
              if (!player) return null;
              return (
                <div key={award.title} className="glass rounded-xl px-4 py-3 text-center"
                  style={{ border: '1px solid rgba(245,158,11,0.3)' }}>
                  <div className="text-2xl mb-1">{award.emoji}</div>
                  <div className="font-bold text-white text-xs">{award.title}</div>
                  <div className="text-white/50 text-xs">{player.avatar} {player.username}</div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex gap-4"
        >
          <button
            onClick={handlePlayAgain}
            className="font-display font-bold text-white px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
              boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
            }}
          >
            🔄 Play Again
          </button>
          <button
            onClick={handleLeave}
            className="font-display font-bold text-white/70 px-8 py-4 rounded-2xl text-lg transition-all hover:text-white hover:bg-white/10"
          >
            🚪 Leave
          </button>
        </motion.div>
      </div>

      <ToastContainer />
    </div>
  );
}

function LeaderboardRow({ player, isMe }: { player: PlayerResult; isMe: boolean }) {
  return (
    <div className={`leaderboard-row ${isMe ? 'ring-1 ring-brand-purple' : ''}`}>
      <span className="text-white/50 font-bold text-sm w-6 text-center">#{player.rank}</span>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
        style={{ background: `${player.color}30`, border: `2px solid ${player.color}` }}
      >
        {player.avatar}
      </div>
      <span className="flex-1 text-white font-medium text-sm truncate">
        {player.username} {isMe && <span className="text-brand-purple text-xs">(you)</span>}
      </span>
      <span className="font-display font-bold text-white">{player.totalScore.toLocaleString()}</span>
    </div>
  );
}
