// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  socketId: string;
  username: string;
  avatar: string; // emoji character
  color: string;  // hex color for avatar ring
  score: number;
  roundScore: number;
  ready: boolean;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;
  streak: number;
  xp: number;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  status: RoomStatus;
  gamePlaylist: GameType[];
  currentGameIndex: number;
  config: RoomConfig;
  chat: ChatMessage[];
  createdAt: number;
  maxPlayers: number;
}

export interface RoomConfig {
  maxPlayers: number;
  isPublic: boolean;
  gameCount: number;
  enableChaos: boolean;
  roundDuration: number; // seconds
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  avatar: string;
  color: string;
  message: string;
  timestamp: number;
  type: 'chat' | 'system' | 'announcement';
}

// ─── Game Types ───────────────────────────────────────────────────────────────

export type GameType =
  | 'speed-typing'
  | 'fake-trivia'
  | 'drawing'
  | 'physics-soccer'
  | 'ai-image-guess'
  | 'sound-mimic';

export type RoomStatus =
  | 'lobby'
  | 'countdown'
  | 'intro'
  | 'playing'
  | 'results'
  | 'podium'
  | 'ended';

export type GamePhase = 'intro' | 'playing' | 'results';

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  type: GameType;
  phase: GamePhase;
  timeRemaining: number;
  scores: Record<string, number>; // playerId -> round score
  totalScores: Record<string, number>; // playerId -> cumulative score
  data: SpeedTypingData | FakeTriviaData | Record<string, unknown>;
  gameNumber: number;
  totalGames: number;
}

// Speed Typing specific
export interface SpeedTypingData {
  words: string[]; // current word queue per player (server sends per-player)
  currentWord: string;
  wordIndex: number;
  wordsCompleted: number;
  combo: number;
  wpm: number;
  chaosActive: string | null;
  playerProgress: Record<string, PlayerTypingProgress>;
}

export interface PlayerTypingProgress {
  wordsCompleted: number;
  currentWordIndex: number;
  combo: number;
  wpm: number;
  accuracy: number;
}

// Fake Trivia specific
export interface FakeTriviaData {
  question: TriviaQuestion;
  questionNumber: number;
  totalQuestions: number;
  playerAnswers: Record<string, TriviaAnswer | null>;
  showResults: boolean;
  correctAnswer?: 'real' | 'fake';
}

export interface TriviaQuestion {
  id: string;
  text: string;
  type: 'real' | 'fake';
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
}

export interface TriviaAnswer {
  playerId: string;
  answer: 'real' | 'fake';
  timeMs: number;
  correct?: boolean;
  points?: number;
}

// ─── Chaos System ─────────────────────────────────────────────────────────────

export type ChaosEventType =
  | 'SCREEN_SHAKE'
  | 'WORD_FLIP'
  | 'SPEED_UP'
  | 'FAKE_WORDS'
  | 'MIRROR'
  | 'LOW_GRAVITY'
  | 'EVERYONE_INVISIBLE'
  | 'REVERSE_CONTROLS'
  | 'SUPER_SPEED'
  | 'TINY_TEXT'
  | 'DISCO_MODE'
  | 'WORD_SCRAMBLE';

export interface ChaosEvent {
  type: ChaosEventType;
  duration: number; // ms
  message: string;
  intensity: 'low' | 'medium' | 'high';
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface GameResults {
  gameType: GameType;
  scores: PlayerResult[];
  mvp: string; // playerId
  highlights: string[];
}

export interface PlayerResult {
  playerId: string;
  username: string;
  avatar: string;
  color: string;
  roundScore: number;
  totalScore: number;
  rank: number;
  stats: Record<string, number | string>;
}

export interface PodiumData {
  players: PlayerResult[];
  gameHistory: GameResults[];
  champion: PlayerResult;
  awards: Award[];
}

export interface Award {
  playerId: string;
  title: string;
  emoji: string;
  description: string;
}

// ─── Socket Events ────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'lobby:updated': (room: Room) => void;
  'lobby:error': (error: { message: string; code?: string }) => void;
  'lobby:chat': (message: ChatMessage) => void;
  'lobby:playerJoined': (player: Player) => void;
  'lobby:playerLeft': (playerId: string, username: string) => void;
  'lobby:playerReady': (playerId: string, ready: boolean) => void;
  'lobby:hostChanged': (newHostId: string) => void;

  'game:countdown': (seconds: number) => void;
  'game:begin': (state: GameState) => void;
  'game:state': (state: Partial<GameState> & { data: unknown }) => void;
  'game:end': (results: GameResults) => void;
  'game:next': (countdown: number) => void;

  'session:podium': (data: PodiumData) => void;

  'chaos:event': (event: ChaosEvent) => void;
  'chaos:announcement': (text: string) => void;

  'system:ping': (ts: number) => void;
}

export interface ClientToServerEvents {
  'lobby:create': (
    data: CreateRoomData,
    cb: (res: LobbyResponse<{ room: Room; playerId: string }>) => void
  ) => void;
  'lobby:join': (
    data: JoinRoomData,
    cb: (res: LobbyResponse<{ room: Room; playerId: string }>) => void
  ) => void;
  'lobby:leave': () => void;
  'lobby:ready': (ready: boolean) => void;
  'lobby:start': () => void;
  'lobby:chat': (message: string) => void;
  'lobby:kick': (targetPlayerId: string) => void;

  'game:input': (input: GameInput) => void;

  'system:pong': (ts: number) => void;
}

// ─── Request/Response Shapes ──────────────────────────────────────────────────

export interface CreateRoomData {
  username: string;
  avatar: string;
  color: string;
  config?: Partial<RoomConfig>;
}

export interface JoinRoomData {
  code: string;
  username: string;
  avatar: string;
  color: string;
}

export type LobbyResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface GameInput {
  type: string;
  payload: Record<string, unknown>;
}

// ─── Speed Typing Input ───────────────────────────────────────────────────────

export interface SpeedTypingInput extends GameInput {
  type: 'word_submit';
  payload: {
    word: string;
    wordIndex: number;
  };
}

// ─── Trivia Input ─────────────────────────────────────────────────────────────

export interface TriviaInput extends GameInput {
  type: 'trivia_answer';
  payload: {
    answer: 'real' | 'fake';
    timeMs: number;
  };
}
