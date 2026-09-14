import { modes, type Mode } from '$lib/data';
import {
  createSession,
  recordAnswer,
  summarizeBirdProgress,
  type Attempt,
  type PracticeLength,
  type Session,
  type SessionQuestion
} from '$lib/engine';
import { loadSnapshot, saveSnapshot, type PersistedSnapshot } from '$lib/persistence/indexed-db';

type ControllerStatus = 'loading' | 'ready' | 'error';

type LearningState = Omit<PersistedSnapshot, 'schemaVersion'>;

export type StartPracticeResult =
  { ok: true } | { ok: false; reason: 'not-ready' | 'active-session' };

const initialLearningState = (): LearningState => ({
  progress: {},
  attempts: [],
  preferences: { modes: [...modes] }
});

export class AppController {
  status = $state<ControllerStatus>('loading');
  storageError = $state<string | null>(null);
  learning = $state<LearningState>(initialLearningState());
  session = $state<Session | null>(null);

  private saveQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  get selectedModes() {
    return this.learning.preferences.modes;
  }

  get currentQuestion(): SessionQuestion | undefined {
    return this.session?.questions[this.session.index];
  }

  get answered() {
    return Boolean(this.currentQuestion?.answered || this.currentQuestion?.skipped);
  }

  get sessionDone() {
    return Boolean(this.session && this.session.index >= this.session.questions.length);
  }

  get score() {
    return this.session?.score ?? 0;
  }

  get sessionLength() {
    return this.session?.questions.length ?? 3;
  }

  get birdInsights() {
    return summarizeBirdProgress(this.learning.progress, this.learning.attempts);
  }

  get totals() {
    return this.birdInsights.reduce(
      (summary, insight) => ({
        practices: summary.practices + insight.attempts,
        correct: summary.correct + insight.correct,
        incorrect: summary.incorrect + insight.incorrect
      }),
      { practices: 0, correct: 0, incorrect: 0 }
    );
  }

  get accuracy() {
    const { practices, correct } = this.totals;
    return practices ? Math.round((correct / practices) * 100) : 0;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const saved = await loadSnapshot();
      this.learning = {
        progress: saved.progress,
        attempts: saved.attempts,
        preferences: saved.preferences
      };
      this.status = 'ready';
    } catch {
      this.status = 'error';
      this.storageError = 'Browser storage is unavailable; progress will only last for this visit.';
      this.status = 'ready';
    }
  }

  setModes(nextModes: Mode[]) {
    if (this.status !== 'ready') return;
    const validModes = nextModes.filter((mode) => modes.includes(mode));
    if (nextModes.length > 0 && !validModes.length) return;
    const uniqueModes = validModes.filter((mode, index) => validModes.indexOf(mode) === index);
    this.learning = {
      ...this.learning,
      preferences: { modes: uniqueModes }
    };
    this.persist();
  }

  toggleMode(mode: Mode, checked: boolean) {
    const nextModes = checked
      ? [...this.selectedModes, mode]
      : this.selectedModes.filter((selected) => selected !== mode);
    this.setModes(nextModes);
  }

  startPractice(length: PracticeLength = 3): StartPracticeResult {
    if (this.status !== 'ready') return { ok: false, reason: 'not-ready' };
    if (this.session && !this.sessionDone) return { ok: false, reason: 'active-session' };
    this.session = createSession(
      this.learning.progress,
      this.learning.attempts,
      this.selectedModes,
      { questionCount: length }
    );
    return { ok: true };
  }

  answer(optionId: string) {
    const question = this.currentQuestion;
    const session = this.session;
    if (!question || !session || this.answered || this.sessionDone) return;

    const correct = optionId === question.bird.id;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      birdId: question.bird.id,
      mode: question.mode,
      mediaId: question.soundId,
      difficulty: question.difficulty,
      selectedBirdId: optionId,
      correct,
      skipped: false,
      at: Date.now()
    };
    const nextProgress = recordAnswer(this.learning.progress, attempt);
    const questions = session.questions.map((item) =>
      item.id === question.id ? { ...item, answered: true, selectedId: optionId } : item
    );
    this.learning = {
      ...this.learning,
      progress: nextProgress,
      attempts: [...this.learning.attempts, attempt]
    };
    this.session = { ...session, questions, score: session.score + (correct ? 1 : 0) };
    this.persist();
  }

  skip() {
    const question = this.currentQuestion;
    const session = this.session;
    if (!question || !session || this.answered || this.sessionDone) return;

    const attempt: Attempt = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      birdId: question.bird.id,
      mode: question.mode,
      mediaId: question.soundId,
      difficulty: question.difficulty,
      selectedBirdId: null,
      correct: false,
      skipped: true,
      at: Date.now()
    };
    const nextProgress = recordAnswer(this.learning.progress, attempt);
    const questions = session.questions.map((item) =>
      item.id === question.id ? { ...item, skipped: true } : item
    );
    this.learning = {
      ...this.learning,
      progress: nextProgress,
      attempts: [...this.learning.attempts, attempt]
    };
    this.session = { ...session, questions };
    this.persist();
  }

  nextQuestion() {
    if (!this.session || !this.answered) return;
    this.session = { ...this.session, index: this.session.index + 1 };
  }

  abandonPractice() {
    this.session = null;
  }

  closeResults() {
    this.session = null;
  }

  resetProgress() {
    this.learning = {
      progress: {},
      attempts: [],
      preferences: { modes: [...this.selectedModes] }
    };
    this.session = null;
    this.persist();
  }

  private persist() {
    const snapshot: PersistedSnapshot = {
      schemaVersion: 2,
      progress: this.learning.progress,
      attempts: this.learning.attempts,
      preferences: this.learning.preferences
    };
    this.saveQueue = this.saveQueue
      .then(() => saveSnapshot(snapshot))
      .catch(() => {
        this.storageError =
          'Progress could not be saved in this browser. You can keep practising temporarily.';
      });
  }
}
