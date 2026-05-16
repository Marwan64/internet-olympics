# 🏆 Internet Olympics

**The most chaotic multiplayer browser party game platform.**

Inspired by Fall Guys, Mario Party, and Jackbox — but fully browser-based, instant-join, mobile-compatible, and built for streamers and friend groups.

---

## ✨ Features

| Feature | Status |
|---|---|
| Real-time multiplayer (Socket.IO) | ✅ |
| Room creation & joining with codes | ✅ |
| QR code instant join | ✅ |
| Avatar & color customization | ✅ |
| Host controls & kick | ✅ |
| Ready-up system | ✅ |
| In-game chat | ✅ |
| Speed Typing Chaos minigame | ✅ |
| Real or Fake? Trivia minigame | ✅ |
| Chaos event system (random events) | ✅ |
| End-of-session podium + awards | ✅ |
| Mobile responsive UI | ✅ |
| Rate limiting & anti-spam | ✅ |
| Profanity filtering | ✅ |
| Reconnection support | ✅ |
| Drawing Contest | 🚧 Phase 2 |
| Physics Soccer | 🚧 Phase 2 |
| Voice chat (WebRTC) | 🚧 Phase 2 |
| Streamer mode | 🚧 Phase 3 |
| Progression / XP system | 🚧 Phase 3 |
| Cosmetic shop | 🚧 Phase 3 |

---

## 🚀 Quick Start

### Option A: Local Dev (Recommended)

```bash
./setup.sh
```

Then in two terminals:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open **http://localhost:3000** in your browser.

### Option B: Docker

```bash
docker compose up --build
```

Open **http://localhost:3000**.

---

## 🏗️ Architecture

```
internet-olympics/
├── backend/                  # Node.js + Express + Socket.IO
│   └── src/
│       ├── server.ts         # Entry point, all socket events
│       ├── managers/
│       │   ├── RoomManager.ts     # Room lifecycle & player management
│       │   └── GameManager.ts     # Game session orchestration
│       ├── games/
│       │   ├── BaseGame.ts        # Abstract game class (timer, chaos, scoring)
│       │   ├── SpeedTyping.ts     # Speed Typing Chaos
│       │   └── FakeTrivia.ts      # Real or Fake? Trivia
│       └── middleware/
│           └── rateLimiter.ts     # Rate limiting + profanity filter
│
├── frontend/                 # Next.js 14 + TypeScript
│   └── src/
│       ├── app/
│       │   ├── page.tsx      # Landing page + create/join flow
│       │   └── layout.tsx
│       ├── components/
│       │   ├── lobby/        # Lobby room, player list, chat
│       │   ├── games/        # Game screens (SpeedTyping, FakeTrivia)
│       │   └── ui/           # Shared UI (Toast, Podium, ChaosOverlay)
│       ├── hooks/
│       │   └── useSocket.ts  # All Socket.IO logic
│       └── store/
│           └── gameStore.ts  # Zustand global state
│
└── shared/
    └── types/index.ts        # Shared TypeScript types (server + client)
```

---

## 🎮 How It Works

### Lobby Flow
1. Host creates a room → gets a 6-character code
2. Players join via code or QR scan
3. Host starts the game when ready
4. Games auto-rotate through the playlist
5. Podium shown at the end

### Game Engine
Every minigame extends `BaseGame`, which provides:
- 60-second timer with `onTick()` hook
- Chaos event scheduler (every 8–15s)
- Score management with `addScore()`
- State broadcast via `broadcastState()`

To add a new game:
```typescript
class MyNewGame extends BaseGame {
  readonly gameType = 'my-game' as const;
  readonly displayName = 'My New Game';

  protected async onStart(): Promise<void> { /* setup */ }
  protected async onPlayStart(): Promise<void> { /* begin */ }
  protected onInput(playerId: string, input: GameInput): void { /* handle player actions */ }
  protected onTick(remaining: number): void { /* per-second logic */ }
  protected getGameData(): MyGameData { /* return state for broadcast */ }
  protected buildResults(): GameResults { /* final scores */ }
}
```

### Chaos Events
Random chaos events fire every 8-15 seconds during gameplay:
- `SCREEN_SHAKE` — UI shakes violently
- `WORD_FLIP` / `MIRROR` — Words displayed backwards
- `DISCO_MODE` — Rainbow filter overlay
- `TINY_TEXT` — Text becomes microscopic
- `WORD_SCRAMBLE` — Letters scrambled
- `FAKE_WORDS` — Decoy words injected
- `SPEED_UP` — Timer speeds up

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, TailwindCSS, Framer Motion, Zustand |
| Backend | Node.js, Express, Socket.IO |
| Realtime | WebSockets (Socket.IO) |
| State | Redis (optional, in-memory fallback for dev) |
| Deployment | Docker, Vercel (frontend), Railway/Fly.io (backend) |

---

## 🌐 Deployment

### Frontend → Vercel

```bash
cd frontend
npx vercel --prod
```

Set env var:
- `NEXT_PUBLIC_SOCKET_URL` = your backend URL

### Backend → Railway / Fly.io

```bash
# Railway
railway login && railway up

# OR Fly.io
flyctl launch && flyctl deploy
```

Set env vars:
- `FRONTEND_URL` = your Vercel URL
- `JWT_SECRET` = random 64-char string
- `PORT` = 3001

---

## 📡 Socket Events Reference

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `lobby:create` | `{ username, avatar, color }` | Create new room |
| `lobby:join` | `{ code, username, avatar, color }` | Join existing room |
| `lobby:leave` | — | Leave current room |
| `lobby:ready` | `boolean` | Toggle ready state |
| `lobby:start` | — | Start game (host only) |
| `lobby:chat` | `string` | Send chat message |
| `game:input` | `{ type, payload }` | Send game action |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `lobby:updated` | `Room` | Full room state update |
| `lobby:error` | `{ message }` | Error response |
| `game:countdown` | `number` | Pre-game countdown |
| `game:begin` | `GameState` | Game starting |
| `game:state` | `GameState` | Periodic state update |
| `game:end` | `GameResults` | Round over |
| `session:podium` | `PodiumData` | Session complete |
| `chaos:event` | `ChaosEvent` | Chaos event triggered |
| `game:personal` | `PersonalGameData` | Per-player private data |

---

## 🔒 Security

- Rate limiting: 30 events/10s per socket
- Anti-spam block: 30-second cooldown on violation
- Profanity filtering on all user text
- Username validation (2-20 chars, alphanumeric)
- Server-authoritative game state (no client trust)
- CORS restricted to frontend origin

---

## 🗺️ Roadmap

### Phase 1 (Current — MVP)
- [x] Core multiplayer architecture
- [x] Lobby system with room codes + QR
- [x] Speed Typing Chaos minigame
- [x] Real or Fake? Trivia minigame
- [x] Chaos event system
- [x] Podium + awards
- [x] Mobile-responsive UI

### Phase 2
- [ ] Drawing Contest (Gartic Phone style)
- [ ] Physics Soccer (ragdoll)
- [ ] AI Image Guess
- [ ] Progression system (XP, levels)
- [ ] Cosmetic shop (emotes, skins)
- [ ] Voice chat (WebRTC)

### Phase 3
- [ ] Streamer mode + Twitch integration
- [ ] Replay system + clip button
- [ ] Audience voting
- [ ] Battle pass + seasons
- [ ] Public matchmaking
- [ ] AI-generated content (trivia, prompts)
- [ ] PostgreSQL persistence

---

## 📄 License

MIT — Build your own chaos.
