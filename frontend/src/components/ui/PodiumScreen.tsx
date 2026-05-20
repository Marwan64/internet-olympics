'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions } from '@/hooks/useSocket';
import { PlayerResult } from '@/types';
import ToastContainer from './ToastContainer';

const T = {
  bg:      '#F4EEE2',
  bg2:     '#EDE5D2',
  paper:   '#FBF7EE',
  ink:     '#14161B',
  ink2:    '#2A2D36',
  ink3:    '#5A5F6C',
  line:    'rgba(20,22,27,0.12)',
  lineStr: 'rgba(20,22,27,0.22)',
  torch:   '#E94F1D',
  lake:    '#1F5BD8',
  gold:    '#F4B400',
  leaf:    '#1E5A3A',
  grape:   '#5E37B7',
};
const D = { display: "'Bricolage Grotesque',system-ui,sans-serif" as const };
const SERIF = "'Instrument Serif',Georgia,serif" as const;

const RANK_ACCENT = [T.gold, T.ink3, '#B45309'];
const RANK_HEIGHTS = [192, 140, 112];
const RANK_EMOJI = ['🥇','🥈','🥉'];

export default function PodiumScreen() {
  const podiumData = useGameStore((s) => s.podiumData);
  const playerId   = useGameStore((s) => s.playerId);
  const { leaveRoom } = useSocketActions();

  if (!podiumData) return null;

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
    <div style={{ minHeight:'100vh', background: T.bg, display:'flex', flexDirection:'column', overflowX:'hidden' }}>
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
            <em style={{ fontFamily: SERIF, fontStyle:'italic', fontWeight:400, color: T.torch }}>Over</em>
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
      background: isMe ? `${T.torch}0f` : T.bg2,
      border:`1px solid ${isMe ? `${T.torch}44` : T.line}`,
    }}>
      <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color: T.ink3, width:24, textAlign:'center' }}>#{player.rank}</span>
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
