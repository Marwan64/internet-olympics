'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useChaosAnnouncement, useActiveChaos } from '@/store/gameStore';
import { ChaosEventType } from '@/types';

const CHAOS_COLORS: Partial<Record<ChaosEventType, string>> = {
  SCREEN_SHAKE: '#EF4444',
  WORD_FLIP: '#EC4899',
  SPEED_UP: '#F59E0B',
  FAKE_WORDS: '#10B981',
  MIRROR: '#06B6D4',
  TINY_TEXT: '#A78BFA',
  DISCO_MODE: '#F97316',
  WORD_SCRAMBLE: '#EC4899',
  SUPER_SPEED: '#F59E0B',
  LOW_GRAVITY: '#06B6D4',
};

// Hook to get CSS class for active chaos
export function useChaosClass(): string {
  const chaos = useActiveChaos();
  if (!chaos) return '';

  switch (chaos.type) {
    case 'SCREEN_SHAKE': return 'chaos-shake';
    case 'MIRROR': return 'chaos-mirror';
    case 'WORD_FLIP': return 'chaos-flip';
    case 'DISCO_MODE': return 'chaos-disco';
    case 'TINY_TEXT': return 'chaos-tiny';
    default: return '';
  }
}

// Full-screen chaos announcement banner
export function ChaosAnnouncement() {
  const announcement = useChaosAnnouncement();

  return (
    <AnimatePresence>
      {announcement && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 1.2, rotate: 5 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          className="fixed inset-x-0 top-24 z-50 flex justify-center pointer-events-none px-4"
        >
          <div
            className="font-display font-black text-2xl sm:text-4xl text-white text-center px-8 py-4 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.9), rgba(124,58,237,0.9))',
              boxShadow: '0 0 40px rgba(236,72,153,0.6), 0 0 80px rgba(124,58,237,0.4)',
              border: '2px solid rgba(255,255,255,0.2)',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {announcement}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Subtle screen-edge flash on chaos trigger
export function ChaosFlash() {
  const chaos = useActiveChaos();

  return (
    <AnimatePresence>
      {chaos && (
        <motion.div
          key={`${chaos.type}-${chaos.duration}`}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, ${CHAOS_COLORS[chaos.type] ?? '#7C3AED'}40 100%)`,
          }}
        />
      )}
    </AnimatePresence>
  );
}

// Disco mode rainbow filter
export function DiscoFilter() {
  const chaos = useActiveChaos();
  const isDiscо = chaos?.type === 'DISCO_MODE';

  return (
    <AnimatePresence>
      {isDiscо && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 pointer-events-none z-30 chaos-disco"
          style={{
            background: 'linear-gradient(135deg, #ff0000, #ff8800, #ffff00, #00ff00, #0000ff, #8800ff)',
            mixBlendMode: 'color',
          }}
        />
      )}
    </AnimatePresence>
  );
}
