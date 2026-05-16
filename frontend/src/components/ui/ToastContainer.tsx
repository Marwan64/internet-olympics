'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useToasts, useGameStore } from '@/store/gameStore';

const TOAST_STYLES = {
  info:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.15)', icon: 'ℹ️' },
  success: { border: '#10B981', bg: 'rgba(16,185,129,0.15)', icon: '✅' },
  error:   { border: '#EF4444', bg: 'rgba(239,68,68,0.15)',  icon: '❌' },
  warning: { border: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: '⚠️' },
  chaos:   { border: '#EC4899', bg: 'rgba(236,72,153,0.15)', icon: '⚡' },
};

export default function ToastContainer() {
  const toasts = useToasts();
  const removeToast = useGameStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl cursor-pointer backdrop-blur-md"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}40`,
                boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px ${style.border}20`,
              }}
              onClick={() => removeToast(toast.id)}
            >
              <span className="text-lg shrink-0 mt-0.5">{style.icon}</span>
              <span className="text-sm text-white font-medium leading-snug">{toast.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
