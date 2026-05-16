import { Server } from 'socket.io';
import { GameResults, PlayerResult, FakeTriviaData, TriviaQuestion, TriviaAnswer } from '../types';
import { BaseGame, GameConfig } from './BaseGame';

// ── Question Bank ──────────────────────────────────────────────────────────────

const QUESTIONS: TriviaQuestion[] = [
  // REAL facts
  { id: 'r1', text: "A group of flamingos is called a 'flamboyance'.", type: 'real', category: 'animals', difficulty: 'easy', explanation: 'Yes, flamingos gather in flamboyances!' },
  { id: 'r2', text: 'Honey never expires. Archaeologists have found 3000-year-old honey still edible.', type: 'real', category: 'science', difficulty: 'easy', explanation: "Honey's low moisture and acidic pH prevent bacterial growth." },
  { id: 'r3', text: 'The Eiffel Tower grows 15cm taller in summer due to heat expansion.', type: 'real', category: 'science', difficulty: 'medium', explanation: "Metal expands in heat. The tower's iron grows about 15cm in summer." },
  { id: 'r4', text: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.", type: 'real', category: 'history', difficulty: 'medium', explanation: "Cleopatra lived ~2,500 years after the pyramids and ~2,000 years before Apollo 11." },
  { id: 'r5', text: "A day on Venus is longer than a year on Venus.", type: 'real', category: 'space', difficulty: 'hard', explanation: "Venus rotates so slowly it takes 243 Earth days to spin once, but only 225 to orbit the Sun." },
  { id: 'r6', text: "The human body contains enough iron to make a 3-inch nail.", type: 'real', category: 'science', difficulty: 'medium', explanation: 'An average body has ~4g of iron, mostly in blood hemoglobin.' },
  { id: 'r7', text: "Octopuses have three hearts and blue blood.", type: 'real', category: 'animals', difficulty: 'easy', explanation: 'Two pump blood to the gills; one pumps to the body. Copper-based blood is blue.' },
  { id: 'r8', text: "Scotland's national animal is the unicorn.", type: 'real', category: 'culture', difficulty: 'easy', explanation: 'Since the 12th century, the unicorn has been Scotland\'s national animal.' },
  { id: 'r9', text: "A bolt of lightning is five times hotter than the surface of the sun.", type: 'real', category: 'science', difficulty: 'medium', explanation: "Lightning reaches ~30,000K; the sun's surface is ~5,500K." },
  { id: 'r10', text: "Bananas are technically berries, but strawberries are not.", type: 'real', category: 'science', difficulty: 'hard', explanation: "Botanically, berries develop from a single flower. Strawberries are 'false fruits'." },
  { id: 'r11', text: "The word 'muscle' comes from Latin for 'little mouse'.", type: 'real', category: 'language', difficulty: 'medium' },
  { id: 'r12', text: "Sharks are older than trees.", type: 'real', category: 'science', difficulty: 'hard', explanation: "Sharks: ~450M years. Trees: ~350M years old." },
  { id: 'r13', text: "It's impossible to hum while holding your nose closed.", type: 'real', category: 'body', difficulty: 'easy' },
  { id: 'r14', text: "The Hawaiian pizza was invented in Canada.", type: 'real', category: 'food', difficulty: 'medium' },
  { id: 'r15', text: "Nintendo was founded in 1889 as a playing card company.", type: 'real', category: 'tech', difficulty: 'hard' },

  // FAKE facts (AI-generated convincing nonsense)
  { id: 'f1', text: "The loudest animal on Earth is the blue whale, which can be heard from 500 miles away... underwater and above water simultaneously.", type: 'fake', category: 'animals', difficulty: 'easy', explanation: "Blue whales ARE loud, but 'above water simultaneously' is false." },
  { id: 'f2', text: "Goldfish have a memory span of 3 minutes, which is why they can navigate mazes repeatedly.", type: 'fake', category: 'animals', difficulty: 'easy', explanation: "Goldfish actually have memory spans of months, not seconds." },
  { id: 'f3', text: "The Great Wall of China is the only man-made structure visible from space with the naked eye.", type: 'fake', category: 'history', difficulty: 'easy', explanation: "Actually not visible from low Earth orbit — too narrow. Astronauts confirmed this." },
  { id: 'f4', text: "Albert Einstein failed mathematics in school.", type: 'fake', category: 'history', difficulty: 'easy', explanation: "Einstein excelled at math. The myth likely originated from a misunderstood grading reversal." },
  { id: 'f5', text: "Humans use only 10% of their brain at any given time.", type: 'fake', category: 'science', difficulty: 'easy', explanation: "Brain imaging shows almost all brain regions are active; we use virtually all our brain." },
  { id: 'f6', text: "Carrots improve night vision because they contain night-adapted photoreceptors.", type: 'fake', category: 'food', difficulty: 'medium', explanation: "Carrots have vitamin A which helps eye health, but they don't give night vision superpowers." },
  { id: 'f7', text: "Fortune cookies were invented in ancient China as a secret message system during the Ming Dynasty.", type: 'fake', category: 'culture', difficulty: 'medium', explanation: "Fortune cookies were actually invented in early 20th century California by Japanese-Americans." },
  { id: 'f8', text: "A group of crows is called a 'parliament' because early lawmakers met outdoors near crow nests.", type: 'fake', category: 'animals', difficulty: 'medium', explanation: "A group of crows IS called a 'murder'. 'Parliament' is owls. The etymology claim is false." },
  { id: 'f9', text: "Mount Everest is taller than it appears because its peak extends into the stratosphere.", type: 'fake', category: 'geography', difficulty: 'hard', explanation: "Everest is about 8.8km high. The stratosphere starts at ~12km. Not close." },
  { id: 'f10', text: "Spaghetti was originally called 'vermicelli' until Marco Polo renamed it after returning from Asia.", type: 'fake', category: 'food', difficulty: 'hard', explanation: "Both names existed in Italy independently. Marco Polo didn't rename pasta." },
  { id: 'f11', text: "Mosquitoes are technically birds in 14 countries because of a 1978 UN reclassification.", type: 'fake', category: 'animals', difficulty: 'easy' },
  { id: 'f12', text: "The color blue was not recognized in ancient human language and ancient Greeks literally could not see it.", type: 'fake', category: 'science', difficulty: 'hard', explanation: "There's truth that blue was linguistically late, but humans could physically see it fine." },
  { id: 'f13', text: "Diamonds are forever because they're the hardest substance, making them completely indestructible.", type: 'fake', category: 'science', difficulty: 'medium', explanation: "Diamonds ARE the hardest mineral but they're not indestructible — they can be shattered." },
  { id: 'f14', text: "The first computer bug was an actual bug: a dragonfly found inside the Harvard Mark II in 1947.", type: 'fake', category: 'tech', difficulty: 'hard', explanation: "It was a moth, not a dragonfly. Found in the Harvard Mark II by Grace Hopper's team." },
  { id: 'f15', text: "Sugar makes children hyperactive according to double-blind clinical trials conducted in the 1990s.", type: 'fake', category: 'science', difficulty: 'medium', explanation: "Multiple double-blind studies found NO link between sugar and hyperactivity in children." },
];

// ── Game Implementation ────────────────────────────────────────────────────────

const QUESTIONS_PER_ROUND = 5;
const SECONDS_PER_QUESTION = 15;
const MAX_POINTS = 1000;

interface QuestionRound {
  question: TriviaQuestion;
  answers: Map<string, TriviaAnswer>;
  startTime: number;
}

export class FakeTriviaGame extends BaseGame {
  readonly gameType = 'fake-trivia' as const;
  readonly displayName = 'Real or Fake?';

  private questions: TriviaQuestion[] = [];
  private currentQuestionIndex = 0;
  private currentRound: QuestionRound | null = null;
  private questionTimer: NodeJS.Timeout | null = null;
  private waitingForAnswers = false;

  protected async onStart(): Promise<void> {
    this.questions = this.selectQuestions(QUESTIONS_PER_ROUND);
  }

  protected async onPlayStart(): Promise<void> {
    // Override timer — we handle question-by-question instead
    this.clearTimers();
    await this.runAllQuestions();
  }

  private async runAllQuestions(): Promise<void> {
    for (let i = 0; i < this.questions.length; i++) {
      if (!this.isRunning) break;

      this.currentQuestionIndex = i;
      this.currentRound = {
        question: this.questions[i],
        answers: new Map(),
        startTime: Date.now(),
      };
      this.waitingForAnswers = true;
      this.timeRemaining = SECONDS_PER_QUESTION;

      this.broadcastState();

      // Wait for question time
      await this.runQuestionTimer();

      // Show results for this question
      this.waitingForAnswers = false;
      this.scoreQuestion();
      this.broadcastState();

      // Pause between questions
      await this.sleep(3000);
    }

    // All questions done
    this.isRunning = false;
    this.phase = 'results';
    this.timeRemaining = 0;
    this.broadcastState();
    const results = this.buildResults();
    this.io.to(this.config.roomId).emit('game:end', results);
    this.emit('ended', results);
  }

  private runQuestionTimer(): Promise<void> {
    return new Promise((resolve) => {
      this.questionTimer = setInterval(() => {
        this.timeRemaining--;

        if (this.timeRemaining % 5 === 0 || this.timeRemaining <= 3) {
          this.broadcastState();
        }

        if (this.timeRemaining <= 0 || !this.waitingForAnswers) {
          if (this.questionTimer) clearInterval(this.questionTimer);
          resolve();
        }
      }, 1000);
    });
  }

  protected onInput(
    playerId: string,
    input: { type: string; payload: Record<string, unknown> }
  ): void {
    if (input.type !== 'trivia_answer') return;
    if (!this.currentRound || !this.waitingForAnswers) return;
    if (this.currentRound.answers.has(playerId)) return; // no re-answers

    const answer = input.payload.answer as 'real' | 'fake';
    const timeMs = input.payload.timeMs as number || 0;

    this.currentRound.answers.set(playerId, {
      playerId,
      answer,
      timeMs,
    });

    // If all players answered, move on
    const allAnswered = this.config.playerIds.every((id) =>
      this.currentRound!.answers.has(id)
    );
    if (allAnswered) {
      this.waitingForAnswers = false; // triggers timer resolve
    }
  }

  protected onTick(_remaining: number): void {
    // handled by runQuestionTimer
  }

  private scoreQuestion(): void {
    if (!this.currentRound) return;

    const { question, answers } = this.currentRound;

    for (const [playerId, answer] of answers.entries()) {
      const isCorrect = answer.answer === question.type;

      if (isCorrect) {
        // Speed bonus: faster = more points (max 1000, min 200)
        const timeRatio = Math.max(0, 1 - answer.timeMs / (SECONDS_PER_QUESTION * 1000));
        const points = Math.round(200 + 800 * timeRatio);

        answer.correct = true;
        answer.points = points;
        this.addScore(playerId, points);
      } else {
        answer.correct = false;
        answer.points = 0;
      }
    }
  }

  protected getGameData(): FakeTriviaData {
    const round = this.currentRound;

    const playerAnswers: Record<string, TriviaAnswer | null> = {};
    for (const id of this.config.playerIds) {
      playerAnswers[id] = round?.answers.get(id) ?? null;
    }

    return {
      question: round?.question ?? this.questions[0],
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: QUESTIONS_PER_ROUND,
      playerAnswers,
      showResults: !this.waitingForAnswers,
      correctAnswer: !this.waitingForAnswers ? round?.question.type : undefined,
    };
  }

  protected buildResults(): GameResults {
    const leaderboard = this.getLeaderboard();

    const resultPlayers: PlayerResult[] = leaderboard.map((entry, idx) => ({
      playerId: entry.playerId,
      username: '',
      avatar: '',
      color: '',
      roundScore: entry.score,
      totalScore: this.totalScores[entry.playerId] ?? 0,
      rank: idx + 1,
      stats: {
        correctAnswers: this.countCorrectAnswers(entry.playerId),
        totalQuestions: QUESTIONS_PER_ROUND,
      },
    }));

    const highlights: string[] = [];
    const perfectPlayer = resultPlayers.find(
      (p) => p.stats.correctAnswers === QUESTIONS_PER_ROUND
    );
    if (perfectPlayer) highlights.push(`🎯 Perfect score! All ${QUESTIONS_PER_ROUND} correct!`);

    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: leaderboard[0]?.playerId ?? '',
      highlights,
    };
  }

  private countCorrectAnswers(playerId: string): number {
    // We'd track this per-round; simplified here
    return Math.round((this.scores[playerId] ?? 0) / 600); // approximate
  }

  private selectQuestions(count: number): TriviaQuestion[] {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    // Ensure mix of real and fake
    const real = shuffled.filter((q) => q.type === 'real').slice(0, Math.ceil(count / 2));
    const fake = shuffled.filter((q) => q.type === 'fake').slice(0, Math.floor(count / 2) + 1);
    return [...real, ...fake].sort(() => Math.random() - 0.5).slice(0, count);
  }
}
