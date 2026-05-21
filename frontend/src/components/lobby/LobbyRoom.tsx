'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { Player, ChatMessage, GameType } from '@/types';
import ToastContainer from '@/components/ui/ToastContainer';

// ── Design tokens ─────────────────────────────────────────────────────────────
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

// ── Game metadata ─────────────────────────────────────────────────────────────

const ALL_GAMES: { type: GameType; emoji: string; name: string }[] = [
  { type: 'mario-race',           emoji: '🍄', name: 'Mario Race' },
  { type: 'knockback-arena',      emoji: '👊', name: 'Knockback Arena' },
  { type: 'shopping-cart-racing', emoji: '🛒', name: 'Shopping Cart Racing' },
  { type: 'rage-obby',            emoji: '😤', name: 'Rage Obby' },
  { type: 'floor-is-lava',        emoji: '🌋', name: 'Floor is Lava' },
  { type: 'physics-soccer',       emoji: '⚽', name: 'Physics Soccer' },
];

function gameLabel(type: GameType): string {
  const g = ALL_GAMES.find(g => g.type === type);
  return g ? `${g.emoji} ${g.name}` : type;
}

function randomPlaylist(count: number): GameType[] {
  return [...ALL_GAMES].sort(() => Math.random() - 0.5).map(g => g.type).slice(0, Math.min(count, 6));
}

// ── Game Picker ───────────────────────────────────────────────────────────────

function GamePicker({ playlist, isHost }: { playlist: GameType[]; isHost: boolean }) {
  const [mode, setMode] = useState<'random' | 'custom'>('random');
  const [randomCount, setRandomCount] = useState(playlist.length || 3);
  const [selected, setSelected] = useState<GameType[]>(playlist);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(playlist); }, [playlist.join(',')]);

  function emit(pl: GameType[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (getSocket() as any).emit('lobby:set_playlist', pl);
  }

  function handleRandomCount(n: number) { setRandomCount(n); emit(randomPlaylist(n)); }
  function handleReroll() { emit(randomPlaylist(randomCount)); }

  function toggleGame(type: GameType) {
    let next: GameType[];
    if (selected.includes(type)) {
      if (selected.length <= 1) return;
      next = selected.filter(g => g !== type);
    } else {
      if (selected.length >= 6) return;
      next = [...selected, type];
    }
    setSelected(next);
    emit(next);
  }

  function switchMode(m: 'random' | 'custom') {
    setMode(m);
    if (m === 'random') emit(randomPlaylist(randomCount));
    else setSelected(playlist.length ? playlist : [ALL_GAMES[0].type]);
  }

  if (!isHost) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {playlist.map((game, idx) => (
          <div key={idx} style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, color: T.ink2 }}>
            <span style={{ fontFamily:FONT_MONO, fontSize:11, color: T.ink3, width:16 }}>{idx + 1}.</span>
            {gameLabel(game)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Mode toggle */}
      <div style={{ display:'flex', gap:4, padding:3, borderRadius:12, background: T.bg2 }}>
        {(['random','custom'] as const).map(m => (
          <button key={m} onClick={() => switchMode(m)} style={{
            flex:1, padding:'7px 0', borderRadius:9, border:'none', cursor:'pointer',
            fontFamily: D.display, fontWeight:600, fontSize:12,
            background: mode === m ? T.ink : 'transparent',
            color: mode === m ? T.bg : T.ink3,
            transition: 'all .15s',
          }}>
            {m === 'random' ? '🎲 Random' : '✏️ Custom'}
          </button>
        ))}
      </div>

      {mode === 'random' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <p style={{ margin:0, fontSize:12, color: T.ink3 }}>How many games?</p>
          <div style={{ display:'flex', gap:4 }}>
            {[1,2,3,4,5,6].map(n => (
              <button key={n} onClick={() => handleRandomCount(n)} style={{
                flex:1, padding:'7px 0', borderRadius:8, border:`1px solid ${randomCount === n ? T.torch : T.line}`,
                background: randomCount === n ? T.torch : T.bg2,
                color: randomCount === n ? T.paper : T.ink2,
                fontFamily: D.display, fontWeight:700, fontSize:13, cursor:'pointer',
              }}>{n}</button>
            ))}
          </div>
          <button onClick={handleReroll} style={{
            width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${T.line}`,
            background: T.bg2, color: T.ink2, fontFamily: D.display, fontWeight:600, fontSize:12, cursor:'pointer',
          }}>🔀 Re-roll</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <p style={{ margin:0, fontSize:12, color: T.ink3 }}>Pick 1–6 games (in order):</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {ALL_GAMES.map(g => {
              const on = selected.includes(g.type);
              const idx = selected.indexOf(g.type);
              return (
                <button key={g.type} onClick={() => toggleGame(g.type)} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'8px 10px',
                  borderRadius:10, border:`1.5px solid ${on ? T.torch : T.line}`,
                  background: on ? `${T.torch}12` : T.bg2,
                  color: on ? T.ink : T.ink3, cursor:'pointer',
                  fontFamily: D.display, fontWeight:600, fontSize:12, textAlign:'left',
                }}>
                  <span style={{ fontSize:16 }}>{g.emoji}</span>
                  <span style={{ flex:1, lineHeight:1.2 }}>{g.name}</span>
                  {on && (
                    <span style={{
                      width:18, height:18, borderRadius:'50%', background: T.torch,
                      color: T.paper, display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:9, fontWeight:900, flexShrink:0,
                    }}>{idx + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Playlist preview */}
      <div style={{ paddingTop:8, borderTop:`1px solid ${T.line}` }}>
        <p style={{ margin:'0 0 6px', fontSize:11, color: T.ink3, fontFamily:FONT_MONO, textTransform:'uppercase', letterSpacing:'0.1em' }}>Playlist:</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {playlist.map((g, i) => (
            <span key={i} style={{ fontSize:11, background: T.bg2, borderRadius:6, padding:'3px 8px', color: T.ink2 }}>
              {i+1}. {gameLabel(g)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── QR Code ───────────────────────────────────────────────────────────────────

function QRCode({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const url = `${window.location.origin}?join=${code}`;
    import('qrcode').then((QR) => {
      if (canvasRef.current) {
        QR.toCanvas(canvasRef.current, url, {
          width: 132, margin: 1,
          color: { dark: '#F4F4F6', light: '#15151F' },
        });
      }
    });
  }, [code]);
  return <canvas ref={canvasRef} style={{ borderRadius:10 }} />;
}

// ── Player Card ───────────────────────────────────────────────────────────────

function PlayerCard({ player, isMe, isHost: viewerIsHost }: { player: Player; isMe: boolean; isHost: boolean }) {
  function kickPlayer() {
    if (viewerIsHost && !isMe) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getSocket() as any).emit('lobby:kick', player.id);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity:0, scale:.9 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0, scale:.9 }}
      className="group"
      style={{
        display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
        borderRadius:14,
        background: isMe ? `${T.torch}0f` : T.bg2,
        border:`1px solid ${isMe ? `${T.torch}44` : T.line}`,
      }}
    >
      <div style={{
        width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:20, flexShrink:0, position:'relative',
        background:`${player.color}22`, border:`2px solid ${player.color}`,
        boxShadow: player.ready ? `0 0 10px ${player.color}60` : 'none',
      }}>
        {player.avatar}
        {player.isHost && <div style={{ position:'absolute', top:-4, right:-4, fontSize:12 }}>👑</div>}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontFamily: D.display, fontWeight:600, fontSize:14, color: T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{player.username}</span>
          {isMe && <span style={{ fontSize:11, color: T.torch, fontFamily:FONT_MONO }}>(you)</span>}
        </div>
        <div style={{ fontSize:12, color: T.ink3, marginTop:2 }}>
          {!player.isConnected ? '🔴 Reconnecting...' : player.ready ? '✅ Ready' : '⏳ Waiting...'}
        </div>
      </div>

      <span style={{
        fontSize:11, fontWeight:700, fontFamily: D.display, padding:'4px 9px', borderRadius:7,
        background: player.ready ? `${T.leaf}18` : T.bg,
        color: player.ready ? T.leaf : T.ink3,
        border:`1px solid ${player.ready ? `${T.leaf}44` : T.line}`,
      }}>
        {player.ready ? 'READY' : 'WAITING'}
      </span>

      {viewerIsHost && !isMe && !player.isHost && (
        <button onClick={kickPlayer} className="group-hover:opacity-100" style={{
          opacity:0, fontSize:12, color:'#B91C1C', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:6, transition:'opacity .15s',
        }}>Kick</button>
      )}
    </motion.div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function ChatPanel() {
  const messages = useGameStore((s) => s.chatMessages);
  const { sendChat } = useSocketActions();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    sendChat(t); setInput('');
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, maxHeight:260 }}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} style={{ display:'flex', gap:8, marginTop:12 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="Say something..." maxLength={200}
          style={{
            flex:1, background: T.bg2, border:`1.5px solid ${T.line}`, borderRadius:10,
            padding:'9px 12px', color: T.ink, fontFamily:'inherit', fontSize:14,
            outline:'none',
          }}
          onFocus={e => (e.target.style.borderColor = T.torch)}
          onBlur={e => (e.target.style.borderColor = T.line)}
        />
        <button type="submit" style={{
          padding:'9px 16px', borderRadius:10, border:'none', cursor:'pointer',
          background: T.torch, color: T.paper, fontFamily: D.display, fontWeight:700, fontSize:13,
        }}>Send</button>
      </form>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'system') {
    return (
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
        style={{ textAlign:'center', fontSize:12, color: T.ink3, padding:'2px 0' }}>
        {msg.message}
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
      style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
      <div style={{
        width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:13, flexShrink:0, marginTop:1,
        background:`${msg.color}22`, border:`1px solid ${msg.color}66`,
      }}>{msg.avatar}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <span style={{ fontSize:11, fontWeight:700, color: msg.color }}>{msg.username}: </span>
        <span style={{ fontSize:13, color: T.ink2, wordBreak:'break-word' }}>{msg.message}</span>
      </div>
    </motion.div>
  );
}

// ── Main Lobby ────────────────────────────────────────────────────────────────

export default function LobbyRoom() {
  const room       = useGameStore((s) => s.room);
  const playerId   = useGameStore((s) => s.playerId);
  const countdown  = useGameStore((s) => s.gameCountdown);
  const { setReady, startGame, leaveRoom } = useSocketActions();
  const [copied, setCopied] = useState(false);
  const [tab, setTab]       = useState<'players' | 'chat'>('players');

  if (!room) return null;

  const me               = room.players.find((p) => p.id === playerId);
  const isHost           = me?.isHost ?? false;
  const connected        = room.players.filter((p) => p.isConnected);
  const allReady         = connected.every((p) => p.ready || p.isHost);
  const readyCount       = connected.filter((p) => p.ready).length;
  const nonHostCount     = connected.length - (isHost ? 1 : 0);
  const readyPct         = nonHostCount > 0 ? (readyCount / nonHostCount) * 100 : 0;

  function copyCode() {
    navigator.clipboard.writeText(room!.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ minHeight:'100vh', background: T.bg, overflowX:'hidden', color: T.ink }}>
      <style>{`
        .lobby-btn { transition: transform .15s ease, background .15s ease; }
        .lobby-btn:hover { transform: translateY(-1px); }
        .lobby-btn:active { transform: scale(.97); }
      `}</style>

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{
              position:'fixed', inset:0, zIndex:50,
              background:'rgba(0,0,0,0.88)', backdropFilter:'blur(12px)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}
          >
            <motion.div
              key={countdown}
              initial={{ scale:2, opacity:0 }}
              animate={{ scale:1, opacity:1 }}
              exit={{ scale:.5, opacity:0 }}
              transition={{ duration:.7 }}
              style={{
                fontFamily: D.display, fontWeight:800, fontSize:'14rem', lineHeight:1,
                color: T.torch, letterSpacing:'-0.06em',
                filter:`drop-shadow(0 0 40px ${T.torch}bb)`,
              }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <motion.div initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }}>
            {/* Wordmark */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ display:'inline-block', width:22, height:16, position:'relative', flexShrink:0 }}>
                <span style={{ position:'absolute', width:11, height:11, borderRadius:'50%', border:`2px solid ${T.torch}`, left:0, top:0 }} />
                <span style={{ position:'absolute', width:11, height:11, borderRadius:'50%', border:`2px solid ${T.ink}`, left:5, top:4 }} />
                <span style={{ position:'absolute', width:11, height:11, borderRadius:'50%', border:`2px solid ${T.lake}`, left:10, top:0 }} />
              </span>
              <span style={{ fontFamily: D.display, fontWeight:600, fontSize:14, color: T.ink3, letterSpacing:'-0.01em' }}>Internet Olympics</span>
            </div>
            <h1 style={{ fontFamily: D.display, fontWeight:800, fontSize:'clamp(28px,4vw,42px)', color: T.ink, margin:0, letterSpacing:'-0.035em', lineHeight:1 }}>
              Game <em style={{ fontStyle:'italic', fontWeight:300, color: T.torch }}>Lobby</em>
            </h1>
          </motion.div>
          <button onClick={leaveRoom} className="lobby-btn" style={{
            background:'none', border:`1px solid ${T.lineStr}`, borderRadius:999,
            color: T.ink2, fontFamily: D.display, fontWeight:600, fontSize:13,
            padding:'8px 16px', cursor:'pointer',
          }}>Leave →</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:16 }} className="lobby-grid">
          <style>{`@media(min-width:900px){.lobby-grid{grid-template-columns:300px 1fr !important;}}`}</style>

          {/* ── Left column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Room Code */}
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
              style={{ background: T.paper, border:`1px solid ${T.lineStr}`, borderRadius:20, padding:20 }}>
              <p style={{ margin:'0 0 6px', fontFamily:FONT_MONO, fontSize:11, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.16em' }}>Room Code</p>
              <button onClick={copyCode} style={{
                display:'block', width:'100%', fontFamily:FONT_MONO, fontWeight:900,
                fontSize:44, letterSpacing:'0.2em', color: T.ink,
                background:'none', border:'none', cursor:'pointer', padding:'6px 0',
                textAlign:'center', transition:'color .15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = T.torch)}
                onMouseLeave={e => (e.currentTarget.style.color = T.ink)}
              >
                {room.code}
              </button>
              <p style={{ textAlign:'center', fontSize:12, color: copied ? T.leaf : T.ink3, margin:'2px 0 16px', transition:'color .2s' }}>
                {copied ? '✅ Copied!' : 'Click to copy'}
              </p>
              <div style={{ display:'flex', justifyContent:'center' }}>
                <QRCode code={room.code} />
              </div>
              <p style={{ textAlign:'center', fontSize:11, color: T.ink3, marginTop:8, fontFamily:FONT_MONO }}>Scan to join instantly</p>
            </motion.div>

            {/* Share link */}
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.08 }}
              style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:16, padding:16 }}>
              <p style={{ margin:'0 0 4px', fontSize:11, color: T.ink3, fontFamily:FONT_MONO, textTransform:'uppercase', letterSpacing:'0.12em' }}>Share link</p>
              <p style={{ fontFamily:FONT_MONO, fontSize:12, color: T.lake, wordBreak:'break-all', margin:0 }}>
                {typeof window !== 'undefined' ? `${window.location.origin}?join=${room.code}` : `...?join=${room.code}`}
              </p>
            </motion.div>

            {/* Game picker */}
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.12 }}
              style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:16, padding:16 }}>
              <p style={{ margin:'0 0 12px', fontFamily:FONT_MONO, fontSize:11, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.14em' }}>
                {isHost ? '🎮 Game Picker' : '🎮 Playlist'}
              </p>
              <GamePicker playlist={room.gamePlaylist} isHost={isHost} />
            </motion.div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Tab strip */}
            <div style={{ display:'flex', gap:6 }}>
              {(['players','chat'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className="lobby-btn" style={{
                  padding:'9px 18px', borderRadius:999,
                  border:`1px solid ${tab === t ? T.ink : T.line}`,
                  background: tab === t ? T.ink : 'transparent',
                  color: tab === t ? T.bg : T.ink2,
                  fontFamily: D.display, fontWeight:600, fontSize:13, cursor:'pointer',
                }}>
                  {t === 'players' ? `👥 Players (${connected.length}/${room.maxPlayers})` : '💬 Chat'}
                </button>
              ))}
            </div>

            {/* Players / Chat panel */}
            <motion.div
              style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:20, padding:16, minHeight:320 }}>
              {tab === 'players' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <AnimatePresence>
                    {room.players.filter(p => p.isConnected).map(player => (
                      <PlayerCard key={player.id} player={player} isMe={player.id === playerId} isHost={isHost} />
                    ))}
                  </AnimatePresence>
                  {connected.length < 2 && (
                    <p style={{ textAlign:'center', color: T.ink3, fontSize:14, padding:'20px 0' }}>
                      Waiting for more players… Share the code! 🔗
                    </p>
                  )}
                </div>
              ) : (
                <ChatPanel />
              )}
            </motion.div>

            {/* Ready / Start */}
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:.2 }}
              style={{ background: T.paper, border:`1px solid ${T.line}`, borderRadius:20, padding:20 }}>

              {/* Progress bar */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color: T.ink2, marginBottom:8 }}>
                  <span>{readyCount} / {nonHostCount} ready</span>
                  {allReady && connected.length >= 1 && (
                    <span style={{ color: T.leaf, fontWeight:700 }}>✨ All ready!</span>
                  )}
                </div>
                <div style={{ height:6, borderRadius:999, background: T.bg2, overflow:'hidden' }}>
                  <motion.div
                    style={{ height:'100%', borderRadius:999, background: `linear-gradient(90deg, ${T.lake}, ${T.torch})` }}
                    animate={{ width:`${readyPct}%` }}
                    transition={{ type:'spring', stiffness:200 }}
                  />
                </div>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                {!isHost && (
                  <button onClick={() => setReady(!me?.ready)} className="lobby-btn" style={{
                    flex:1, padding:'14px', borderRadius:999, cursor:'pointer',
                    fontFamily: D.display, fontWeight:700, fontSize:16,
                    background: me?.ready ? `${T.leaf}1a` : T.torch,
                    color: me?.ready ? T.leaf : T.paper,
                    border: me?.ready ? `1px solid ${T.leaf}55` : `1px solid ${T.torch}`,
                    boxShadow: me?.ready ? 'none' : `0 6px 20px -6px ${T.torch}88`,
                  }}>
                    {me?.ready ? '✅ Ready!' : '⏳ Not Ready'}
                  </button>
                )}
                {isHost && (
                  <button onClick={startGame} disabled={connected.length < 1} className="lobby-btn" style={{
                    flex:1, padding:'14px', borderRadius:999, border:'none', cursor:'pointer',
                    fontFamily: D.display, fontWeight:700, fontSize:16,
                    background: T.torch, color: T.paper,
                    boxShadow:`0 6px 20px -6px ${T.torch}88`,
                    opacity: connected.length < 1 ? .5 : 1,
                  }}>
                    🚀 Start Game!
                  </button>
                )}
              </div>

              {isHost && connected.length === 1 && (
                <p style={{ textAlign:'center', fontSize:12, color: T.ink3, marginTop:8 }}>
                  You can start solo to test, or wait for friends.
                </p>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
