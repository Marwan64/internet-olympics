'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocket } from '@/hooks/useSocket';
import { AVATAR_OPTIONS, COLOR_OPTIONS } from '@/types';
import LobbyRoom from '@/components/lobby/LobbyRoom';
import GameScreen from '@/components/games/GameScreen';
import PodiumScreen from '@/components/ui/PodiumScreen';
import ToastContainer from '@/components/ui/ToastContainer';
import { useSounds } from '@/hooks/useSounds';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#0A0A12',
  bg2:      '#0E0E18',
  surface:  '#15151F',
  surface2: '#1B1B28',
  ink:      '#F4F4F6',
  ink2:     '#CDCFD7',
  ink3:     '#8A8DA0',
  ink4:     '#5B5E70',
  line:     'rgba(255,255,255,0.08)',
  line2:    'rgba(255,255,255,0.16)',
  // per-game accents
  lava:   '#FF4D2D',
  soc:    '#00C271',
  obby:   '#8B5CF6',
  mario:  '#3B82F6',
  knock:  '#EC4899',
  cart:   '#F59E0B',
};

const FONT_DISPLAY = "'Manrope', system-ui, sans-serif";
const FONT_MONO    = "'Geist Mono', ui-monospace, monospace";

// ── Game data ─────────────────────────────────────────────────────────────────
const GAMES = [
  {
    id: '01', key: 'lava',  name: 'Floor is Lava',        accentWord: 'Lava',
    color: T.lava,  color2: '#FFC247',
    tag: 'Party · Platforming', badge: 'FIRE',
    desc: 'The floor turns to molten death. Climb the furniture. Last one not on fire wins.',
    descShort: "Climb the furniture. Don't touch the carpet. Don't trust your friends.",
    players: '2 – 16', time: '3 min', vibe: 'Panic',
    image: '/floor-is-lava.png',
  },
  {
    id: '02', key: 'soc',   name: 'Physics Soccer',        accentWord: 'Soccer',
    color: T.soc,   color2: '#A6FFD9',
    tag: 'Sports · Teams', badge: 'TEAMS',
    desc: 'Tiny pitch, big chaos. Rocket physics, no fouls, emoji players, pure mayhem.',
    descShort: 'Rocket physics. No fouls. Chaos on a pitch the size of a postage stamp.',
    players: '4 – 12', time: '3 min', vibe: 'Hype',
    image: '/soccer.png',
  },
  {
    id: '03', key: 'obby',  name: 'Rage Obby',             accentWord: 'Obby',
    color: T.obby,  color2: '#22D3EE',
    tag: 'Platforming · Solo', badge: 'HARD',
    desc: 'Spike pits, moving platforms, spinning blades, and checkpoints. Keep climbing.',
    descShort: 'Spike pits, disappearing tiles, spinning blades. Voice chat recommended.',
    players: '1 – 10', time: '4 min', vibe: 'Suffering',
    image: '/rage-obby.png',
  },
  {
    id: '04', key: 'mario', name: 'Mario Race',             accentWord: 'Race',
    color: T.mario, color2: '#FDE047',
    tag: 'Racing · Items', badge: 'NEW',
    desc: 'Karts, power-ups, star mode, fireballs — first to the flag wins.',
    descShort: 'Karts, banana peels, power-ups, blue flames. You already know how it goes.',
    players: '2 – 12', time: '3 min', vibe: 'Hostile',
    image: '/mario-race.png',
  },
  {
    id: '05', key: 'knock', name: 'Knockback Arena',        accentWord: 'Arena',
    color: T.knock, color2: '#FDE047',
    tag: 'Combat · Free-for-all', badge: 'FIRE',
    desc: 'No health bars. Punch your friends off a tiny platform. Ring out and lose forever.',
    descShort: 'No health bars. Punch your friends off a tiny platform. Ring out, lose forever.',
    players: '2 – 8', time: '2 min', vibe: 'Aggression',
    image: '/knockback-arena.png',
  },
  {
    id: '06', key: 'cart',  name: 'Shopping Cart Racing',  accentWord: 'Racing',
    color: T.cart,  color2: '#F4F4F6',
    tag: 'Racing · Co-op', badge: 'CO-OP',
    desc: 'Wobbly carts, slippery aisles, milk on the floor. Cross the checkout first.',
    descShort: 'Wobbly carts, slippery aisles, milk on the floor. Cross the checkout first.',
    players: '2 – 16', time: '3 min', vibe: 'Goofy',
    image: '/shopping-cart-racing.png',
  },
];

type FlowStep = 'home' | 'setup' | 'join';

// ── Root page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const screen = useGameStore((s) => s.screen);
  const room   = useGameStore((s) => s.room);

  if (screen === 'lobby' && room) return <><LobbyRoom /><ToastContainer /></>;
  if (screen === 'game')   return <GameScreen />;
  if (screen === 'podium') return <PodiumScreen />;
  return <HomeContent />;
}

// ── Home ──────────────────────────────────────────────────────────────────────
function HomeContent() {
  const [flow, setFlow]         = useState<FlowStep>('home');
  const [pendingCode, setPendingCode] = useState('');
  const [accent, setAccent] = useState(T.lava);
  const [musicOn, setMusicOn]   = useState(false);
  const sounds = useSounds();
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const startRef    = useRef(performance.now());
  const pausedRef   = useRef(false);
  const INTERVAL    = 7000;

  const goTo = useCallback((idx: number) => {
    const next = ((idx % GAMES.length) + GAMES.length) % GAMES.length;
    setActiveIdx(next);
    setAccent(GAMES[next].color);
    startRef.current = performance.now();
    progressRef.current = 0;
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (pausedRef.current) { setProgress(0); return; }
      const pct = Math.min(1, (performance.now() - startRef.current) / INTERVAL);
      progressRef.current = pct;
      setProgress(pct);
      if (pct >= 1) {
        setActiveIdx(prev => {
          const next = (prev + 1) % GAMES.length;
          setAccent(GAMES[next].color);
          startRef.current = performance.now();
          progressRef.current = 0;
          return next;
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const togglePause = () => {
    setPaused(p => { pausedRef.current = !p; return !p; });
  };

  // Handle ?code= invite links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setPendingCode(code.toUpperCase());
      setFlow('join');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  return (
    <div style={{ background: T.bg, color: T.ink, minHeight: '100vh', overflowX: 'hidden',
      fontFamily: FONT_DISPLAY, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        :root { --accent: ${accent}; }
        body::before, body::after {
          content:""; position:fixed; width:60vw; height:60vw; border-radius:50%;
          pointer-events:none; z-index:0; filter:blur(140px); opacity:.18;
          transition:background 1.2s ease;
        }
        body::before { top:-25vw; left:-15vw; background:var(--accent); }
        body::after  { bottom:-30vw; right:-20vw; background:var(--accent); opacity:.12; }
        @keyframes io-pulse { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(.82);opacity:.7;} }
        @keyframes io-rot { to{transform:rotate(360deg);} }
        @keyframes io-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        .io-pulse { animation: io-pulse 1.4s ease-in-out infinite; }
        .io-game-card:hover .io-game-desc { max-height:80px!important; opacity:1!important; margin-bottom:8px!important; }
        .io-game-card:hover .io-game-play { transform:translateX(3px); }
        .io-game-card:hover .io-game-img { transform:scale(1.06); }
        .io-game-card:hover .io-card-glow { opacity:1!important; }
        .io-live-row:hover .io-live-join { opacity:1!important; transform:translateX(0)!important; color:var(--rc,${T.lava})!important; }
        .io-btn { transition: transform .15s ease, background .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .io-btn:hover { transform:translateY(-1px); }
        ::selection { background: ${T.lava}; color:#0a0a12; }
      `}</style>

      {/* Grain overlay */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:200, opacity:0.045,
        mixBlendMode:'overlay',
        backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.4'/></svg>")`,
      }} />

      <Nav
        onCreateRoom={() => { sounds.click(); setFlow('setup'); }}
        onJoin={() => { sounds.click(); setFlow('join'); }}
        accent={accent}
        musicOn={musicOn}
        onToggleMusic={() => { const on = sounds.toggleMusic(); setMusicOn(on); }}
      />

      <Hero
        activeIdx={activeIdx} progress={progress} paused={paused}
        onGoTo={goTo} onTogglePause={togglePause}
        onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')}
        accent={accent}
      />

      <GamesSection onCreateRoom={() => { sounds.click(); setFlow('setup'); }} />
      <GameDescriptionsSection />
      <LiveSection />
      <HowItWorks />
      <CtaSection onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')} />
      <Footer onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')} />

      <ToastContainer />

      {/* Modal */}
      <AnimatePresence>
        {(flow === 'setup' || flow === 'join') && (
          <motion.div
            key="modal-bg"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position:'fixed', inset:0, zIndex:300,
              background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)',
              display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setFlow('home'); }}
          >
            <motion.div
              key="modal-card"
              initial={{ opacity:0, scale:.94, y:16 }} animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:.94, y:16 }}
              transition={{ type:'spring', stiffness:280, damping:24 }}
              style={{ width:'100%', maxWidth:440 }}
            >
              <SetupFlow onBack={() => setFlow('home')} mode={flow === 'setup' ? 'create' : 'join'} initialCode={pendingCode} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ onCreateRoom, onJoin, accent, musicOn, onToggleMusic }: { onCreateRoom:()=>void; onJoin:()=>void; accent:string; musicOn:boolean; onToggleMusic:()=>void }) {
  return (
    <nav style={{ position:'sticky', top:0, zIndex:50, backdropFilter:'blur(14px) saturate(140%)',
      background:'rgba(10,10,18,0.8)', borderBottom:`1px solid ${T.line}` }}>
      <div style={{ maxWidth:1440, margin:'0 auto', padding:'14px 28px',
        display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:28 }}>

        {/* Logo */}
        <a href="#" style={{ display:'inline-flex', alignItems:'center', gap:12,
          textDecoration:'none', color:T.ink, fontWeight:700, fontSize:16, letterSpacing:'-0.02em' }}>
          <span style={{ width:26, height:26, borderRadius:8, position:'relative', flexShrink:0,
            background:`conic-gradient(from 90deg at 50% 50%, ${T.lava} 0deg, ${T.cart} 60deg, ${T.soc} 120deg, ${T.mario} 180deg, ${T.obby} 240deg, ${T.knock} 300deg, ${T.lava} 360deg)`,
            boxShadow:`0 0 0 1px ${T.line2}, 0 8px 24px -8px ${accent}` }}>
            <span style={{ position:'absolute', inset:6, borderRadius:4, background:T.bg }} />
          </span>
          Internet Olympics
        </a>

        {/* Links */}
        <div style={{ display:'flex', gap:26, justifySelf:'center', fontSize:14, color:T.ink3 }}>
          {['Games','How it works','Live'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`}
              style={{ color:'inherit', textDecoration:'none', transition:'color .2s' }}
              onMouseEnter={e=>(e.currentTarget.style.color=T.ink)}
              onMouseLeave={e=>(e.currentTarget.style.color=T.ink3)}>
              {l}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Music toggle */}
          <button onClick={onToggleMusic} title={musicOn ? 'Mute music' : 'Play ambient music'}
            style={{ background:'none', border:`1px solid ${T.line}`, borderRadius:999,
              width:34, height:34, display:'inline-flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', fontSize:15, color: musicOn ? accent : T.ink3,
              transition:'color .2s, border-color .2s' }}>
            {musicOn ? '🔊' : '🔇'}
          </button>
          <span style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 10px 4px 8px',
            borderRadius:999, background:'rgba(255,255,255,0.05)', border:`1px solid ${T.line}`,
            fontFamily:FONT_MONO, fontSize:11, color:T.ink2 }}>
            <span className="io-pulse" style={{ width:7, height:7, borderRadius:'50%', background:accent,
              boxShadow:`0 0 0 3px ${accent}40` }} />
            S4 LIVE
          </span>
          <button onClick={onJoin} className="io-btn" style={{ display:'inline-flex', alignItems:'center', gap:8,
            padding:'10px 16px', fontFamily:FONT_DISPLAY, fontWeight:500, fontSize:13,
            color:T.ink, border:`1px solid ${T.line2}`, background:'rgba(255,255,255,0.04)',
            borderRadius:999, cursor:'pointer' }}>
            Join with code
          </button>
          <button onClick={onCreateRoom} className="io-btn" style={{ display:'inline-flex', alignItems:'center', gap:8,
            padding:'10px 16px', fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:13,
            color:'#0a0a12', background:T.ink, border:`1px solid ${T.ink}`,
            borderRadius:999, cursor:'pointer' }}>
            Play ▶
          </button>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ activeIdx, progress, paused, onGoTo, onTogglePause, onCreateRoom, onJoin, accent }:
  { activeIdx:number; progress:number; paused:boolean; onGoTo:(i:number)=>void;
    onTogglePause:()=>void; onCreateRoom:()=>void; onJoin:()=>void; accent:string }) {

  const g = GAMES[activeIdx];

  return (
    <section style={{ maxWidth:1440, margin:'0 auto', padding:'28px 28px 0', position:'relative', zIndex:3 }}>
      <div style={{ position:'relative', borderRadius:28, background:T.surface,
        border:`1px solid ${T.line}`, overflow:'hidden', minHeight:640, isolation:'isolate' }}>

        {/* Full-bleed images */}
        {GAMES.map((game, i) => (
          <div key={game.key} style={{ position:'absolute', inset:0, opacity: i===activeIdx ? 1 : 0,
            transition:'opacity .9s ease', zIndex:0 }}>
            <img src={game.image} alt={game.name} style={{
              position:'absolute', inset:0, width:'100%', height:'100%',
              objectFit:'cover', objectPosition:'75% center', display:'block',
              transform: i===activeIdx ? 'scale(1.0)' : 'scale(1.06)',
              transition:'transform 12s linear',
            }} />
          </div>
        ))}

        {/* Gradient overlay */}
        <div style={{ position:'absolute', inset:0, zIndex:1,
          background:`linear-gradient(to right, rgba(10,10,18,0.94) 0%, rgba(10,10,18,0.86) 30%, rgba(10,10,18,0.55) 52%, rgba(10,10,18,0.10) 75%, rgba(10,10,18,0) 100%), linear-gradient(to top, rgba(10,10,18,0.65) 0%, transparent 35%)` }} />

        {/* Accent color wash */}
        {GAMES.map((game, i) => (
          <div key={game.key} style={{
            position:'absolute', inset:0, zIndex:2, pointerEvents:'none',
            opacity: i===activeIdx ? 1 : 0, transition:'opacity .9s ease',
            background:`radial-gradient(80% 70% at 100% 100%, ${game.color}55 0%, transparent 65%), radial-gradient(60% 70% at 0% 0%, ${game.color}30 0%, transparent 60%)`,
            mixBlendMode:'screen',
          }} />
        ))}

        {/* Top-right meta chips */}
        <div style={{ position:'absolute', top:24, right:28, zIndex:5,
          display:'flex', gap:8, fontFamily:FONT_MONO, fontSize:10, color:T.ink2,
          letterSpacing:'0.1em', textTransform:'uppercase' }}>
          {['LIVE', g.tag.toUpperCase()].map(chip => (
            <span key={chip} style={{ padding:'5px 10px', borderRadius:999,
              background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)',
              border:`1px solid ${T.line2}` }}>{chip}</span>
          ))}
        </div>
        <div style={{ position:'absolute', bottom:92, right:28, zIndex:5,
          fontFamily:FONT_MONO, fontSize:10, color:T.ink2, letterSpacing:'0.1em',
          textTransform:'uppercase', padding:'5px 10px', borderRadius:999,
          background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)', border:`1px solid ${T.line2}` }}>
          S04 · {g.id}/06 · {g.badge}
        </div>

        {/* Hero content */}
        <div style={{ position:'relative', zIndex:4, padding:'56px 60px 108px',
          display:'flex', flexDirection:'column', justifyContent:'space-between',
          minHeight:640, maxWidth:760 }}>

          <div>
            {/* Eyebrow */}
            <div style={{ display:'flex', alignItems:'center', gap:12,
              fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.08em', textTransform:'uppercase' }}>
              <span style={{ padding:'4px 10px', borderRadius:999, background:'rgba(255,255,255,0.06)',
                border:`1px solid ${T.line2}`, color:T.ink2 }}>Featured</span>
              <span><span style={{ color:accent, fontWeight:600 }}>{g.id}</span> / 06</span>
              <span style={{ color:T.ink4 }}>·</span>
              <span>Season 04 · Pure Chaos</span>
            </div>

            {/* Title */}
            <h1 style={{ fontFamily:FONT_DISPLAY, fontWeight:800,
              fontSize:'clamp(56px,7.5vw,124px)', lineHeight:0.9,
              letterSpacing:'-0.045em', margin:'24px 0 0', color:T.ink }}>
              {g.name.replace(g.accentWord,'').trim()}{' '}
              <span style={{ color:accent }}>{g.accentWord}</span>
            </h1>

            {/* Tagline */}
            <p style={{ margin:'18px 0 0', color:T.ink2, fontSize:17, lineHeight:1.5,
              maxWidth:'46ch', fontWeight:400 }}>{g.desc}</p>

            {/* Stats */}
            <div style={{ display:'flex', gap:32, marginTop:24 }}>
              {[['Players',g.players],['Avg session',g.time],['Vibe',g.vibe]].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontFamily:FONT_MONO, fontSize:10, color:T.ink3,
                    letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>{k}</div>
                  <div style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:22,
                    letterSpacing:'-0.01em', color:T.ink }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:28 }}>
            <button onClick={onCreateRoom} className="io-btn" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'16px 22px', fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:14,
              color:'#0a0a12', background:accent, border:`1px solid ${accent}`,
              borderRadius:999, cursor:'pointer',
              boxShadow:`0 8px 28px -10px ${accent}` }}>
              ▶ Play {g.name}
            </button>
            <button onClick={onJoin} className="io-btn" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'16px 22px', fontFamily:FONT_DISPLAY, fontWeight:500, fontSize:14,
              color:T.ink, border:`1px solid ${T.line2}`, background:'rgba(255,255,255,0.04)',
              borderRadius:999, cursor:'pointer' }}>
              All 6 games
            </button>
          </div>
        </div>

        {/* Rotator bar */}
        <div style={{ position:'absolute', left:0, right:0, bottom:0, zIndex:5,
          display:'flex', gap:14, padding:'16px 32px 18px',
          background:'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.18) 70%, transparent)',
          alignItems:'center', justifyContent:'space-between' }}>

          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {GAMES.map((game, i) => (
              <button key={game.key} onClick={() => onGoTo(i)} style={{
                appearance:'none',
                border:`1px solid ${i===activeIdx ? T.line2 : T.line}`,
                background: i===activeIdx ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                color: i===activeIdx ? T.ink : T.ink3,
                fontFamily:FONT_MONO, fontSize:11, letterSpacing:'0.06em',
                padding:'8px 12px', borderRadius:999, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:8,
                transition:'color .2s, background .2s, border-color .2s',
              }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:game.color, flexShrink:0 }} />
                {String(i+1).padStart(2,'0')} {game.name}
              </button>
            ))}
          </div>

          {/* Progress + controls */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ width:120, height:1, background:T.line, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%',
                width:`${progress*100}%`, background:accent, transition:'background .6s' }} />
            </div>
            {[['‹', () => onGoTo(activeIdx-1)], [paused?'▶':'⏸', onTogglePause], ['›', () => onGoTo(activeIdx+1)]].map(([label, fn], ii) => (
              <button key={ii} onClick={fn as ()=>void} style={{
                appearance:'none', border:`1px solid ${T.line}`, background:'transparent',
                color:T.ink2, width:32, height:32, borderRadius:'50%', cursor:'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:14,
                transition:'color .15s, background .15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color=T.ink;}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T.ink2;}}>
                {label as string}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Games grid ────────────────────────────────────────────────────────────────
function GamesSection({ onCreateRoom }: { onCreateRoom:()=>void }) {
  return (
    <section id="games" style={{ maxWidth:1440, margin:'0 auto', padding:'96px 28px 0', position:'relative', zIndex:3 }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        gap:24, flexWrap:'wrap', marginBottom:32 }}>
        <div>
          <div style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase' }}>
            // the roster
          </div>
          <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:'clamp(32px,4.2vw,48px)',
            letterSpacing:'-0.035em', lineHeight:1.05, margin:'8px 0 0', color:T.ink }}>
            Six games for impossible nights.
          </h2>
        </div>
        <p style={{ color:T.ink3, fontSize:15, maxWidth:'44ch', lineHeight:1.5, margin:0 }}>
          Quick to learn, hard to dominate, easy to lose a friendship over. Hover for vibes.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {GAMES.map(g => (
          <article key={g.key} className="io-game-card" onClick={onCreateRoom}
            style={{ position:'relative', borderRadius:20, overflow:'hidden',
              border:`1px solid ${T.line}`, cursor:'pointer', aspectRatio:'4/5',
              background:`color-mix(in oklab, ${g.color} 22%, #0a0a12)`,
              isolation:'isolate', transition:'transform .3s cubic-bezier(.2,.7,.2,1.2), border-color .3s, box-shadow .3s',
              '--c':g.color } as React.CSSProperties}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform='translateY(-6px)';
              el.style.borderColor=`${g.color}99`;
              el.style.boxShadow=`0 30px 60px -24px ${g.color}88`;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform='';
              el.style.borderColor=T.line;
              el.style.boxShadow='';
            }}>

            {/* Image */}
            <img src={g.image} alt={g.name} className="io-game-img" style={{
              position:'absolute', inset:0, width:'100%', height:'100%',
              objectFit:'cover', objectPosition:'center', zIndex:0, display:'block',
              transition:'transform .6s cubic-bezier(.2,.7,.2,1.0)',
            }} />

            {/* Bottom gradient */}
            <div style={{ content:'""', position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
              background:'linear-gradient(to top, rgba(10,10,18,0.95) 0%, rgba(10,10,18,0.78) 22%, rgba(10,10,18,0.30) 50%, rgba(10,10,18,0) 70%)' }} />

            {/* Hover glow */}
            <div className="io-card-glow" style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none',
              opacity:0, transition:'opacity .3s',
              background:`radial-gradient(80% 40% at 50% 100%, ${g.color}66 0%, transparent 70%)` }} />

            {/* Number badge */}
            <span style={{ position:'absolute', top:14, left:14, zIndex:3,
              fontFamily:FONT_MONO, fontSize:11, color:T.ink, letterSpacing:'0.12em',
              padding:'4px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,0.18)',
              background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }}>
              № {g.id}
            </span>

            {/* Tag badge */}
            <span style={{ position:'absolute', top:14, right:14, zIndex:3,
              fontFamily:FONT_MONO, fontSize:10, letterSpacing:'0.12em', color:g.color,
              textTransform:'uppercase', padding:'4px 10px', borderRadius:999,
              border:`1px solid ${g.color}aa`, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }}>
              {g.badge}
            </span>

            {/* Body overlay */}
            <div style={{ position:'absolute', left:22, right:22, bottom:20, zIndex:3,
              display:'flex', flexDirection:'column', gap:6 }}>
              <h3 style={{ fontFamily:FONT_DISPLAY, fontWeight:800, fontSize:28,
                letterSpacing:'-0.03em', lineHeight:1, color:'#fff', margin:0,
                textShadow:'0 2px 20px rgba(0,0,0,0.6)' }}>{g.name}</h3>
              <p className="io-game-desc" style={{ color:'rgba(244,244,246,0.78)', fontSize:13.5,
                lineHeight:1.45, margin:'4px 0 2px', maxHeight:0, overflow:'hidden',
                opacity:0, transition:'max-height .35s, opacity .25s, margin .25s' }}>
                {g.descShort}
              </p>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                marginTop:6, fontFamily:FONT_MONO, fontSize:11, color:'rgba(244,244,246,0.7)',
                letterSpacing:'0.04em' }}>
                <span><span style={{ color:'#fff', fontWeight:500 }}>{g.players}</span> · {g.time}</span>
                <span className="io-game-play" style={{ color:g.color, textTransform:'uppercase',
                  letterSpacing:'0.14em', fontWeight:700, transition:'transform .2s' }}>
                  Play →
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Live rooms ────────────────────────────────────────────────────────────────
const LIVE_ROOMS = [
  { game:'Floor is Lava',       color:T.lava,  code:'MELTZ', n:7, more:3 },
  { game:'Mario Race',          color:T.mario, code:'PIPE7', n:6, more:9 },
  { game:'Knockback Arena',     color:T.knock, code:'BOOM4', n:5, more:22 },
  { game:'Shopping Cart Racing',color:T.cart,  code:'AISLE', n:4, more:6 },
];
const AV_COLORS = [T.lava,T.mario,T.soc,T.cart,T.obby,T.knock,'#22D3EE'];

// ── SEO Game Descriptions ─────────────────────────────────────────────────────
const GAME_DETAILS = [
  { key:'lava',  color:T.lava,  emoji:'🌋', name:'Floor is Lava',
    tagline:'The lava rises. The platforms disappear. One player survives.',
    body:'Floor is Lava is a browser-based survival platformer for 2–16 players. As molten lava floods the arena from below, everyone scrambles to claim higher ground on a towering structure of platforms. Bat mechanics let you knock rivals into the lava. Moving platforms and chaos power-ups mean no two rounds are the same. Rounds last 3 minutes — long enough for a comeback, short enough to immediately rematch.',
    bullets:['2–16 players','3-minute rounds','Bat knockback mechanic','Runs entirely in your browser'],
  },
  { key:'soc',   color:T.soc,   emoji:'⚽', name:'Physics Soccer',
    tagline:'Rocket physics. No fouls. Pure chaos on a postage-stamp pitch.',
    body:'Physics Soccer is a multiplayer browser soccer game with fully momentum-based physics. Emoji disc players slide and collide realistically — every touch, dash, and wall bounce feels satisfying. Rocket-boost dashes let you cross the pitch in a flash or slam a shot at goal. Play 2v2 up to 6v6 in 3-minute matches that somehow always go down to the wire.',
    bullets:['4–12 players','Team-based 3-minute matches','Boost dash mechanic','Momentum-based physics'],
  },
  { key:'obby',  color:T.obby,  emoji:'😤', name:'Rage Obby',
    tagline:'Spike pits. Disappearing tiles. Spinning blades. Good luck.',
    body:'Rage Obby is a brutal browser obstacle course game for 1–10 players. Jump across color-coded platforms, dodge spinning blades, time your leaps over disappearing tiles, and cling onto moving ledges. Die and you respawn at your last checkpoint — not the start. The first player to reach the end wins, but the real goal is outlasting your friends\' patience.',
    bullets:['1–10 players','Checkpoint system','4-minute time limit','No download required'],
  },
  { key:'mario', color:T.mario, emoji:'🍄', name:'Mario Race',
    tagline:'Karts, power-ups, star mode, fireballs — first to the flag wins.',
    body:'Mario Race is a browser-based kart racing platformer for 2–12 players, inspired by classic Nintendo games. Hit ? blocks to grab speed boosts, star power, and fireballs. Stomp rivals to slow them down. The course is packed with Goombas, pipes, and platforms. First player to cross the finish line wins — but power-ups can flip the lead at any moment.',
    bullets:['2–12 players','Power-up blocks','3-minute race','Classic platformer feel'],
  },
  { key:'knock', color:T.knock, emoji:'👊', name:'Knockback Arena',
    tagline:'No health bars. Punch friends off a tiny platform. Ring out and lose.',
    body:'Knockback Arena is a minimalist browser fighting game for 2–8 players, inspired by Super Smash Bros. There are no health bars — instead, every punch and dash sends opponents flying with physics-based knockback. Fall off the platform edges and you\'re eliminated. The last player standing wins. Fast-paced 2-minute rounds mean you\'ll be playing best-of-five before you know it.',
    bullets:['2–8 players','2-minute rounds','Physics knockback','Last player standing wins'],
  },
  { key:'cart',  color:T.cart,  emoji:'🛒', name:'Shopping Cart Racing',
    tagline:'Wobbly carts, slippery aisles, milk on the floor. First to checkout wins.',
    body:'Shopping Cart Racing is a chaotic browser racing game set inside a grocery store. Up to 16 players pilot unstable shopping carts through slippery aisles, attempting drifts around corners, boosting off ramps, and knocking rivals into shelves. Collect boost pick-ups, master the drift mechanic, and reach the checkout counter before everyone else in 3-minute races.',
    bullets:['2–16 players','Drift boost mechanic','3-minute races','Up to 16 players'],
  },
];

function GameDescriptionsSection() {
  return (
    <section style={{ maxWidth:1440, margin:'0 auto', padding:'80px 28px 0', position:'relative', zIndex:3 }}>
      <div style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>// game guides</div>
      <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:800, fontSize:'clamp(28px,3.5vw,40px)', color:T.ink, letterSpacing:'-0.03em', margin:'0 0 48px' }}>
        Everything you need to know
      </h2>
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        {GAME_DETAILS.map((g, i) => (
          <article key={g.key} style={{
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:'48px 64px',
            padding:'48px 0', borderTop:`1px solid ${T.line}`,
            direction: i % 2 === 0 ? 'ltr' : 'rtl',
          }}>
            <style>{`@media(max-width:720px){.gdesc-grid{grid-template-columns:1fr!important;direction:ltr!important;}}`}</style>
            <div className="gdesc-grid" style={{ direction:'ltr' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <span style={{ fontSize:32 }}>{g.emoji}</span>
                <div style={{ width:4, height:40, borderRadius:2, background:g.color }} />
                <h3 style={{ fontFamily:FONT_DISPLAY, fontWeight:800, fontSize:'clamp(22px,2.5vw,30px)', color:T.ink, margin:0, letterSpacing:'-0.025em' }}>{g.name}</h3>
              </div>
              <p style={{ fontFamily:FONT_DISPLAY, fontStyle:'italic', fontSize:16, color:g.color, margin:'0 0 14px', fontWeight:500 }}>{g.tagline}</p>
              <p style={{ color:T.ink2, fontSize:15, lineHeight:1.7, margin:'0 0 20px' }}>{g.body}</p>
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexWrap:'wrap', gap:8 }}>
                {g.bullets.map(b => (
                  <li key={b} style={{ fontFamily:FONT_MONO, fontSize:11, color:g.color,
                    background:`${g.color}14`, border:`1px solid ${g.color}44`,
                    borderRadius:999, padding:'4px 12px', letterSpacing:'0.06em' }}>{b}</li>
                ))}
              </ul>
            </div>
            <div className="gdesc-grid" style={{ direction:'ltr', background:T.surface, borderRadius:20,
              border:`1px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center',
              minHeight:200, overflow:'hidden', position:'relative' }}>
              <img src={`/${g.key === 'lava' ? 'floor-is-lava' : g.key === 'soc' ? 'soccer' : g.key === 'obby' ? 'rage-obby' : g.key === 'mario' ? 'mario-race' : g.key === 'knock' ? 'knockback-arena' : 'shopping-cart-racing'}.png`}
                alt={`${g.name} gameplay screenshot`}
                style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center', display:'block', minHeight:200 }} />
              <div style={{ position:'absolute', inset:0, background:`linear-gradient(135deg, ${g.color}22 0%, transparent 60%)`, pointerEvents:'none' }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveSection() {
  return (
    <section id="live" style={{ maxWidth:1440, margin:'0 auto', padding:'96px 28px 0', position:'relative', zIndex:3 }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        gap:24, flexWrap:'wrap', marginBottom:32 }}>
        <div>
          <div style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase' }}>
            // rooms looking for players
          </div>
          <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:'clamp(32px,4.2vw,48px)',
            letterSpacing:'-0.035em', lineHeight:1.05, margin:'8px 0 0', color:T.ink }}>
            Drop in. No download.
          </h2>
        </div>
        <p style={{ color:T.ink3, fontSize:15, maxWidth:'44ch', lineHeight:1.5, margin:0 }}>
          These rooms are public and looking for one more. Share a four-letter code and anyone can join.
        </p>
      </div>

      <div style={{ borderRadius:18, border:`1px solid ${T.line}`, background:T.surface, overflow:'hidden' }}>
        <div style={{ padding:'14px 22px', borderBottom:`1px solid ${T.line}`,
          display:'flex', justifyContent:'space-between', alignItems:'center',
          fontFamily:FONT_MONO, fontSize:12, color:T.ink3, letterSpacing:'0.04em' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 10px 4px 8px',
              borderRadius:999, background:'rgba(255,255,255,0.05)', border:`1px solid ${T.line}`,
              fontFamily:FONT_MONO, fontSize:11, color:T.ink2 }}>
              <span className="io-pulse" style={{ width:7, height:7, borderRadius:'50%', background:T.lava,
                boxShadow:`0 0 0 3px ${T.lava}40` }} />
              LIVE
            </span>
            <span>4 public rooms · create your own to get started</span>
          </div>
          <span>click any code to join →</span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)' }}>
          {LIVE_ROOMS.map((r, ri) => (
            <div key={r.code} className="io-live-row" style={{ padding:'18px 22px',
              borderRight: ri < 3 ? `1px solid ${T.line}` : 'none',
              display:'flex', flexDirection:'column', gap:8, cursor:'pointer', position:'relative',
              transition:'background .15s', '--rc':r.color } as React.CSSProperties}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span style={{ fontFamily:FONT_MONO, fontSize:11, color:r.color,
                letterSpacing:'0.08em', textTransform:'uppercase' }}>{r.game}</span>
              <span style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:24,
                letterSpacing:'0.04em', color:T.ink, display:'flex', alignItems:'center', gap:8 }}>
                <span className="io-pulse" style={{ width:7, height:7, borderRadius:'50%', background:r.color,
                  boxShadow:`0 0 0 3px ${r.color}40` }} />
                {r.code}
              </span>
              <span style={{ display:'flex', alignItems:'center', fontFamily:FONT_MONO, fontSize:11, color:T.ink3 }}>
                {Array.from({length:r.n}).map((_,k) => (
                  <span key={k} style={{ display:'inline-block', width:18, height:18, borderRadius:'50%',
                    border:`2px solid ${T.surface}`, background:AV_COLORS[(ri*3+k)%AV_COLORS.length],
                    marginLeft: k===0 ? 0 : -5 }} />
                ))}
                <span style={{ marginLeft:10 }}>+{r.more} watching</span>
              </span>
              <span className="io-live-join" style={{ position:'absolute', top:22, right:22,
                fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.1em',
                textTransform:'uppercase', opacity:0, transform:'translateX(-4px)',
                transition:'opacity .2s, transform .2s, color .2s' }}>
                JOIN →
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────
const HOW_STEPS = [
  { c:T.lava,  n:'Step 01', h:'Spin up a room',    p:'One click. You get a four-letter code. No accounts, no installs, no waiting.' },
  { c:T.mario, n:'Step 02', h:'Drop the code',      p:'Paste it in DMs, group chat, voice. Anyone with a browser can hop in.' },
  { c:T.cart,  n:'Step 03', h:'Rotate the games',   p:'Six games. One night. The leaderboard updates after every round.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ maxWidth:1440, margin:'0 auto', padding:'96px 28px 0', position:'relative', zIndex:3 }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase' }}>
          // how it works
        </div>
        <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:'clamp(32px,4.2vw,48px)',
          letterSpacing:'-0.035em', lineHeight:1.05, margin:'8px 0 0', color:T.ink, maxWidth:'24ch' }}>
          Three clicks from group chat to chaos.
        </h2>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {HOW_STEPS.map(s => (
          <div key={s.n} style={{ borderRadius:20, border:`1px solid ${T.line}`, background:T.surface,
            padding:'28px 28px 32px', display:'flex', flexDirection:'column', gap:8,
            position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2, background:s.c }} />
            <span style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.16em', textTransform:'uppercase' }}>{s.n}</span>
            <h4 style={{ margin:'4px 0 0', fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:22,
              letterSpacing:'-0.02em', color:T.ink }}>{s.h}</h4>
            <p style={{ margin:'4px 0 0', color:T.ink3, fontSize:14, lineHeight:1.55 }}>{s.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CtaSection({ onCreateRoom, onJoin }: { onCreateRoom:()=>void; onJoin:()=>void }) {
  return (
    <section style={{ maxWidth:1440, margin:'96px auto 0', padding:'0 28px', position:'relative', zIndex:3 }}>
      <div style={{ borderRadius:28, border:`1px solid ${T.line2}`, padding:'64px 56px',
        display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:32, alignItems:'end',
        position:'relative', overflow:'hidden',
        background:`radial-gradient(80% 90% at 0% 0%, ${T.lava}88, transparent 60%), radial-gradient(80% 90% at 100% 100%, ${T.knock}88, transparent 60%), ${T.surface}` }}>
        <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:800,
          fontSize:'clamp(42px,6vw,84px)', lineHeight:0.92,
          letterSpacing:'-0.045em', margin:0, color:T.ink, maxWidth:'14ch' }}>
          Pull up a tab. Burn an evening. Crown a champion.
        </h2>
        <div>
          <p style={{ color:T.ink2, fontSize:17, lineHeight:1.5, maxWidth:'42ch', margin:'0 0 24px' }}>
            No accounts. No installs. Six little games and a four-letter code that ruins everyone&apos;s productivity for the next hour.
          </p>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <button onClick={onCreateRoom} className="io-btn" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'16px 22px', fontFamily:FONT_DISPLAY, fontWeight:600, fontSize:14,
              color:'#0a0a12', background:T.lava, border:`1px solid ${T.lava}`,
              borderRadius:999, cursor:'pointer', boxShadow:`0 8px 28px -10px ${T.lava}` }}>
              ▶ Quick play
            </button>
            <button onClick={onJoin} className="io-btn" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              padding:'16px 22px', fontFamily:FONT_DISPLAY, fontWeight:500, fontSize:14,
              color:T.ink, border:`1px solid ${T.line2}`, background:'rgba(255,255,255,0.04)',
              borderRadius:999, cursor:'pointer' }}>
              Join with code
            </button>
          </div>
          {/* Support */}
          <div style={{ marginTop:20, fontSize:13, color:T.ink4 }}>
            Enjoying it?{' '}
            <a href="https://cash.app/$MarMar642" target="_blank" rel="noopener noreferrer"
              style={{ color:T.cart, textDecoration:'none', fontWeight:600 }}>
              Buy me a coffee ☕
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ onCreateRoom, onJoin }: { onCreateRoom:()=>void; onJoin:()=>void }) {
  return (
    <footer style={{ marginTop:96, borderTop:`1px solid ${T.line}`, padding:'48px 28px 56px', position:'relative', zIndex:3 }}>
      <div style={{ maxWidth:1440, margin:'0 auto', display:'grid',
        gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:32, alignItems:'start' }}>
        <div>
          <p style={{ fontFamily:FONT_DISPLAY, fontWeight:800, fontSize:36, lineHeight:1,
            letterSpacing:'-0.035em', color:T.ink, margin:'0 0 14px' }}>
            Internet Olympics
          </p>
          <p style={{ color:T.ink3, fontSize:14, maxWidth:'36ch', lineHeight:1.5, margin:0 }}>
            Six tiny multiplayer games for up to 16 friends. Plays in any browser. No accounts. No mercy.
          </p>
        </div>
        <FootCol title="Play" links={[
          { label:'Quick play', fn:onCreateRoom },
          { label:'Join with code', fn:onJoin },
        ]} />
        <FootCol title="Games" links={GAMES.map(g => ({ label:g.name }))} />
        <FootCol title="Elsewhere" links={[
          { label:'Discord' },{ label:'Twitch' },{ label:'YouTube' },{ label:'Status' },
        ]} />
      </div>
      <div style={{ maxWidth:1440, margin:'32px auto 0', display:'flex', justifyContent:'space-between',
        fontFamily:FONT_MONO, fontSize:11, color:T.ink4, letterSpacing:'0.06em' }}>
        <span>© 2026 Internet Olympics · No accounts · No downloads</span>
        <span>v4.0 · uptime 99.98%</span>
      </div>
    </footer>
  );
}

function FootCol({ title, links }: { title:string; links:{ label:string; fn?:()=>void }[] }) {
  return (
    <div>
      <h5 style={{ fontFamily:FONT_MONO, fontSize:11, color:T.ink3, letterSpacing:'0.18em',
        textTransform:'uppercase', margin:'0 0 12px' }}>{title}</h5>
      <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
        {links.map(l => (
          <li key={l.label}>
            {l.fn
              ? <button onClick={l.fn} style={{ background:'none', border:'none', padding:0,
                  color:T.ink2, fontSize:14, cursor:'pointer', textAlign:'left',
                  transition:'color .15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.color=T.ink)}
                  onMouseLeave={e=>(e.currentTarget.style.color=T.ink2)}>
                  {l.label}
                </button>
              : <a href="#" style={{ color:T.ink2, textDecoration:'none', fontSize:14, transition:'color .15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.color=T.ink)}
                  onMouseLeave={e=>(e.currentTarget.style.color=T.ink2)}>
                  {l.label}
                </a>
            }
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Setup flow (create / join modal) ─────────────────────────────────────────
function SetupFlow({ onBack, mode, initialCode = '' }: { onBack: () => void; mode: 'create' | 'join'; initialCode?: string }) {
  const { createRoom, joinRoom } = useSocket();
  const isConnected = useGameStore((s) => s.connection.connected);
  const sounds = useSounds();
  const [username, setUsername] = useState(useGameStore.getState().playerName);
  const [avatar, setAvatar]     = useState(useGameStore.getState().playerAvatar);
  const [color, setColor]       = useState(useGameStore.getState().playerColor);
  const [roomCode, setRoomCode] = useState(initialCode);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const addToast = useGameStore((s) => s.addToast);

  const setPlayerName   = useGameStore((s) => s.setPlayerName);
  const setPlayerAvatar = useGameStore((s) => s.setPlayerAvatar);
  const setPlayerColor  = useGameStore((s) => s.setPlayerColor);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter a username first!'); return; }
    if (mode === 'join' && roomCode.trim().length < 4) { setError('Enter a valid room code!'); return; }
    setLoading(true); setError('');
    setPlayerName(username.trim()); setPlayerAvatar(avatar); setPlayerColor(color);
    sounds.confirm();
    try {
      if (mode === 'create') {
        await createRoom(username.trim(), avatar, color);
        addToast({ type: 'success', message: '🎉 Room created! Share the code.' });
      } else {
        await joinRoom(roomCode.trim().toUpperCase(), username.trim(), avatar, color);
        addToast({ type: 'success', message: '🎮 Joined the party!' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again!');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background:T.surface, borderRadius:24, padding:28,
      border:`1px solid ${T.line2}`, boxShadow:'0 32px 64px -24px rgba(0,0,0,0.6)' }}>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer',
          color:T.ink3, fontSize:20, padding:0, lineHeight:1 }}>←</button>
        <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:22, color:T.ink,
          margin:0, letterSpacing:'-0.02em' }}>
          {mode === 'create' ? 'Create a Room' : 'Join with Code'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
        {/* Username */}
        <div>
          <label style={{ display:'block', fontSize:13, color:T.ink3, marginBottom:7, fontWeight:500 }}>Your Name</label>
          <input type="text" maxLength={20} value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter username..." autoFocus
            style={{ width:'100%', background:T.surface2, border:`1.5px solid ${T.line2}`,
              borderRadius:12, padding:'12px 16px', color:T.ink, fontSize:15,
              fontFamily:FONT_DISPLAY, outline:'none', boxSizing:'border-box' }} />
        </div>

        {/* Room code (join only) */}
        {mode === 'join' && (
          <div>
            <label style={{ display:'block', fontSize:13, color:T.ink3, marginBottom:7, fontWeight:500 }}>Room Code</label>
            <input type="text" maxLength={6} value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABCD" autoComplete="off"
              style={{ width:'100%', background:T.surface2, border:`1.5px solid ${T.line2}`,
                borderRadius:12, padding:'12px 16px', color:T.ink, fontSize:22, letterSpacing:'0.2em',
                fontFamily:FONT_MONO, outline:'none', textAlign:'center', boxSizing:'border-box' }} />
          </div>
        )}

        {/* Avatar */}
        <div>
          <label style={{ display:'block', fontSize:13, color:T.ink3, marginBottom:7, fontWeight:500 }}>Avatar</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {AVATAR_OPTIONS.map(a => (
              <button key={a} type="button" onClick={() => setAvatar(a)}
                style={{ width:42, height:42, borderRadius:12, fontSize:22, cursor:'pointer',
                  border: a===avatar ? `2px solid ${T.lava}` : `1.5px solid ${T.line2}`,
                  background: a===avatar ? `${T.lava}22` : T.surface2,
                  transition:'all .15s' }}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label style={{ display:'block', fontSize:13, color:T.ink3, marginBottom:7, fontWeight:500 }}>Color</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ width:32, height:32, borderRadius:'50%', cursor:'pointer', background:c,
                  border: c===color ? `3px solid ${T.ink}` : '3px solid transparent',
                  boxShadow: c===color ? `0 0 0 2px ${c}` : 'none',
                  transition:'all .15s' }} />
            ))}
          </div>
        </div>

        {/* Connecting banner */}
        {!isConnected && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#92400e',
            background:'#FFFBEA', border:'1px solid #F4B40066', borderRadius:10, padding:'9px 14px' }}>
            <motion.span animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1.2, ease:'linear' }}>⟳</motion.span>
            Connecting to server… please wait
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ fontSize:13, color:'#f87171', background:'rgba(248,113,113,0.1)',
                border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, padding:'9px 14px' }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button type="submit" disabled={loading || !isConnected} className="io-btn"
          style={{ width:'100%', padding:14, borderRadius:999, border:'none',
            cursor: (loading||!isConnected) ? 'default' : 'pointer',
            fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:16,
            background: (loading||!isConnected) ? T.ink4 : T.lava, color:'#0a0a12',
            boxShadow: (loading||!isConnected) ? 'none' : `0 6px 20px -6px ${T.lava}88`,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            opacity: !isConnected ? 0.6 : 1, transition:'all .15s' }}>
          {loading
            ? <><motion.span animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}>⟳</motion.span>
                {mode==='create' ? 'Creating...' : 'Joining...'}</>
            : mode==='create' ? 'Create Room →' : 'Join Now →'
          }
        </button>
      </form>
    </div>
  );
}
