import { Server } from 'socket.io';
import { GameResults, PlayerResult, SpeedTypingData, PlayerTypingProgress } from '../types';
import { BaseGame, GameConfig } from './BaseGame';

// ── Word Bank ──────────────────────────────────────────────────────────────────
const EASY_WORDS = [
  'cat', 'dog', 'run', 'big', 'sun', 'fun', 'hat', 'map', 'bag', 'hot',
  'jet', 'log', 'mud', 'nap', 'pan', 'pot', 'rag', 'sad', 'tan', 'van',
  'web', 'fox', 'gym', 'hub', 'ink', 'jam', 'key', 'lip', 'mix', 'nod',
];

const MEDIUM_WORDS = [
  'blast', 'brave', 'chaos', 'dance', 'eager', 'flame', 'ghost', 'happy',
  'input', 'joker', 'karma', 'laser', 'magic', 'night', 'ocean', 'pizza',
  'quest', 'rapid', 'solar', 'tiger', 'ultra', 'venom', 'water', 'xenon',
  'yacht', 'zebra', 'alpha', 'bravo', 'cyber', 'delta', 'emoji', 'fever',
  'gloom', 'hover', 'irony', 'juice', 'knack', 'lucid', 'money', 'noble',
  'orbit', 'pixel', 'quirk', 'rhythm', 'spicy', 'toxic', 'unity', 'viral',
  'wrath', 'xylem', 'yield', 'zippy',
];

const HARD_WORDS = [
  'algorithm', 'bluetooth', 'champion', 'dashboard', 'effervescent',
  'fluorescent', 'gymnasium', 'hemisphere', 'illustration', 'jurisdiction',
  'kaleidoscope', 'labyrinth', 'magnificent', 'nevertheless', 'orchestrate',
  'particularly', 'questionnaire', 'refrigerator', 'simultaneously', 'terminology',
  'understanding', 'vulnerability', 'waterproof', 'xylophone', 'yesterday',
  'catastrophe', 'development', 'elimination', 'fascinating', 'guidelines',
  'helicopter', 'independent', 'juxtapose', 'knowledge', 'locomotive',
  'mathematics', 'nightmarish', 'opportunity', 'perspective', 'quintessence',
];

const CHAOS_FAKE_WORDS = [
  '>>> TYPE THIS <<<', 'WRONG WORD', 'GOTCHA!', 'JUST KIDDING', 'NOT REAL',
  '???', 'IGNORE THIS', 'LMAO', 'SKIP ME', 'NOPE', 'FAKE NEWS',
];

// ── Game Implementation ────────────────────────────────────────────────────────

interface PlayerState {
  queue: string[];
  wordIndex: number;
  wordsCompleted: number;
  combo: number;
  startTime: number;
  lastWordTime: number;
  accuracyHits: number;
  accuracyMisses: number;
  currentWpm: number;
}

export class SpeedTypingGame extends BaseGame {
  readonly gameType = 'speed-typing' as const;
  readonly displayName = 'Speed Typing Chaos';

  private playerStates = new Map<string, PlayerState>();
  private activeChaos: string | null = null;
  private wordDifficulty: 'easy' | 'medium' | 'hard' = 'medium';

  constructor(io: Server, config: GameConfig, previousScores: Record<string, number> = {}) {
    super(io, config, previousScores);
    // Ramp difficulty as games progress
    if (config.gameNumber >= 4) this.wordDifficulty = 'hard';
    else if (config.gameNumber <= 1) this.wordDifficulty = 'easy';
  }

  protected async onStart(): Promise<void> {
    // Generate unique word queues for each player
    for (const id of this.config.playerIds) {
      this.playerStates.set(id, {
        queue: this.generateWordQueue(50),
        wordIndex: 0,
        wordsCompleted: 0,
        combo: 0,
        startTime: Date.now(),
        lastWordTime: Date.now(),
        accuracyHits: 0,
        accuracyMisses: 0,
        currentWpm: 0,
      });
    }
  }

  protected async onPlayStart(): Promise<void> {
    // Update start times now that we're actually playing
    for (const state of this.playerStates.values()) {
      state.startTime = Date.now();
      state.lastWordTime = Date.now();
    }
    // Send each player their personalized word queue
    this.broadcastPersonalizedState();
  }

  protected onInput(
    playerId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void {
    if (input.type !== 'word_submit') return;

    const state = this.playerStates.get(playerId);
    if (!state) return;

    const submittedWord = (input.payload.word as string || '').trim().toLowerCase();
    const expectedWord = state.queue[state.wordIndex]?.toLowerCase();

    if (!expectedWord) return;

    // Skip fake chaos words automatically (they shouldn't be typeable)
    const isChaosWord = CHAOS_FAKE_WORDS.some((w) => expectedWord === w.toLowerCase());
    if (isChaosWord) {
      state.wordIndex++;
      return;
    }

    const isCorrect = submittedWord === expectedWord;

    if (isCorrect) {
      state.accuracyHits++;
      state.combo++;
      state.wordIndex++;
      state.wordsCompleted++;

      const now = Date.now();
      const elapsed = (now - state.startTime) / 60000; // minutes
      state.currentWpm = Math.round(state.wordsCompleted / elapsed) || 0;
      state.lastWordTime = now;

      // Score = base + speed bonus + combo multiplier
      const timeBonus = Math.max(0, 50 - Math.floor((now - state.lastWordTime) / 100));
      const comboMultiplier = Math.min(state.combo * 0.1 + 1, 3.0);
      const points = Math.round((100 + timeBonus) * comboMultiplier);

      this.addScore(playerId, points);

      // If player finishes their queue, give them more words
      if (state.wordIndex >= state.queue.length - 5) {
        state.queue.push(...this.generateWordQueue(20));
      }

      this.broadcastPersonalizedState();
      this.broadcastState();
    } else {
      state.accuracyMisses++;
      state.combo = 0; // break combo
    }
  }

  protected onTick(remaining: number): void {
    // Inject chaos fake words randomly during chaos events
    if (this.activeChaos === 'FAKE_WORDS' && Math.random() < 0.3) {
      for (const state of this.playerStates.values()) {
        const fakeWord = CHAOS_FAKE_WORDS[Math.floor(Math.random() * CHAOS_FAKE_WORDS.length)];
        state.queue.splice(state.wordIndex + 1, 0, fakeWord);
      }
    }
  }

  protected override triggerChaos(): void {
    super.triggerChaos();

    // Apply server-side chaos effects
    this.activeChaos = null;
    const chaosType = this.CHAOS_EVENTS[Math.floor(Math.random() * this.CHAOS_EVENTS.length)];

    if (chaosType === 'WORD_SCRAMBLE') {
      this.scrambleCurrentWords();
    } else if (chaosType === 'WORD_FLIP') {
      this.flipCurrentWords();
    } else if (chaosType === 'FAKE_WORDS') {
      this.activeChaos = 'FAKE_WORDS';
      setTimeout(() => { this.activeChaos = null; }, 5000);
    }
  }

  private scrambleCurrentWords(): void {
    for (const state of this.playerStates.values()) {
      // Scramble the next few words in the queue (all same words, just shuffled chars)
      for (let i = state.wordIndex; i < Math.min(state.wordIndex + 3, state.queue.length); i++) {
        state.queue[i] = shuffleString(state.queue[i]);
      }
    }
    this.broadcastPersonalizedState();
  }

  private flipCurrentWords(): void {
    for (const state of this.playerStates.values()) {
      for (let i = state.wordIndex; i < Math.min(state.wordIndex + 3, state.queue.length); i++) {
        state.queue[i] = state.queue[i].split('').reverse().join('');
      }
    }
    this.broadcastPersonalizedState();
  }

  // Send each player their own word queue (personalized)
  private broadcastPersonalizedState(): void {
    for (const [playerId, state] of this.playerStates.entries()) {
      const socket = this.io.sockets.sockets.get(playerId);
      if (!socket) continue;

      const visibleWords = state.queue.slice(state.wordIndex, state.wordIndex + 5);

      socket.emit('game:personal', {
        currentWord: visibleWords[0] || '',
        upcomingWords: visibleWords.slice(1),
        wordIndex: state.wordIndex,
        wordsCompleted: state.wordsCompleted,
        combo: state.combo,
        wpm: state.currentWpm,
      });
    }
  }

  protected getGameData(): SpeedTypingData {
    const playerProgress: Record<string, PlayerTypingProgress> = {};
    for (const [id, state] of this.playerStates.entries()) {
      const totalAttempts = state.accuracyHits + state.accuracyMisses;
      playerProgress[id] = {
        wordsCompleted: state.wordsCompleted,
        currentWordIndex: state.wordIndex,
        combo: state.combo,
        wpm: state.currentWpm,
        accuracy: totalAttempts > 0 ? Math.round((state.accuracyHits / totalAttempts) * 100) : 100,
      };
    }

    return {
      words: [],
      currentWord: '',
      wordIndex: 0,
      wordsCompleted: 0,
      combo: 0,
      wpm: 0,
      chaosActive: this.activeChaos,
      playerProgress,
    };
  }

  protected buildResults(): GameResults {
    const leaderboard = this.getLeaderboard();
    const playerStates = this.playerStates;

    const resultPlayers: PlayerResult[] = leaderboard.map((entry, idx) => {
      const state = playerStates.get(entry.playerId);
      const totalAttempts = (state?.accuracyHits ?? 0) + (state?.accuracyMisses ?? 0);

      return {
        playerId: entry.playerId,
        username: '',  // filled by RoomManager
        avatar: '',
        color: '',
        roundScore: entry.score,
        totalScore: this.totalScores[entry.playerId] ?? 0,
        rank: idx + 1,
        stats: {
          wordsCompleted: state?.wordsCompleted ?? 0,
          wpm: state?.currentWpm ?? 0,
          accuracy: totalAttempts > 0
            ? Math.round(((state?.accuracyHits ?? 0) / totalAttempts) * 100)
            : 100,
          maxCombo: state?.combo ?? 0,
        },
      };
    });

    const topPlayer = leaderboard[0];
    const highlights: string[] = [];

    if (topPlayer) {
      const topState = playerStates.get(topPlayer.playerId);
      if (topState && topState.currentWpm > 60) {
        highlights.push(`🚀 Lightning fingers! ${topState.currentWpm} WPM!`);
      }

      const maxCombo = Math.max(...Array.from(playerStates.values()).map((s) => s.combo));
      if (maxCombo >= 10) highlights.push(`🔥 ${maxCombo}x combo achieved!`);
    }

    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: leaderboard[0]?.playerId ?? '',
      highlights,
    };
  }

  private generateWordQueue(count: number): string[] {
    const words = [...EASY_WORDS, ...MEDIUM_WORDS];
    if (this.wordDifficulty === 'medium' || this.wordDifficulty === 'hard') {
      words.push(...MEDIUM_WORDS);
    }
    if (this.wordDifficulty === 'hard') {
      words.push(...HARD_WORDS);
    }

    const queue: string[] = [];
    for (let i = 0; i < count; i++) {
      queue.push(words[Math.floor(Math.random() * words.length)]);
    }
    return queue;
  }
}

function shuffleString(str: string): string {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}
