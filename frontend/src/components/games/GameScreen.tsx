'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, useGameState, useActiveChaos } from '@/store/gameStore';
import MarioGame from './MarioGame';
import KnockbackArena from './KnockbackArena';
import ShoppingCart from './ShoppingCart';
import RageObby from './RageObby';
import FloorIsLava from './FloorIsLava';
import PhysicsSoccer from './PhysicsSoccer';
import { useSocketActions } from '@/hooks/useSocket';
import { ChaosAnnouncement, ChaosFlash, DiscoFilter } from '@/components/ui/ChaosOverlay';
import ToastContainer from '@/components/ui/ToastContainer';
import { GameState, Player, PlayerResult } from '@/types';

const T = {
  bg:     '#0A0A12',
  bg2:    '#0E0E18',
  paper:  '#15151F',
  ink:    '#F4F4F6',
  ink2:   '#CDCFD7',
  ink3:   '#8A8DA0',
  line:   'rgba(255,255,255,0.08)',
  lineStr:'rgba(255,255,255,0.16)',
  torch:  '#FF4D2D',
  lake:   '#3B82F6',
  gold:   '#F59E0B',
  leaf:   '#00C271',
  grape:  '#8B5CF6',
};
const D = { display: "'Manrope', system-ui, sans-serif" as const };
const FONT_MONO = "'Geist Mono', ui-monospace, monospace";

// ── Mini Leaderboard ──────────────────────────────────────────────────────────

function MiniLeaderboard({ gameState }: { gameState: GameState }) {
  const room     = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  if (!room) return null;

  const entries = room.players
    .filter((p: Player) => p.isConnected)
    .map((p: Player) => ({
      ...p,
      roundScore: gameState.scores[p.socketId] ?? 0,
    }))
    .sort((a: { roundScore: number }, b: { roundScore: number }) => b.roundScore - a.roundScore);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {entries.map((p: Player & { roundScore: number }, idx: number) => (
        <motion.div key={p.id} layout style={{
          display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:10,
          background: p.id === playerId ? `${T.torch}18` : 'rgba(255,255,255,0.03)',
          border:`1px solid ${p.id === playerId ? `${T.torch}44` : T.line}`,
        }}>
          <span style={{ fontFamily:FONT_MONO, fontSize:11, color: T.ink3, width:14, textAlign:'center' }}>{idx+1}</span>
          <div style={{
            width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14, flexShrink:0, background:`${p.color}22`, border:`1.5px solid ${p.color}`,
          }}>{p.avatar}</div>
          <span style={{ flex:1, fontFamily: D.display, fontWeight:500, fontSize:12, color: T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.username}</span>
          <span style={{ fontFamily: D.display, fontWeight:700, fontSize:12, color: T.ink }}>{p.roundScore.toLocaleString()}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Timer Bar ─────────────────────────────────────────────────────────────────

function TimerBar({ timeRemaining, totalTime }: { timeRemaining: number; totalTime: number }) {
  const pct      = Math.max(0, (timeRemaining / totalTime) * 100);
  const isUrgent = timeRemaining <= 10;
  return (
    <div style={{ position:'relative', height:8, background:'rgba(255,255,255,0.08)', borderRadius:999, overflow:'hidden' }}>
      <motion.div
        style={{
          position:'absolute', inset:'0 auto 0 0', borderRadius:999,
          background: isUrgent
            ? `linear-gradient(90deg, ${T.torch}, ${T.gold})`
            : `linear-gradient(90deg, ${T.lake}, ${T.grape})`,
          boxShadow: isUrgent ? `0 0 8px ${T.torch}88` : `0 0 8px ${T.lake}66`,
        }}
        animate={{ width:`${pct}%` }}
        transition={{ duration:.5, ease:'linear' }}
      />
      {isUrgent && (
        <motion.div
          style={{ position:'absolute', inset:0, borderRadius:999, background:`rgba(233,79,29,0.35)` }}
          animate={{ opacity:[0,.4,0] }}
          transition={{ repeat:Infinity, duration:.5 }}
        />
      )}
    </div>
  );
}

// ── Game Results Screen ────────────────────────────────────────────────────────

function GameResultsScreen() {
  const results  = useGameStore((s) => s.gameResults);
  const room     = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  if (!results) return null;

  const sorted   = [...results.scores].sort((a: PlayerResult, b: PlayerResult) => b.roundScore - a.roundScore);
  const myResult = results.scores.find((s: PlayerResult) => s.playerId === playerId);

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', padding:'24px 16px' }}>
      <motion.div initial={{ opacity:0, scale:.9 }} animate={{ opacity:1, scale:1 }} style={{ width:'100%', maxWidth:420 }}>

        <h2 style={{ fontFamily: D.display, fontWeight:800, fontSize:36, color: T.ink, textAlign:'center', margin:'0 0 4px', letterSpacing:'-0.035em' }}>
          Round <em style={{ fontStyle:'italic', fontWeight:300, color: T.torch }}>Over!</em>
        </h2>

        {results.highlights.length > 0 && (
          <div style={{ textAlign:'center', marginBottom:16 }}>
            {results.highlights.map((h, i) => (
              <motion.p key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*.12 }}
                style={{ fontFamily: D.display, fontWeight:700, fontSize:15, color: T.gold, margin:'4px 0' }}>{h}</motion.p>
            ))}
          </div>
        )}

        <div style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:18, padding:14, marginBottom:16, display:'flex', flexDirection:'column', gap:8 }}>
          {sorted.map((s: PlayerResult, idx: number) => {
            const player = room?.players.find((p: Player) => p.id === s.playerId);
            const isMe   = s.playerId === playerId;
            const medals = ['🥇','🥈','🥉'];
            return (
              <motion.div key={s.playerId} initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }} transition={{ delay:idx*.07 }}
                style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12,
                  background: isMe ? `${T.torch}18` : 'rgba(255,255,255,0.03)',
                  border:`1px solid ${isMe ? `${T.torch}44` : T.line}`,
                }}>
                <span style={{ fontSize:18 }}>{medals[idx] ?? `${idx+1}.`}</span>
                <div style={{
                  width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, flexShrink:0, background:`${player?.color ?? T.grape}22`, border:`2px solid ${player?.color ?? T.grape}`,
                }}>{player?.avatar ?? '🎮'}</div>
                <span style={{ flex:1, fontFamily: D.display, fontWeight:600, fontSize:14, color: T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {s.username || player?.username}
                  {isMe && <span style={{ color: T.torch, fontSize:11, marginLeft:6 }}>(you)</span>}
                </span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily: D.display, fontWeight:800, fontSize:15, color: T.ink }}>+{s.roundScore.toLocaleString()}</div>
                  <div style={{ fontSize:11, color: T.ink3 }}>{s.totalScore.toLocaleString()} total</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {myResult && myResult.rank === 1 && (
          <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:'spring', stiffness:280, delay:.5 }}
            style={{ textAlign:'center', fontFamily: D.display, fontWeight:800, fontSize:22, color: T.gold, marginBottom:12 }}>
            🏆 YOU WIN THIS ROUND!
          </motion.div>
        )}

        <p style={{ textAlign:'center', fontFamily:FONT_MONO, fontSize:12, color: T.ink3 }}>Next game loading…</p>
      </motion.div>
    </div>
  );
}

// ── Game Intro Screen ─────────────────────────────────────────────────────────

function GameIntroScreen({ gameState }: { gameState: GameState }) {
  const INFO: Record<string, { name: string; emoji: string; desc: string; color: string }> = {
    'mario-race':           { name:'Mario Race',           emoji:'🍄', color: T.lake,   desc:'Race to the 🏁 pipe! Stomp Goombas, hit ? blocks, use power-ups. First one in wins!' },
    'knockback-arena':      { name:'Knockback Arena',      emoji:'👊', color: '#EC4899', desc:'Punch and dash everyone off the platforms. Last one standing wins.' },
    'shopping-cart-racing': { name:'Shopping Cart Racing', emoji:'🛒', color: T.gold,   desc:'Drift down park roads, knock rivals off course, reach the finish line!' },
    'rage-obby':            { name:'Rage Obby',            emoji:'😤', color: T.grape,  desc:'Jump across platforms, dodge spikes, ride moving ledges. Die → last checkpoint!' },
    'floor-is-lava':        { name:'Floor is Lava',        emoji:'🌋', color: T.torch,  desc:'The lava is rising! Climb the tower, knock rivals off, be the last one alive.' },
    'physics-soccer':       { name:'Physics Soccer',       emoji:'⚽', color: T.leaf,   desc:'Slam the ball into the goal. Chaotic physics, boost dashes, ridiculous collisions.' },
  };

  const info = INFO[gameState.type] ?? { name: gameState.type, emoji:'🎮', color: T.torch, desc:'Get ready!' };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', padding:24 }}>
      <motion.div initial={{ opacity:0, scale:.6 }} animate={{ opacity:1, scale:1 }}
        transition={{ type:'spring', stiffness:200, damping:15 }}
        style={{ textAlign:'center', maxWidth:480 }}>

        <motion.div animate={{ rotate:[0,-10,10,-10,0] }} transition={{ delay:.5, duration:.5 }}
          style={{ fontSize:80, marginBottom:20, display:'block' }}>{info.emoji}</motion.div>

        <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.2 }}
          style={{ fontFamily: D.display, fontWeight:800, fontSize:'clamp(32px,7vw,56px)', color: T.paper, margin:'0 0 12px', letterSpacing:'-0.04em', lineHeight:.95 }}>
          {info.name}
        </motion.h2>

        <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.35 }}
          style={{ fontFamily: D.display, fontSize:16, color: T.ink2, marginBottom:20, lineHeight:1.5 }}>
          {info.desc}
        </motion.p>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
          style={{ fontFamily:FONT_MONO, fontSize:12, color: T.ink3, marginBottom:16 }}>
          Game {gameState.gameNumber} of {gameState.totalGames}
        </motion.div>

        <motion.div animate={{ opacity:[.5,1,.5] }} transition={{ repeat:Infinity, duration:1 }}
          style={{ fontFamily: D.display, fontWeight:700, fontSize:18, color: info.color }}>
          Get ready…
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Main Game Screen ──────────────────────────────────────────────────────────

export default function GameScreen() {
  const gameState   = useGameState();
  const gameResults = useGameStore((s) => s.gameResults);
  const activeChaos = useActiveChaos();
  const { leaveRoom } = useSocketActions();
  const totalTimeRef = React.useRef<number>(180);

  void leaveRoom; // available if needed

  if (!gameState) return null;

  // Capture the max timeRemaining seen as the total duration for the progress bar
  if (gameState.timeRemaining > totalTimeRef.current || gameState.phase === 'intro') {
    totalTimeRef.current = Math.max(gameState.timeRemaining, 1);
  }

  const isPlaying  = gameState.phase === 'playing';
  const isIntro    = gameState.phase === 'intro';
  const isResults  = gameState.phase === 'results';
  const totalTime  = totalTimeRef.current;

  return (
    <div style={{ minHeight:'100vh', background:'#14161B', position:'relative', overflowX:'hidden' }}
      className={activeChaos?.type === 'SCREEN_SHAKE' ? 'chaos-shake' : ''}>
      <style>{`
        .gs-panel { background: rgba(21,21,31,0.96); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(8px); }
      `}</style>

      <ChaosAnnouncement />
      <ChaosFlash />
      <DiscoFilter />

      {/* Top HUD bar */}
      <div className="gs-panel" style={{ position:'relative', zIndex:20, borderRadius:0, borderLeft:'none', borderRight:'none', borderTop:'none', padding:'10px 16px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', alignItems:'center', gap:12 }}>
          {/* Timer number */}
          <div style={{
            fontFamily: D.display, fontWeight:800, fontSize:32, lineHeight:1,
            color: gameState.timeRemaining <= 10 ? T.torch : T.ink,
            letterSpacing:'-0.04em', minWidth:'2ch', textAlign:'center', tabularNums: true,
          } as React.CSSProperties}>
            {gameState.timeRemaining}
          </div>

          {/* Timer bar */}
          <div style={{ flex:1 }}>
            <TimerBar timeRemaining={gameState.timeRemaining} totalTime={totalTime} />
          </div>

          {/* Game counter */}
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:FONT_MONO, fontSize:11, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.1em' }}>
              Game {gameState.gameNumber}/{gameState.totalGames}
            </div>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'12px 16px 16px', display:'grid', gridTemplateColumns:'1fr', gap:12 }} className="gs-layout">
        <style>{`@media(min-width:900px){.gs-layout{grid-template-columns:1fr 220px !important;}}`}</style>

        {/* Game area */}
        <div>
          <AnimatePresence mode="wait">
            {isResults && gameResults ? (
              <motion.div key="results" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ background: T.paper, borderRadius:18, overflow:'hidden' }}>
                <GameResultsScreen />
              </motion.div>
            ) : isIntro ? (
              <motion.div key="intro" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ borderRadius:18, overflow:'hidden', background:'#14161B', minHeight:400 }}>
                <GameIntroScreen gameState={gameState} />
              </motion.div>
            ) : (
              <motion.div key={`game-${gameState.type}`} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ borderRadius:18, overflow:'hidden' }}>
                {gameState.type === 'mario-race'           && <MarioGame />}
                {gameState.type === 'knockback-arena'      && <KnockbackArena />}
                {gameState.type === 'shopping-cart-racing' && <ShoppingCart />}
                {gameState.type === 'rage-obby'            && <RageObby />}
                {gameState.type === 'floor-is-lava'        && <FloorIsLava />}
                {gameState.type === 'physics-soccer'       && <PhysicsSoccer />}
                {!['mario-race','knockback-arena','shopping-cart-racing','rage-obby','floor-is-lava','physics-soccer'].includes(gameState.type) && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:240, color: T.ink3, fontFamily: D.display, fontSize:18 }}>
                    Coming soon: {gameState.type} 🚧
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar leaderboard */}
        <div className="gs-panel" style={{ borderRadius:16, padding:14, alignSelf:'start', position:'sticky', top:8 }}>
          <p style={{ fontFamily:FONT_MONO, fontSize:10, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.16em', marginBottom:10 }}>Scores</p>
          <MiniLeaderboard gameState={gameState} />
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
