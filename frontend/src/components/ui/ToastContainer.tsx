'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useToasts, useGameStore } from '@/store/gameStore';

const STYLES = {
  info:    { border: '#1F5BD8', bg: '#FBF7EE', icon: 'ℹ️',  color: '#1F5BD8' },
  success: { border: '#1E5A3A', bg: '#FBF7EE', icon: '✅',  color: '#1E5A3A' },
  error:   { border: '#B91C1C', bg: '#FFF0EE', icon: '❌',  color: '#B91C1C' },
  warning: { border: '#F4B400', bg: '#FFFBEA', icon: '⚠️',  color: '#92400e' },
  chaos:   { border: '#5E37B7', bg: '#FBF7EE', icon: '⚡',  color: '#5E37B7' },
};

export default function ToastContainer() {
  const toasts      = useToasts();
  const removeToast = useGameStore((s) => s.removeToast);

  return (
    <div style={{
      position:'fixed', top:16, right:16, zIndex:9999,
      display:'flex', flexDirection:'column', gap:10,
      pointerEvents:'none', maxWidth:340, width:'100%',
    }}>
      <AnimatePresence>
        {toasts.map((toast) => {
          const s = STYLES[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity:0, x:50, scale:.93 }}
              animate={{ opacity:1, x:0, scale:1 }}
              exit={{ opacity:0, x:50, scale:.93 }}
              transition={{ type:'spring', stiffness:400, damping:28 }}
              onClick={() => removeToast(toast.id)}
              style={{
                pointerEvents:'auto', display:'flex', alignItems:'flex-start', gap:10,
                padding:'12px 16px', borderRadius:14, cursor:'pointer',
                background: s.bg, border:`1.5px solid ${s.border}55`,
                boxShadow:`0 4px 16px rgba(20,22,27,0.12), 0 0 0 1px ${s.border}18`,
              }}
            >
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{s.icon}</span>
              <span style={{
                fontSize:13, color:'#14161B', fontWeight:500, lineHeight:1.45,
                fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
              }}>{toast.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
