'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { Player, ChatMessage } from '@/types';
import ToastContainer from '@/components/ui/ToastContainer';

// ── QR Code Component (lazy) ──────────────────────────────────────────────────

function QRCode({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = `${window.location.origin}?join=${code}`;
    import('qrcode').then((QR) => {
      if (canvasRef.current) {
        QR.toCanvas(canvasRef.current, url, {
          width: 140,
          margin: 1,
          color: { dark: '#ffffff', light: '#0f0f23' },
        });
      }
    });
  }, [code]);

  return <canvas ref={canvasRef} className="rounded-xl" />;
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
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-3 p-3 rounded-xl transition-all group"
      style={{
        background: isMe ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isMe ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 relative"
        style={{
          background: `${player.color}25`,
          border: `2px solid ${player.color}`,
          boxShadow: player.ready ? `0 0 12px ${player.color}60` : 'none',
        }}
      >
        {player.avatar}
        {player.isHost && (
          <div className="absolute -top-1 -right-1 text-xs">👑</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display font-semibold text-white text-sm truncate">
            {player.username}
          </span>
          {isMe && <span className="text-xs text-brand-purple font-mono">(you)</span>}
        </div>
        <div className="text-xs text-white/40 mt-0.5">
          {!player.isConnected ? '🔴 Reconnecting...' : player.ready ? '✅ Ready' : '⏳ Waiting...'}
        </div>
      </div>

      {/* Ready badge */}
      <div className={`text-xs font-bold px-2 py-1 rounded-lg ${player.ready ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'}`}>
        {player.ready ? 'READY' : 'NOT READY'}
      </div>

      {/* Host: kick button */}
      {viewerIsHost && !isMe && !player.isHost && (
        <button
          onClick={kickPlayer}
          className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 transition-all px-2 py-1 rounded-lg hover:bg-red-500/10"
        >
          Kick
        </button>
      )}
    </motion.div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel() {
  const messages = useGameStore((s) => s.chatMessages);
  const { sendChat } = useSocketActions();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setInput('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: '280px' }}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          maxLength={200}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-brand-purple transition-colors"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isSystem = msg.type === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center text-xs text-white/40 py-0.5"
      >
        {msg.message}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2"
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5"
        style={{ background: `${msg.color}30`, border: `1px solid ${msg.color}60` }}
      >
        {msg.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-bold" style={{ color: msg.color }}>{msg.username}: </span>
        <span className="text-sm text-white/80 break-words">{msg.message}</span>
      </div>
    </motion.div>
  );
}

// ── Main Lobby ────────────────────────────────────────────────────────────────

export default function LobbyRoom() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const countdown = useGameStore((s) => s.gameCountdown);
  const { setReady, startGame, leaveRoom } = useSocketActions();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'players' | 'chat'>('players');

  if (!room) return null;

  const me = room.players.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const allReady = connectedPlayers.every((p) => p.ready || p.isHost);
  const readyCount = connectedPlayers.filter((p) => p.ready).length;

  function copyCode() {
    navigator.clipboard.writeText(room!.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-game-bg relative overflow-hidden">
      {/* BG Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-96 opacity-20 rounded-full"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }} />
      </div>

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="font-display font-black text-[12rem] leading-none"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #EC4899)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: 'none',
                filter: 'drop-shadow(0 0 40px rgba(245,158,11,0.8))',
              }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="text-white/50 text-sm mb-1">🏆 Internet Olympics</div>
            <h1 className="font-display font-black text-3xl text-white">Game Lobby</h1>
          </motion.div>
          <button
            onClick={leaveRoom}
            className="text-white/40 hover:text-white text-sm transition-colors px-3 py-2 rounded-xl hover:bg-white/10"
          >
            Leave →
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Room Info */}
          <div className="lg:col-span-1 space-y-4">
            {/* Room Code */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-5"
              style={{ border: '1px solid rgba(124,58,237,0.3)' }}
            >
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2 font-mono">Room Code</p>
              <button
                onClick={copyCode}
                className="w-full font-mono font-black text-4xl tracking-[0.2em] text-white hover:text-brand-purple-light transition-colors text-center py-2"
              >
                {room.code}
              </button>
              <motion.p
                className="text-center text-xs mt-1"
                animate={{ color: copied ? '#10B981' : 'rgba(255,255,255,0.3)' }}
              >
                {copied ? '✅ Copied!' : 'Tap to copy'}
              </motion.p>

              {/* QR Code */}
              <div className="flex justify-center mt-4">
                <QRCode code={room.code} />
              </div>
              <p className="text-center text-xs text-white/30 mt-2">Scan to join instantly</p>
            </motion.div>

            {/* Join URL */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-xl p-4"
            >
              <p className="text-white/50 text-xs mb-1">Share link</p>
              <p className="font-mono text-xs text-brand-cyan break-all">
                {typeof window !== 'undefined' ? `${window.location.origin}?join=${room.code}` : `internetolympics.gg?join=${room.code}`}
              </p>
            </motion.div>

            {/* Game playlist */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass rounded-xl p-4"
            >
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3 font-mono">Game Playlist</p>
              <div className="space-y-2">
                {room.gamePlaylist.map((game, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-white/30 font-mono text-xs w-4">{idx + 1}.</span>
                    <span className="text-white/70">
                      {game === 'mario-race' ? '🍄 Mario Race' :
                       game === 'knockback-arena' ? '👊 Knockback Arena' :
                       game === 'shopping-cart-racing' ? '🛒 Shopping Cart Racing' :
                       '🎮 ' + game}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Center/Right: Players + Chat */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tab switcher */}
            <div className="flex gap-2">
              {(['players', 'chat'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize ${
                    tab === t
                      ? 'bg-brand-purple text-white'
                      : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t === 'players' ? `👥 Players (${connectedPlayers.length}/${room.maxPlayers})` : '💬 Chat'}
                </button>
              ))}
            </div>

            <motion.div
              className="glass rounded-2xl p-4"
              style={{ minHeight: '340px' }}
            >
              {tab === 'players' ? (
                <div className="space-y-2">
                  <AnimatePresence>
                    {room.players.filter((p) => p.isConnected).map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        isMe={player.id === playerId}
                        isHost={isHost}
                      />
                    ))}
                  </AnimatePresence>

                  {connectedPlayers.length < 2 && (
                    <p className="text-center text-white/30 text-sm py-4">
                      Waiting for more players... Share the code! 🔗
                    </p>
                  )}
                </div>
              ) : (
                <ChatPanel />
              )}
            </motion.div>

            {/* Ready / Start controls */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass rounded-2xl p-4"
            >
              {/* Ready progress */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white/50">
                    {readyCount} / {connectedPlayers.length - (isHost ? 1 : 0)} ready
                  </span>
                  {allReady && connectedPlayers.length >= 1 && (
                    <span className="text-green-400 font-bold animate-pulse">✨ All ready!</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #06B6D4, #7C3AED)',
                      boxShadow: '0 0 8px rgba(124,58,237,0.6)',
                    }}
                    animate={{
                      width: `${connectedPlayers.length > 1
                        ? (readyCount / (connectedPlayers.length - (isHost ? 1 : 0))) * 100
                        : 0}%`
                    }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                {/* Ready button for non-hosts */}
                {!isHost && (
                  <button
                    onClick={() => setReady(!me?.ready)}
                    className="flex-1 py-3 rounded-xl font-display font-bold text-lg transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: me?.ready
                        ? 'rgba(16,185,129,0.2)'
                        : 'linear-gradient(135deg, #06B6D4, #7C3AED)',
                      border: me?.ready ? '1px solid rgba(16,185,129,0.5)' : 'none',
                      color: me?.ready ? '#10B981' : 'white',
                    }}
                  >
                    {me?.ready ? '✅ Ready!' : '⏳ Not Ready'}
                  </button>
                )}

                {/* Start button for host */}
                {isHost && (
                  <button
                    onClick={startGame}
                    disabled={connectedPlayers.length < 1}
                    className="flex-1 py-3 rounded-xl font-display font-bold text-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                      boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
                    }}
                  >
                    🚀 Start Game!
                  </button>
                )}
              </div>

              {isHost && connectedPlayers.length === 1 && (
                <p className="text-center text-white/30 text-xs mt-2">
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
