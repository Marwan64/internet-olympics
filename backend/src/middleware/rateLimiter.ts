import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface RateEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

const WINDOW_MS = 10_000;       // 10-second sliding window
const MAX_EVENTS = 60;          // max non-game events per window (lobby/chat actions)
const BLOCK_DURATION_MS = 10_000; // 10-second block on violation (was 30, too punishing)

const clientRates = new Map<string, RateEntry>();

// Periodically clean up stale entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of clientRates.entries()) {
    if (now - entry.windowStart > WINDOW_MS * 2 && !entry.blocked) {
      clientRates.delete(key);
    }
  }
}, 60_000);

export function rateLimitSocket(socket: Socket, event: string): boolean {
  const now = Date.now();
  const key = socket.id;

  let entry = clientRates.get(key);
  if (!entry) {
    entry = { count: 0, windowStart: now, blocked: false, blockedUntil: 0 };
    clientRates.set(key, entry);
  }

  if (entry.blocked) {
    if (now >= entry.blockedUntil) {
      entry.blocked = false;
      entry.count = 0;
      entry.windowStart = now;
    } else {
      return false; // still blocked
    }
  }

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count++;

  if (entry.count > MAX_EVENTS) {
    entry.blocked = true;
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    logger.warn(`Rate limit exceeded: socket=${socket.id} event=${event}`);
    socket.emit('lobby:error', {
      message: 'Too many requests. You are temporarily blocked.',
      code: 'RATE_LIMITED',
    });
    return false;
  }

  return true;
}

// Middleware wrapper — call this at the top of every event handler
export function withRateLimit(socket: Socket, event: string, handler: () => void): void {
  if (rateLimitSocket(socket, event)) {
    handler();
  }
}

// Profanity filter (simple, extendable)
const BANNED_WORDS = new Set([
  'fuck', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'cock',
  'faggot', 'nigger', 'nigga', 'retard', 'whore', 'slut',
]);

export function filterProfanity(text: string): { clean: string; hasProfanity: boolean } {
  let clean = text;
  let hasProfanity = false;

  const words = text.split(/\s+/);
  const cleaned = words.map((word) => {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (BANNED_WORDS.has(lower)) {
      hasProfanity = true;
      return '*'.repeat(word.length);
    }
    return word;
  });

  clean = cleaned.join(' ');
  return { clean, hasProfanity };
}

// Validate username
export function validateUsername(username: string): { valid: boolean; reason?: string } {
  const trimmed = username.trim();
  if (trimmed.length < 2) return { valid: false, reason: 'Username too short (min 2 chars)' };
  if (trimmed.length > 20) return { valid: false, reason: 'Username too long (max 20 chars)' };
  if (!/^[a-zA-Z0-9_\- ]+$/.test(trimmed)) {
    return { valid: false, reason: 'Username contains invalid characters' };
  }
  const { hasProfanity } = filterProfanity(trimmed);
  if (hasProfanity) return { valid: false, reason: 'Username contains inappropriate language' };
  return { valid: true };
}
