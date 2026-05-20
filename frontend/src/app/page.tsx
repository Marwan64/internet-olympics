'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocket } from '@/hooks/useSocket';
import { AVATAR_OPTIONS, COLOR_OPTIONS } from '@/types';
import LobbyRoom from '@/components/lobby/LobbyRoom';
import GameScreen from '@/components/games/GameScreen';
import PodiumScreen from '@/components/ui/PodiumScreen';
import ToastContainer from '@/components/ui/ToastContainer';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      '#F4EEE2',
  bg2:     '#EDE5D2',
  paper:   '#FBF7EE',
  ink:     '#14161B',
  ink2:    '#2A2D36',
  ink3:    '#5A5F6C',
  inkFaint:'#9A9DA8',
  line:    'rgba(20,22,27,0.12)',
  lineStr: 'rgba(20,22,27,0.22)',
  torch:   '#E94F1D',
  lake:    '#1F5BD8',
  gold:    '#F4B400',
  leaf:    '#1E5A3A',
  grape:   '#5E37B7',
};

// ── Real games ────────────────────────────────────────────────────────────────
const GAMES = [
  {
    id: '01', name: 'Mario Race', italic: 'Race',
    desc: 'Race across platforms, stomp Goombas, grab power-ups. First to the flag wins.',
    pills: [['STAGE','ACTION'],['DURATION','60s'],['fire','★ FIRE']],
    bg: T.torch, fg: T.paper,
    glyph: `<rect x="10" y="58" width="76" height="8" rx="3" fill="currentColor" opacity=".3"/>
            <rect x="22" y="38" width="18" height="22" rx="3" fill="currentColor" opacity=".5"/>
            <rect x="52" y="28" width="22" height="32" rx="3" fill="currentColor" opacity=".5"/>
            <rect x="30" y="54" width="8" height="8" rx="2" fill="currentColor"/>
            <path d="M68 38 L72 30 L76 38 Z" fill="currentColor"/>`,
  },
  {
    id: '02', name: 'Knockback Arena', italic: 'Arena',
    desc: 'Punch and dash everyone off the platform. The last one standing wins.',
    pills: [['STAGE','COMBAT'],['DURATION','60s'],['fire','▲ HOT']],
    bg: T.grape, fg: T.paper,
    glyph: `<circle cx="48" cy="52" r="28" stroke="currentColor" stroke-width="3" fill="none" opacity=".3"/>
            <path d="M32 52 Q40 38 48 44 Q56 50 64 36" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/>
            <circle cx="66" cy="34" r="7" fill="currentColor"/>`,
  },
  {
    id: '03', name: 'Shopping Cart Racing', italic: 'Racing',
    desc: 'Drift down sunny park roads. Knock rivals off course. Reach the finish line.',
    pills: [['STAGE','RACING'],['DURATION','60s'],['new','+ NEW']],
    bg: T.gold, fg: T.ink,
    glyph: `<rect x="18" y="44" width="52" height="26" rx="6" fill="currentColor" opacity=".25"/>
            <rect x="24" y="50" width="40" height="14" rx="4" fill="currentColor" opacity=".5"/>
            <line x1="24" y1="70" x2="24" y2="78" stroke="currentColor" stroke-width="3"/>
            <line x1="64" y1="70" x2="64" y2="78" stroke="currentColor" stroke-width="3"/>
            <circle cx="30" cy="78" r="5" fill="currentColor"/>
            <circle cx="62" cy="78" r="5" fill="currentColor"/>
            <path d="M14 44 L20 28 L70 28 L76 44" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: '04', name: 'Rage Obby', italic: 'Obby',
    desc: 'Spike pits, moving platforms, checkpoints, and endless deaths. Keep climbing.',
    pills: [['STAGE','PLATFORMER'],['DURATION','90s'],['','']] ,
    bg: T.leaf, fg: T.paper,
    glyph: `<rect x="14" y="72" width="20" height="6" rx="2" fill="currentColor"/>
            <rect x="38" y="58" width="20" height="6" rx="2" fill="currentColor"/>
            <rect x="62" y="44" width="20" height="6" rx="2" fill="currentColor"/>
            <circle cx="24" cy="66" r="6" fill="currentColor" opacity=".5"/>
            <rect x="40" y="52" width="5" height="5" rx="1" fill="currentColor" opacity=".8"/>`,
  },
  {
    id: '05', name: 'Floor is Lava', italic: 'Lava',
    desc: 'Rising lava swallows the tower. Climb higher, swing your bat, be the last alive.',
    pills: [['STAGE','SURVIVAL'],['DURATION','90s'],['fire','★ FIRE']],
    bg: '#B91C1C', fg: T.paper,
    glyph: `<path d="M48 18 L54 34 L70 34 L57 44 L62 60 L48 50 L34 60 L39 44 L26 34 L42 34 Z" fill="currentColor" opacity=".3"/>
            <path d="M48 18 L54 34 L70 34 L57 44 L62 60 L48 50 L34 60 L39 44 L26 34 L42 34 Z" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="M20 80 Q35 68 48 74 Q61 80 76 68" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
  },
  {
    id: '06', name: 'Physics Soccer', italic: 'Soccer',
    desc: 'Boost, dash, and slam the ball into the goal. Chaos modifiers. Pure mayhem.',
    pills: [['STAGE','SPORTS'],['DURATION','90s'],['fire','▲ HOT']],
    bg: T.lake, fg: T.paper,
    glyph: `<circle cx="48" cy="48" r="26" stroke="currentColor" stroke-width="3" fill="none"/>
            <path d="M48 22 L54 38 L70 38 L57 48 L62 64 L48 54 L34 64 L39 48 L26 38 L42 38 Z" fill="currentColor" opacity=".35"/>
            <circle cx="48" cy="48" r="4" fill="currentColor"/>`,
  },
];

const MARQUEE_ITEMS = [
  'Mario Race','Knockback Arena','Shopping Cart Racing','Rage Obby','Floor is Lava','Physics Soccer',
  'Season Four','Pure Chaos',
];

// ── Root page ─────────────────────────────────────────────────────────────────

type FlowStep = 'home' | 'setup' | 'join';

export default function HomePage() {
  const screen = useGameStore((s) => s.screen);
  const room   = useGameStore((s) => s.room);

  if (screen === 'lobby' && room) return <><LobbyRoom /><ToastContainer /></>;
  if (screen === 'game')   return <GameScreen />;
  if (screen === 'podium') return <PodiumScreen />;
  return <HomeContent />;
}

// ── Home landing page ─────────────────────────────────────────────────────────

function HomeContent() {
  const [flow, setFlow] = useState<FlowStep>('home');

  return (
    <div style={{ background: T.bg, color: T.ink, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @keyframes io-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes io-pulse  { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(.85); opacity:.8; } }
        .io-marquee-track { animation: io-scroll 36s linear infinite; }
        .io-game-card { transition: transform .25s cubic-bezier(.2,.7,.2,1.2), box-shadow .25s ease; }
        .io-game-card:hover { transform: translateY(-5px) rotate(-0.4deg); box-shadow: 0 24px 48px -20px rgba(20,22,27,0.22); }
        .io-btn { transition: transform .15s ease, background .15s ease, box-shadow .15s ease; }
        .io-btn:hover { transform: translateY(-1px); }
        .io-nav-link { color: ${T.ink2}; text-decoration: none; font-size: 14px; transition: color .15s; }
        .io-nav-link:hover { color: ${T.torch}; }
        ::selection { background: ${T.torch}; color: ${T.paper}; }
      `}</style>

      <Nav onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')} />
      <Hero onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')} />
      <Marquee />
      <HowItWorks />
      <GamesSection />
      <Numbers />
      <Quotes />
      <CtaSection onCreateRoom={() => setFlow('setup')} onJoin={() => setFlow('join')} />
      <Footer onCreateRoom={() => setFlow('setup')} />
      <ToastContainer />

      {/* Modal overlay for create/join flow */}
      <AnimatePresence>
        {(flow === 'setup' || flow === 'join') && (
          <motion.div
            key="modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(20,22,27,0.55)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setFlow('home'); }}
          >
            <motion.div
              key="modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              style={{ width: '100%', maxWidth: 440 }}
            >
              <SetupFlow onBack={() => setFlow('home')} mode={flow === 'setup' ? 'create' : 'join'} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav({ onCreateRoom, onJoin }: { onCreateRoom: () => void; onJoin: () => void }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: `color-mix(in srgb, ${T.bg} 90%, transparent)`,
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.line}`,
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto', padding: '14px 28px',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 24,
      }}>
        {/* Wordmark */}
        <a href="#" style={{ display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none', color: T.ink, fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:18, letterSpacing:'-0.02em' }}>
          <span style={{ display:'inline-block', width:26, height:18, position:'relative', flexShrink:0 }}>
            <span style={{ position:'absolute', width:13, height:13, borderRadius:'50%', border:`2.4px solid ${T.torch}`, left:0, top:0 }} />
            <span style={{ position:'absolute', width:13, height:13, borderRadius:'50%', border:`2.4px solid ${T.ink}`, left:6, top:5 }} />
            <span style={{ position:'absolute', width:13, height:13, borderRadius:'50%', border:`2.4px solid ${T.lake}`, left:12, top:0 }} />
          </span>
          Internet Olympics
        </a>

        {/* Nav links */}
        <div className="hidden sm:flex" style={{ gap:28, justifySelf:'center' }}>
          {[['#games','Games'],['#how','How it works'],['#numbers','Stats'],['#chaos','The chaos']].map(([href, label]) => (
            <a key={href} href={href} className="io-nav-link">{label}</a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{
            display:'inline-flex', alignItems:'center', gap:8,
            padding:'5px 10px', borderRadius:999,
            background: T.paper, border:`1px solid ${T.line}`,
            fontFamily:"'Bricolage Grotesque',monospace", fontSize:11, color: T.ink2, letterSpacing:'0.04em',
          }} className="hidden sm:inline-flex">
            <span style={{ width:8, height:8, borderRadius:'50%', background: T.torch, boxShadow:`0 0 0 3px ${T.torch}38`, animation:'io-pulse 1.6s ease-in-out infinite', display:'inline-block' }} />
            SEASON 04 · LIVE
          </span>
          <button onClick={onCreateRoom} className="io-btn" style={{
            display:'inline-flex', alignItems:'center', gap:8, padding:'10px 18px',
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:14,
            background: T.torch, color: T.paper, border:`1px solid ${T.torch}`,
            borderRadius:999, cursor:'pointer',
            boxShadow:`0 6px 20px -6px ${T.torch}99`,
          }}>
            Play now <span>→</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ onCreateRoom, onJoin }: { onCreateRoom: () => void; onJoin: () => void }) {
  return (
    <header style={{ maxWidth:1400, margin:'0 auto', padding:'80px 28px 32px', position:'relative' }}>
      {/* Olympic discs decoration */}
      <div className="hidden md:block" style={{ position:'absolute', right:40, top:80, width:220, height:90, pointerEvents:'none' }}>
        {[
          { left:0,   top:0,  color:T.torch },
          { left:56,  top:14, color:T.ink },
          { left:112, top:0,  color:T.lake },
          { left:28,  top:14, color:T.gold },
          { left:84,  top:14, color:T.leaf },
        ].map((d, i) => (
          <span key={i} style={{
            position:'absolute', width:76, height:76, borderRadius:'50%',
            border:`10px solid ${d.color}`, background:'transparent',
            left:d.left, top:d.top, mixBlendMode:'multiply',
          }} />
        ))}
      </div>

      {/* Season meta */}
      <div style={{ display:'flex', gap:14, alignItems:'center', fontFamily:'monospace', fontSize:12, color: T.ink3, marginBottom:24, letterSpacing:'0.02em' }}>
        <span>NO. 077</span>
        <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
        <span>SEASON FOUR</span>
        <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
        <span>"<b style={{ color: T.ink, fontWeight:500 }}>PURE CHAOS</b>"</span>
      </div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity:0, y:20 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:.6, ease:[.25,.46,.45,.94] }}
        style={{
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
          fontWeight:800,
          fontSize:'clamp(72px,14vw,200px)',
          lineHeight:0.86,
          letterSpacing:'-0.045em',
          margin:0,
          color: T.ink,
        }}
      >
        <span style={{ display:'block' }}>Internet</span>
        <span style={{ display:'block' }}>
          <span style={{
            fontFamily:"'Instrument Serif',Georgia,serif",
            fontStyle:'italic',
            fontWeight:400,
            color: T.torch,
            fontSize:'1.06em',
            letterSpacing:'-0.01em',
          }}>olympics</span>
          <span style={{
            display:'inline-block', width:'0.14em', height:'0.14em', borderRadius:'50%',
            background: T.gold, transform:'translateY(-0.55em)', marginLeft:'0.02em',
          }} />
        </span>
      </motion.h1>

      {/* Body */}
      <motion.div
        initial={{ opacity:0, y:16 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:.2, duration:.6 }}
        style={{
          marginTop:40,
          display:'grid',
          gridTemplateColumns:'1fr',
          gap:32,
        }}
        className="sm:grid-cols-2-editorial"
      >
        <p style={{
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
          fontSize:18, lineHeight:1.55, color: T.ink2, maxWidth:520, fontWeight:400, margin:0,
        }}>
          The most{' '}
          <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', color: T.ink, fontSize:'1.06em' }}>chaotic</em>
          {' '}multiplayer party-game platform on the internet.
          No download. No accounts. Six fast games, up to fifty players, and one shared screen where everything goes wrong on purpose.
        </p>

        <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignSelf:'end' }}>
          <button onClick={onCreateRoom} className="io-btn" style={{
            display:'inline-flex', alignItems:'center', gap:10, padding:'16px 24px',
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:15,
            background: T.torch, color: T.paper, border:`1px solid ${T.torch}`,
            borderRadius:999, cursor:'pointer',
            boxShadow:`0 8px 24px -8px ${T.torch}88`,
          }}>
            Create a room <span>→</span>
          </button>
          <button onClick={onJoin} className="io-btn" style={{
            display:'inline-flex', alignItems:'center', gap:10, padding:'16px 24px',
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:15,
            background:'transparent', color: T.ink, border:`1px solid ${T.lineStr}`,
            borderRadius:999, cursor:'pointer',
          }}>
            Join with code
          </button>
        </div>
      </motion.div>
    </header>
  );
}

// ── Marquee ───────────────────────────────────────────────────────────────────

function Marquee() {
  const repeated = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div style={{ marginTop:52, background: T.ink, borderTop:`1px solid ${T.ink}`, borderBottom:`1px solid ${T.ink}`, overflow:'hidden' }}>
      <div className="io-marquee-track" style={{
        display:'flex', gap:52, whiteSpace:'nowrap', alignItems:'center', padding:'20px 0',
        fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
        fontWeight:700, fontSize:42, letterSpacing:'-0.02em', textTransform:'uppercase', color:'#F4EEE2',
      }}>
        {repeated.map((item, i) => (
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:36 }}>
            {(i === 6 || i === 7 || i === 14 || i === 15 || i === 22 || i === 23)
              ? <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.gold, fontSize:'1.04em' }}>{item}</em>
              : item}
            <span style={{ color: T.gold, display:'inline-block', width:24, height:24 }}>
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:'100%', height:'100%' }}>
                <path d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6L12 1z"/>
              </svg>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how" style={{ maxWidth:1400, margin:'0 auto', padding:'96px 28px' }}>
      <span style={{ fontFamily:'monospace', fontSize:12, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.18em', display:'inline-flex', alignItems:'center', gap:10 }}>
        <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
        How it works
      </span>
      <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(36px,5vw,64px)', letterSpacing:'-0.035em', lineHeight:1, margin:'14px 0 0', color: T.ink }}>
        Three steps,{' '}
        <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>zero</em>
        {' '}friction.
      </h2>

      <div style={{ marginTop:56, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:28 }}>
        {[
          { n:'01', nc:T.torch, title:'Spin up a room', sub:'in seconds', body:"Click create. You get a four-letter code. No accounts. No installs. No Zoom." },
          { n:'02', nc:T.lake,  title:'Drop the code',  sub:'anywhere',   body:"Send it in chat, in DMs, over a hot mic. Anyone with a browser can join." },
          { n:'03', nc:T.gold,  title:'Burn the leaderboard', sub:'together', body:"Six games. Rotate through them. Crown the night's champion. Argue forever." },
        ].map((s) => (
          <div key={s.n} style={{ paddingTop:28, borderTop:`1.5px solid ${T.ink}` }}>
            <div style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:800, fontSize:104, lineHeight:.9, letterSpacing:'-0.06em', color:s.nc }}>{s.n}</div>
            <h3 style={{ margin:'16px 0 6px', fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:24, letterSpacing:'-0.02em', color: T.ink }}>
              {s.title}{' '}
              <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.ink3 }}>— {s.sub}</em>
            </h3>
            <p style={{ margin:0, color: T.ink3, fontSize:15, lineHeight:1.55, maxWidth:'30ch' }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Games section ─────────────────────────────────────────────────────────────

function GamesSection() {
  return (
    <section id="games" style={{ maxWidth:1400, margin:'0 auto', padding:'0 28px 96px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:24, flexWrap:'wrap' }}>
        <div>
          <span style={{ fontFamily:'monospace', fontSize:12, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.18em', display:'inline-flex', alignItems:'center', gap:10 }}>
            <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
            The Roster
          </span>
          <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(36px,5vw,64px)', letterSpacing:'-0.035em', lineHeight:1, margin:'14px 0 0', color: T.ink }}>
            Six games.{' '}
            <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>One night.</em>
          </h2>
        </div>
        <p style={{ color: T.ink3, fontSize:14, marginBottom:4 }}>Rounds last <b style={{ color: T.ink, fontWeight:500 }}>60–90 seconds</b>. No boring downtime.</p>
      </div>

      <div style={{ marginTop:52, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:22 }}>
        {GAMES.map((g, idx) => (
          <motion.article
            key={g.id}
            className="io-game-card"
            initial={{ opacity:0, y:24 }}
            whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true }}
            transition={{ delay: idx * 0.07 }}
            style={{
              background: T.paper, border:`1px solid ${T.line}`, borderRadius:22,
              overflow:'hidden', display:'flex', flexDirection:'column',
            }}
          >
            {/* Art */}
            <div style={{ height:188, position:'relative', overflow:'hidden', display:'grid', placeItems:'center', background: g.bg }}>
              <svg viewBox="0 0 96 96" style={{ width:96, height:96, color: g.fg, position:'relative', zIndex:1 }}
                dangerouslySetInnerHTML={{ __html: g.glyph }} />
            </div>
            {/* Body */}
            <div style={{ padding:'22px 22px 24px' }}>
              <div style={{ fontFamily:'monospace', fontSize:11, color: T.ink3, letterSpacing:'0.12em', textTransform:'uppercase' }}>Event № {g.id}</div>
              <h3 style={{ margin:'8px 0 6px', fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:26, lineHeight:1, letterSpacing:'-0.025em', color: T.ink }}>
                {g.name.replace(g.italic, '')}
                <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>{g.italic}</em>
              </h3>
              <p style={{ color: T.ink3, fontSize:14, lineHeight:1.5, margin:'6px 0 0' }}>{g.desc}</p>
              <div style={{ marginTop:16, display:'flex', gap:8, flexWrap:'wrap', fontFamily:'monospace', fontSize:11, color: T.ink3, letterSpacing:'0.04em' }}>
                {g.pills.filter(([,v]) => v).map(([k, v], i) => {
                  const isFire = k === 'fire';
                  const isNew  = k === 'new';
                  return (
                    <span key={i} style={{
                      display:'inline-flex', alignItems:'center', padding:'4px 10px',
                      borderRadius:999, border:`1px solid ${isFire ? T.torch+'77' : isNew ? T.lake+'77' : T.lineStr}`,
                      color: isFire ? T.torch : isNew ? T.lake : T.ink2,
                    }}>
                      {(!isFire && !isNew && k) ? `${k} · ` : ''}{v}
                    </span>
                  );
                })}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

// ── Numbers ───────────────────────────────────────────────────────────────────

function Numbers() {
  const [gameCount, setGameCount] = useState(14392);
  useEffect(() => {
    const t = setInterval(() => {
      setGameCount(n => Math.random() < .7 ? n + 1 : n);
    }, 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="numbers" style={{ maxWidth:1400, margin:'0 auto', padding:'24px 28px 96px' }}>
      <span style={{ fontFamily:'monospace', fontSize:12, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.18em', display:'inline-flex', alignItems:'center', gap:10 }}>
        <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
        By the numbers
      </span>
      <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(32px,5vw,56px)', letterSpacing:'-0.035em', lineHeight:1, margin:'14px 0 48px', color: T.ink }}>
        A small, loud,{' '}
        <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>growing</em>
        {' '}platform.
      </h2>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', borderTop:`1.5px solid ${T.ink}`, borderBottom:`1.5px solid ${T.ink}` }}>
        {[
          { v: gameCount.toLocaleString(), nc: T.torch, k:'games played today',    d:'↑ trending upward' },
          { v:'612',                       nc: T.lake,  k:'matches per hour',       d:'avg duration 3m 14s' },
          { v:'50',                        nc: T.leaf,  k:'max players per room',   d:'60 Hz · instant join' },
        ].map((n, i) => (
          <div key={i} style={{ padding:'36px 28px', borderRight: i < 2 ? `1px solid ${T.line}` : 'none', display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(56px,7vw,100px)', lineHeight:.92, letterSpacing:'-0.045em', color:n.nc, fontVariantNumeric:'tabular-nums' }}>{n.v}</div>
            <div style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontSize:20, color: T.ink2 }}>{n.k}</div>
            <div style={{ fontFamily:'monospace', fontSize:11, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginTop:8 }}>{n.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Quotes ────────────────────────────────────────────────────────────────────

function Quotes() {
  return (
    <section id="chaos" style={{ maxWidth:1400, margin:'0 auto', padding:'0 28px 96px' }}>
      <span style={{ fontFamily:'monospace', fontSize:12, color: T.ink3, textTransform:'uppercase', letterSpacing:'0.18em', display:'inline-flex', alignItems:'center', gap:10 }}>
        <span style={{ width:18, height:1, background: T.ink3, display:'inline-block' }} />
        The chaos
      </span>
      <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(32px,5vw,56px)', letterSpacing:'-0.035em', lineHeight:1, margin:'14px 0 48px', color: T.ink }}>
        Things people{' '}
        <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>actually</em>
        {' '}said while playing.
      </h2>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:32 }}>
        {[
          { q:"I have not laughed this hard at a screen since 2007. My roommate left the apartment.", cite:'kev0nrock · Mario Race casualty', av: T.gold },
          { q:"We played one round of Floor is Lava and now nobody in this group chat trusts each other anymore.", cite:'luna.exe · season 03 survivor', av: T.lake },
          { q:"Knockback Arena cost me a friendship and a stapler. Worth it.", cite:'TOAD_KING · shopping cart legend', av: T.leaf },
        ].map((q, i) => (
          <div key={i} style={{ paddingTop:8 }}>
            <blockquote style={{
              display:'block',
              fontFamily:"'Instrument Serif',Georgia,serif",
              fontStyle:'italic', fontWeight:400, fontSize:26, lineHeight:1.2,
              color: T.ink, letterSpacing:'-0.01em', margin:0,
            }}>
              <span style={{ color: T.torch }}>"</span>{q.q}<span style={{ color: T.torch }}>"</span>
            </blockquote>
            <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:10, fontFamily:'monospace', fontSize:12, color: T.ink3, letterSpacing:'0.04em' }}>
              <span style={{ width:24, height:24, borderRadius:'50%', background:q.av, border:`1px solid ${T.ink}`, display:'inline-block', flexShrink:0 }} />
              {q.cite}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Big CTA ───────────────────────────────────────────────────────────────────

function CtaSection({ onCreateRoom, onJoin }: { onCreateRoom: () => void; onJoin: () => void }) {
  return (
    <section style={{ maxWidth:1400, margin:'0 auto', padding:'0 28px 96px' }}>
      <div style={{
        position:'relative', overflow:'hidden',
        background: T.ink, color: T.bg,
        borderRadius:28, padding:'72px 56px',
      }}>
        {/* Ring decorations */}
        <div style={{ position:'absolute', right:-50, top:-50, width:360, height:360, pointerEvents:'none' }}>
          {[
            { right:40,  top:30,  color:T.torch },
            { right:120, top:90,  color:T.gold, blend:'screen' as const },
            { right:200, top:150, color:T.lake, blend:'screen' as const },
          ].map((r, i) => (
            <span key={i} style={{
              position:'absolute', width:200, height:200,
              borderRadius:'50%', border:'18px solid', borderColor:r.color,
              right:r.right, top:r.top, opacity:.85,
              mixBlendMode: r.blend ?? 'normal',
            }} />
          ))}
        </div>

        <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:'clamp(48px,7vw,100px)', lineHeight:.92, letterSpacing:'-0.045em', margin:'0 0 24px', maxWidth:'14ch', position:'relative', zIndex:1 }}>
          Stop scrolling.{' '}
          <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.gold }}>Start playing.</em>
        </h2>
        <p style={{ color:`color-mix(in srgb, ${T.bg} 70%, ${T.ink3})`, fontSize:18, maxWidth:'56ch', margin:'0 0 32px', lineHeight:1.5, position:'relative', zIndex:1 }}>
          Pull up a tab, grab some friends, and find out which of you is the worst at everything. (It&apos;s never the person who says &quot;I&apos;m bad at games.&quot;)
        </p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', position:'relative', zIndex:1 }}>
          <button onClick={onCreateRoom} className="io-btn" style={{
            display:'inline-flex', alignItems:'center', gap:10, padding:'16px 24px',
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:15,
            background: T.torch, color: T.paper, border:`1px solid ${T.torch}`,
            borderRadius:999, cursor:'pointer', boxShadow:`0 6px 24px -6px ${T.torch}99`,
          }}>
            Create a room <span>→</span>
          </button>
          <button onClick={onJoin} className="io-btn" style={{
            display:'inline-flex', alignItems:'center', gap:10, padding:'16px 24px',
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:15,
            background:'transparent', color: T.bg,
            border:`1px solid color-mix(in srgb, ${T.bg} 40%, transparent)`,
            borderRadius:999, cursor:'pointer',
          }}>
            Join with code
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ onCreateRoom }: { onCreateRoom: () => void }) {
  return (
    <footer style={{ borderTop:`1.5px solid ${T.ink}`, padding:'48px 28px 56px' }}>
      <div style={{ maxWidth:1400, margin:'0 auto', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:32, alignItems:'start' }} className="footer-grid-responsive">
        <div>
          <p style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:80, lineHeight:.88, letterSpacing:'-0.05em', color: T.ink, margin:0 }}>
            Internet<br />
            <em style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontStyle:'italic', fontWeight:400, color: T.torch }}>Olympics</em>
          </p>
          {/* CashApp */}
          <a
            href="https://cash.app/$MarMar642"
            target="_blank"
            rel="noopener noreferrer"
            className="io-btn"
            style={{
              display:'inline-flex', alignItems:'center', gap:8, marginTop:28,
              padding:'10px 18px', borderRadius:999,
              background:'linear-gradient(135deg, #00C853, #009624)',
              color:'#fff', textDecoration:'none',
              fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:13,
              boxShadow:'0 4px 16px rgba(0,200,83,0.30)',
            }}
          >
            💚 Support dev — $MarMar642
          </a>
        </div>

        {[
          { h:'Play', links:[['Create room', onCreateRoom],['Join with code', undefined]] },
          { h:'Games', links:[['Mario Race'],['Knockback Arena'],['Floor is Lava'],['Physics Soccer']] },
          { h:'More Games', links:[['Shopping Cart Racing'],['Rage Obby']] },
        ].map((col) => (
          <div key={col.h}>
            <h4 style={{ margin:'0 0 12px', fontFamily:'monospace', fontSize:11, color: T.ink3, letterSpacing:'0.18em', textTransform:'uppercase' }}>{col.h}</h4>
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
              {col.links.map(([label, action]) => (
                <li key={label as string}>
                  {action
                    ? <button onClick={action as () => void} style={{ color: T.ink2, background:'none', border:'none', cursor:'pointer', fontSize:14, padding:0, fontFamily:'inherit' }} className="io-nav-link">{label as string}</button>
                    : <span style={{ color: T.ink2, fontSize:14 }}>{label as string}</span>
                  }
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ marginTop:36, maxWidth:1400, marginLeft:'auto', marginRight:'auto', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, color: T.ink3, fontFamily:'monospace', fontSize:11, letterSpacing:'0.06em' }}>
        <span>© 2026 INTERNET OLYMPICS · NO ACCOUNTS · NO DOWNLOADS · NO MERCY</span>
        <span>v4.077 · uptime 99.98%</span>
      </div>
    </footer>
  );
}

// ── Setup / Join Flow Modal ───────────────────────────────────────────────────

function SetupFlow({ onBack, mode }: { onBack: () => void; mode: 'create' | 'join' }) {
  const { createRoom, joinRoom } = useSocket();
  const [username, setUsername] = useState(useGameStore.getState().playerName);
  const [avatar, setAvatar]     = useState(useGameStore.getState().playerAvatar);
  const [color, setColor]       = useState(useGameStore.getState().playerColor);
  const [roomCode, setRoomCode] = useState('');
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
    <div style={{
      background: T.paper, borderRadius:24, padding:28,
      border:`1px solid ${T.lineStr}`,
      boxShadow:'0 32px 64px -24px rgba(20,22,27,0.3)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color: T.ink3, fontSize:20, padding:0, lineHeight:1 }}>←</button>
        <h2 style={{ fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:22, color: T.ink, margin:0, letterSpacing:'-0.02em' }}>
          {mode === 'create' ? 'Create a Room' : 'Join with Code'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
        {/* Username */}
        <div>
          <label style={{ display:'block', fontSize:13, color: T.ink3, marginBottom:7, fontWeight:500 }}>Your Name</label>
          <input
            type="text" maxLength={20} value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username..."
            autoFocus
            style={{
              width:'100%', background: T.bg, border:`1.5px solid ${T.line}`,
              borderRadius:12, padding:'12px 16px', color: T.ink,
              fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:600, fontSize:17,
              outline:'none', transition:'border-color .15s', boxSizing:'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = T.torch)}
            onBlur={e => (e.target.style.borderColor = T.line)}
          />
        </div>

        {/* Room code */}
        {mode === 'join' && (
          <div>
            <label style={{ display:'block', fontSize:13, color: T.ink3, marginBottom:7, fontWeight:500 }}>Room Code</label>
            <input
              type="text" maxLength={6} value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              style={{
                width:'100%', background: T.bg, border:`1.5px solid ${T.line}`,
                borderRadius:12, padding:'12px 16px', color: T.ink,
                fontFamily:'monospace', fontWeight:700, fontSize:28,
                letterSpacing:'0.3em', textAlign:'center', textTransform:'uppercase',
                outline:'none', transition:'border-color .15s', boxSizing:'border-box',
              }}
              onFocus={e => (e.target.style.borderColor = T.torch)}
              onBlur={e => (e.target.style.borderColor = T.line)}
            />
          </div>
        )}

        {/* Avatar */}
        <div>
          <label style={{ display:'block', fontSize:13, color: T.ink3, marginBottom:7, fontWeight:500 }}>Avatar</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:6 }}>
            {AVATAR_OPTIONS.slice(0, 16).map((em) => (
              <button key={em} type="button" onClick={() => setAvatar(em)} style={{
                fontSize:20, padding:6, borderRadius:10, border:`1.5px solid`,
                borderColor: avatar === em ? T.torch : 'transparent',
                background: avatar === em ? `${T.torch}18` : T.bg2,
                cursor:'pointer', transition:'all .15s', transform: avatar === em ? 'scale(1.1)' : 'scale(1)',
              }}>{em}</button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label style={{ display:'block', fontSize:13, color: T.ink3, marginBottom:7, fontWeight:500 }}>Color</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {COLOR_OPTIONS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width:32, height:32, borderRadius:'50%', background:c, border:'none', cursor:'pointer',
                transition:'transform .15s', transform: color === c ? 'scale(1.25)' : 'scale(1)',
                outline: color === c ? `2px solid ${T.ink}` : 'none', outlineOffset:2,
              }} />
            ))}
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity:0, y:-5 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0 }}
              style={{ color:'#B91C1C', fontSize:14, background:'#FEE2E2', borderRadius:8, padding:'8px 12px', margin:0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button type="submit" disabled={loading} className="io-btn" style={{
          width:'100%', padding:'14px', borderRadius:999, border:'none', cursor: loading ? 'default' : 'pointer',
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif", fontWeight:700, fontSize:16,
          background: loading ? T.inkFaint : T.torch, color: T.paper,
          boxShadow: loading ? 'none' : `0 6px 20px -6px ${T.torch}88`,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          {loading
            ? <><motion.span animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}>⟳</motion.span>{mode === 'create' ? 'Creating...' : 'Joining...'}</>
            : mode === 'create' ? 'Create Room →' : 'Join Now →'
          }
        </button>
      </form>
    </div>
  );
}
