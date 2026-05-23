'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions } from '@/hooks/useSocket';
import { PlayerResult } from '@/types';
import ToastContainer from './ToastContainer';
import { useSounds } from '@/hooks/useSounds';

const T = {
  bg:      '#0A0A12',
  bg2:     '#0E0E18',
  paper:   '#15151F',
  ink:     '#F4F4F6',
  ink2:    '#CDCFD7',
  ink3:    '#8A8DA0',
  line:    'rgba(255,255,255,0.08)',
  lineStr: 'rgba(255,255,255,0.16)',
  torch:   '#FF4D2D',
  lake:    '#3B82F6',
  gold:    '#F59E0B',
  leaf:    '#00C271',
  grape:   '#8B5CF6',
};
const D = { display: "'Manrope', system-ui, sans-serif" as const };
const FONT_MONO = "'Geist Mono', ui-monospace, monospace";

const RANK_ACCENT = [T.gold, T.ink3, '#B45309'];
const RANK_HEIGHTS = [192, 140, 112];
const RANK_EMOJI = ['🥇','🥈','🥉'];

async function shareResults(players: PlayerResult[], champion: PlayerResult | null) {
  const W = 600, H = 380;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0A0A12';
  ctx.fillRect(0, 0, W, H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(255,77,45,0.08)');
  grad.addColorStop(1, 'rgba(236,72,153,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#F4F4F6';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆  INTERNET OLYMPICS', W / 2, 50);

  ctx.fillStyle = '#8A8DA0';
  ctx.font = '13px monospace';
  ctx.fillText('FINAL RESULTS', W / 2, 74);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(W - 40, 90); ctx.stroke();

  // Players (top 5)
  const top5 = players.slice(0, 5);
  const medals = ['🥇','🥈','🥉','4.','5.'];
  const accentColors = ['#F59E0B','#8A8DA0','#B45309','#CDCFD7','#5B5E70'];
  top5.forEach((p, i) => {
    const y = 120 + i * 46;
    // Row bg for top 3
    if (i < 3) {
      ctx.fillStyle = `rgba(255,255,255,0.03)`;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void })
        .roundRect?.(40, y - 18, W - 80, 38, 8);
      ctx.fill();
    }
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(medals[i], 54, y + 8);
    ctx.font = `${i === 0 ? 'bold ' : ''}16px sans-serif`;
    ctx.fillStyle = i === 0 ? '#F4F4F6' : '#CDCFD7';
    ctx.fillText(`${p.avatar}  ${p.username}`, 96, y + 8);
    ctx.fillStyle = accentColors[i];
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(p.totalScore.toLocaleString() + ' pts', W - 54, y + 8);
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, H - 50, W, 1);
  ctx.fillStyle = '#5B5E70';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('internetolympics.vercel.app', W / 2, H - 18);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'internet-olympics-results.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Internet Olympics Results', text: `${champion?.username ?? 'Someone'} won! Come play 👇` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'internet-olympics-results.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

export default function PodiumScreen() {
  const podiumData = useGameStore((s) => s.podiumData);
  const playerId   = useGameStore((s) => s.playerId);
  const { leaveRoom } = useSocketActions();
  const sounds = useSounds();
  const [sharing, setSharing] = useState(false);

  if (!podiumData) return null;

  // Play win fanfare once on mount
  void (typeof window !== 'undefined' && setTimeout(() => sounds.win(), 600));

  const top3  = podiumData.players.slice(0, 3);
  const rest  = podiumData.players.slice(3);
  const myRank = podiumData.players.findIndex((p) => p.playerId === playerId) + 1;

  function handlePlayAgain() {
    useGameStore.getState().setScreen('lobby');
    useGameStore.getState().clearGame();
  }

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const podiumRanks = [2, 1, 3];

  return (
    <div style={{ minHeight:'100vh', background: T.bg, display:'flex', flexDirection:'column', overflowX:'hidden', color: T.ink }}>
      <style>{`
        .pod-btn { transition: transform .15s ease; }
        .pod-btn:hover { transform: translateY(-2px); }
        @keyframes pod-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'48px 24px 64px', width:'100%' }}>

        {/* Header */}
        <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          style={{ textAlign:'center', marginBottom:48 }}>

          <div style={{ fontSize:64, marginBottom:12, display:'inline-block', animation:'pod-float 3s ease-in-out infinite' }}>🏆</div>

          <h1 style={{
            fontFamily: D.display, fontWeight:800, color: T.ink, margin:0,
            fontSize:'clamp(52px,10vw,96px)', lineHeight:.9, letterSpacing:'-0.045em',
          }}>
            Game{' '}
            <em style={{ fontStyle:'italic', fontWeight:300, color: T.torch }}>Over</em>
          </h1>

          {podiumData.champion && (
            <p style={{ fontFamily: D.display, fontSize:18, color: T.ink2, marginTop:12 }}>
              {podiumData.champion.avatar}{' '}
              <strong style={{ color: T.ink }}>{podiumData.champion.username}</strong>
              {' '}wins! 🎉
            </p>
          )}

          {myRank > 0 && myRank <= 3 && (
            <motion.div
              initial={{ scale:0 }} animate={{ scale:1 }}
              transition={{ delay:1, type:'spring', stiffness:280 }}
              style={{
                display:'inline-block', marginTop:10,
                padding:'6px 16px', borderRadius:999,
                background:`${T.torch}14`, border:`1px solid ${T.torch}55`,
                fontFamily: D.display, fontWeight:700, fontSize:14, color: T.torch,
              }}
            >
              You finished #{myRank}! {myRank === 1 ? '🎊' : myRank === 2 ? '🥈' : '🥉'}
            </motion.div>
          )}
        </motion.div>

        {/* Podium */}
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:8, marginBottom:36, width:'100%' }}>
          {podiumOrder.map((player, visualIdx) => {
            if (!player) return <div key={visualIdx} style={{ flex:1 }} />;
            const rank   = podiumRanks[visualIdx];
            const accent = RANK_ACCENT[rank - 1];
            const height = RANK_HEIGHTS[rank - 1];

            return (
              <motion.div key={player.playerId} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}
                initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: rank * 0.18, type:'spring', stiffness:200 }}>

                {/* Player avatar + name */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:10 }}>
                  <div style={{
                    width:52, height:52, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:24, marginBottom:4,
                    background:`${player.color}22`, border:`3px solid ${player.color}`,
                    boxShadow:`0 0 16px ${player.color}55`,
                  }}>{player.avatar}</div>
                  <div style={{ fontFamily: D.display, fontWeight:700, fontSize:12, color: T.ink, textAlign:'center', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{player.username}</div>
                  <div style={{ fontFamily: D.display, fontWeight:800, fontSize:16, color: accent, marginTop:2 }}>{player.totalScore.toLocaleString()}</div>
                </div>

                {/* Podium block */}
                <div style={{
                  width:'100%', height, borderRadius:'12px 12px 0 0',
                  background:`${accent}18`, border:`1.5px solid ${accent}55`, borderBottom:'none',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', paddingTop:14,
                }}>
                  <div style={{ fontSize:24 }}>{RANK_EMOJI[rank - 1]}</div>
                  <div style={{ fontFamily: D.display, fontWeight:800, fontSize:14, color: accent, marginTop:4 }}>#{rank}</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Rest of leaderboard */}
        {rest.length > 0 && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.7 }}
            style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:18, padding:16, marginBottom:24 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rest.map((player) => (
                <LeaderboardRow key={player.playerId} player={player} isMe={player.playerId === playerId} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Awards */}
        {podiumData.awards.length > 0 && (
          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.9 }}
            style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:10, marginBottom:28 }}>
            {podiumData.awards.map((award) => {
              const player = podiumData.players.find((p) => p.playerId === award.playerId);
              if (!player) return null;
              return (
                <div key={award.title} style={{
                  background: T.paper, border:`1px solid ${T.gold}55`,
                  borderRadius:14, padding:'12px 16px', textAlign:'center',
                }}>
                  <div style={{ fontSize:24, marginBottom:4 }}>{award.emoji}</div>
                  <div style={{ fontFamily: D.display, fontWeight:700, fontSize:12, color: T.ink }}>{award.title}</div>
                  <div style={{ fontSize:12, color: T.ink3, marginTop:2 }}>{player.avatar} {player.username}</div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Buttons */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1 }}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>

          {/* Share result */}
          <button onClick={async () => {
            if (sharing) return;
            setSharing(true); sounds.copy();
            await shareResults(podiumData.players, podiumData.champion ?? null);
            setSharing(false);
          }} className="pod-btn" style={{
            display:'inline-flex', alignItems:'center', gap:8, padding:'10px 22px',
            borderRadius:999, border:`1px solid ${T.lineStr}`, cursor:'pointer',
            background:'rgba(255,255,255,0.05)', color: T.ink2,
            fontFamily: D.display, fontWeight:600, fontSize:13,
          }}>
            {sharing ? '⏳ Generating…' : '📸 Share Results'}
          </button>

          <a href="https://cash.app/$MarMar642" target="_blank" rel="noopener noreferrer" className="pod-btn"
            style={{
              display:'inline-flex', alignItems:'center', gap:8, padding:'10px 20px',
              borderRadius:999, background:'linear-gradient(135deg,#00C853,#009624)',
              color:'#fff', textDecoration:'none',
              fontFamily: D.display, fontWeight:600, fontSize:13,
              boxShadow:'0 4px 14px rgba(0,200,83,0.28)',
            }}>
            💚 Enjoyed it? Support the dev — $MarMar642
          </a>

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handlePlayAgain} className="pod-btn" style={{
              padding:'14px 32px', borderRadius:999, border:'none', cursor:'pointer',
              fontFamily: D.display, fontWeight:700, fontSize:16,
              background: T.torch, color: T.paper,
              boxShadow:`0 6px 20px -6px ${T.torch}88`,
            }}>🔄 Play Again</button>
            <button onClick={leaveRoom} className="pod-btn" style={{
              padding:'14px 32px', borderRadius:999, cursor:'pointer',
              fontFamily: D.display, fontWeight:700, fontSize:16,
              background:'transparent', color: T.ink2,
              border:`1px solid ${T.lineStr}`,
            }}>Leave →</button>
          </div>
        </motion.div>
      </div>

      <ToastContainer />
    </div>
  );
}

function LeaderboardRow({ player, isMe }: { player: PlayerResult; isMe: boolean }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12,
      background: isMe ? `${T.torch}18` : T.paper,
      border:`1px solid ${isMe ? `${T.torch}55` : T.line}`,
    }}>
      <span style={{ fontFamily:FONT_MONO, fontWeight:700, fontSize:13, color: T.ink3, width:24, textAlign:'center' }}>#{player.rank}</span>
      <div style={{
        width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:17, flexShrink:0, background:`${player.color}22`, border:`2px solid ${player.color}`,
      }}>{player.avatar}</div>
      <span style={{ flex:1, fontFamily: D.display, fontWeight:600, fontSize:14, color: T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {player.username} {isMe && <span style={{ color: T.torch, fontSize:11 }}>(you)</span>}
      </span>
      <span style={{ fontFamily: D.display, fontWeight:800, fontSize:15, color: T.ink }}>{player.totalScore.toLocaleString()}</span>
    </div>
  );
}
