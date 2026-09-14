import { birds, modes, type Bird, type Mode } from './data';

export type Progress = {
  level: number;
  nextReview: number | null;
  lastCorrectDay: string | null;
  seenMedia: string[];
  attempts: number;
  correct: number;
  confusions: Record<string, number>;
};
export type Attempt = {
  id: string;
  sessionId?: string;
  birdId: string;
  mode: Mode;
  mediaId: string | null;
  difficulty: number;
  selectedBirdId: string | null;
  correct: boolean;
  skipped: boolean;
  at: number;
};
export type SessionQuestion = {
  id: string;
  bird: Bird;
  mode: Mode;
  difficulty: number;
  options: Bird[];
  soundId: string | null;
  imageId: string | null;
  optionImageIds: Record<string, string>;
  answered?: boolean;
  selectedId?: string;
  skipped?: boolean;
};
export type Session = {
  id: string;
  questions: SessionQuestion[];
  index: number;
  score: number;
  startedAt: number;
};
export type PracticeLength = 3 | 10;
export type SessionOptions = {
  now?: number;
  random?: () => number;
  questionCount?: PracticeLength;
};

export const emptyProgress = (): Progress => ({
  level: 0,
  nextReview: null,
  lastCorrectDay: null,
  seenMedia: [],
  attempts: 0,
  correct: 0,
  confusions: {}
});
const day = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayMs = 86400000;
const reviewDays = [0, 1, 3, 7, 14, 30];
const activeBirds = birds.filter((bird) => bird.active);
const isSoundMode = (mode: Mode) => mode.startsWith('sound-');

export type BirdInsight = {
  bird: Bird;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  level: number;
  progressPercent: number;
  nextReview: number | null;
  confusions: Array<{ birdId: string; count: number }>;
};

type BirdLearning = {
  attempts: number;
  correct: number;
  level: number;
  confusions: Record<string, number>;
};

const minimumConfusionEvidence = 2;

function emptyBirdLearning(): BirdLearning {
  return { attempts: 0, correct: 0, level: 0, confusions: {} };
}

function birdLearning(
  progress: Record<string, Progress>,
  attempts: Attempt[]
): Map<string, BirdLearning> {
  const result = new Map<string, BirdLearning>();
  for (const bird of activeBirds) result.set(bird.id, emptyBirdLearning());

  for (const [key, value] of Object.entries(progress)) {
    const birdId = key.slice(0, key.indexOf(':'));
    const profile = result.get(birdId);
    if (!profile) continue;
    profile.level += value.level ?? 0;
    if (!attempts.length) {
      for (const [confusedBirdId, count] of Object.entries(value.confusions ?? {})) {
        profile.confusions[confusedBirdId] = Math.max(
          profile.confusions[confusedBirdId] ?? 0,
          count
        );
      }
    }
  }

  if (attempts.length) {
    for (const attempt of attempts) {
      const profile = result.get(attempt.birdId);
      if (!profile) continue;
      profile.attempts += 1;
      profile.correct += attempt.correct ? 1 : 0;
      if (attempt.selectedBirdId && attempt.selectedBirdId !== attempt.birdId) {
        profile.confusions[attempt.selectedBirdId] =
          (profile.confusions[attempt.selectedBirdId] ?? 0) + 1;
      }
    }
  } else {
    for (const [key, value] of Object.entries(progress)) {
      const birdId = key.slice(0, key.indexOf(':'));
      const profile = result.get(birdId);
      if (!profile) continue;
      profile.attempts += value.attempts ?? 0;
      profile.correct += value.correct ?? 0;
    }
  }

  return result;
}

export function summarizeBirdProgress(
  progress: Record<string, Progress>,
  attempts: Attempt[] = []
): BirdInsight[] {
  const learning = birdLearning(progress, attempts);
  const nextReviews = new Map<string, number | null>();
  for (const bird of activeBirds) nextReviews.set(bird.id, null);
  for (const [key, value] of Object.entries(progress)) {
    const birdId = key.slice(0, key.indexOf(':'));
    if (!nextReviews.has(birdId) || value.nextReview === null) continue;
    const current = nextReviews.get(birdId);
    nextReviews.set(
      birdId,
      current === null || current === undefined
        ? value.nextReview
        : Math.min(current, value.nextReview)
    );
  }

  return activeBirds.map((bird) => {
    const profile = learning.get(bird.id) ?? emptyBirdLearning();
    const confusions = Object.entries(profile.confusions)
      .filter(([birdId, count]) => birdId !== bird.id && count >= minimumConfusionEvidence)
      .sort(([, a], [, b]) => b - a)
      .map(([birdId, count]) => ({ birdId, count }));
    const accuracy = profile.attempts ? Math.round((profile.correct / profile.attempts) * 100) : 0;
    const progressPercent = Math.round((profile.level / (modes.length * 5)) * 100);
    return {
      bird,
      attempts: profile.attempts,
      correct: profile.correct,
      incorrect: Math.max(0, profile.attempts - profile.correct),
      accuracy,
      level: profile.level,
      progressPercent,
      nextReview: nextReviews.get(bird.id) ?? null,
      confusions
    };
  });
}

function readyForConfusions(profile: BirdLearning): boolean {
  return profile.attempts >= 4 && profile.correct / profile.attempts >= 0.75;
}

export function progressKey(birdId: string, mode: Mode) {
  return `${birdId}:${mode}`;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedChoice<T>(items: T[], weight: (item: T) => number, random: () => number): T {
  const weights = items.map((item) => Math.max(0.001, weight(item)));
  const total = weights.reduce((sum, item) => sum + item, 0);
  let cursor = random() * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

type AttemptSession = { order: number; birdIds: Set<string> };

function attemptSessions(attempts: Attempt[]): AttemptSession[] {
  const grouped = new Map<string, AttemptSession>();
  attempts.forEach((attempt, index) => {
    // Older backups have no session id. Grouping those attempts in threes gives
    // the cooldown a sensible approximation without invalidating the backup.
    const key = attempt.sessionId ?? `legacy-${Math.floor(index / 3)}`;
    const session = grouped.get(key) ?? { order: index, birdIds: new Set<string>() };
    session.order = index;
    session.birdIds.add(attempt.birdId);
    grouped.set(key, session);
  });
  return [...grouped.values()].sort((a, b) => a.order - b.order);
}

function lastBy(attempts: Attempt[], keyFor: (attempt: Attempt) => string): Map<string, Attempt> {
  const result = new Map<string, Attempt>();
  for (const attempt of attempts) result.set(keyFor(attempt), attempt);
  return result;
}

type PairCandidate = {
  bird: Bird;
  mode: Mode;
  progress: Progress;
  last: Attempt | undefined;
  due: boolean;
  missed: boolean;
  errorRate: number;
  birdAttempts: number;
  sessionsSinceBirdSeen: number;
  modeBalance: number;
  learning: BirdLearning;
};

type SessionRole = 'review' | 'coverage' | 'variety';
type Category = 'sound' | 'visual';
type SessionSlot = { role: SessionRole; category: Category };

function categoryFor(mode: Mode): Category {
  return isSoundMode(mode) ? 'sound' : 'visual';
}

function sessionCandidateData(
  progress: Record<string, Progress>,
  attempts: Attempt[],
  selectedModes: Mode[],
  now: number
) {
  const lastPair = lastBy(attempts, (attempt) => progressKey(attempt.birdId, attempt.mode));
  const sessions = attemptSessions(attempts);
  const recentSessions = sessions.slice(-2);
  const lastBirdSession = new Map<string, number>();
  sessions.forEach((session, index) =>
    session.birdIds.forEach((birdId) => lastBirdSession.set(birdId, index))
  );
  const recentModeCounts = new Map<Mode, number>();
  for (const attempt of attempts.slice(-12))
    recentModeCounts.set(attempt.mode, (recentModeCounts.get(attempt.mode) ?? 0) + 1);
  const modesByCategory = new Map<Category, Mode[]>([
    ['sound', selectedModes.filter((mode) => categoryFor(mode) === 'sound')],
    ['visual', selectedModes.filter((mode) => categoryFor(mode) === 'visual')]
  ]);
  const maxModeCount = new Map<Category, number>();
  for (const [category, categoryModes] of modesByCategory) {
    maxModeCount.set(
      category,
      Math.max(0, ...categoryModes.map((mode) => recentModeCounts.get(mode) ?? 0))
    );
  }

  const learning = birdLearning(progress, attempts);

  const candidates: PairCandidate[] = [];
  for (const bird of activeBirds) {
    for (const mode of selectedModes) {
      if (isSoundMode(mode) && !bird.sounds.some((sound) => sound.url)) continue;
      const p = progress[progressKey(bird.id, mode)] ?? emptyProgress();
      const last = lastPair.get(progressKey(bird.id, mode));
      const due = p.nextReview !== null && p.nextReview <= now;
      const missed = Boolean(last && (!last.correct || last.skipped));
      const errorRate = p.attempts ? Math.max(0, p.attempts - p.correct) / p.attempts : 0;
      const lastSeenIndex = lastBirdSession.get(bird.id);
      candidates.push({
        bird,
        mode,
        progress: p,
        last,
        due,
        missed,
        errorRate,
        birdAttempts: learning.get(bird.id)?.attempts ?? 0,
        sessionsSinceBirdSeen:
          lastSeenIndex === undefined ? 7 : Math.min(7, sessions.length - 1 - lastSeenIndex),
        modeBalance:
          1 +
          Math.min(
            3,
            Math.max(
              0,
              (maxModeCount.get(categoryFor(mode)) ?? 0) - (recentModeCounts.get(mode) ?? 0)
            )
          ),
        learning: learning.get(bird.id) ?? emptyBirdLearning()
      });
    }
  }
  return { candidates, recentSessions };
}

function reviewWeight(candidate: PairCandidate, now: number): number {
  const overdueDays =
    candidate.due && candidate.progress.nextReview !== null
      ? Math.max(0, (now - candidate.progress.nextReview) / dayMs)
      : 0;
  return (
    1 +
    (candidate.missed ? 6 : 0) +
    (candidate.due ? 4 : 0) +
    Math.min(3, overdueDays / 7) +
    candidate.errorRate * 3
  );
}

function cooldownDistance(birdId: string, recentSessions: AttemptSession[]): number {
  for (let i = recentSessions.length - 1; i >= 0; i--) {
    if (recentSessions[i].birdIds.has(birdId)) return recentSessions.length - i;
  }
  return 0;
}

function withCooldown(
  candidates: PairCandidate[],
  recentSessions: AttemptSession[]
): PairCandidate[] {
  const fresh = candidates.filter(
    (candidate) => cooldownDistance(candidate.bird.id, recentSessions) === 0
  );
  if (fresh.length) return fresh;
  const olderOnly = candidates.filter(
    (candidate) => cooldownDistance(candidate.bird.id, recentSessions) <= 1
  );
  return olderOnly.length ? olderOnly : candidates;
}

function candidatesForRole(
  role: SessionRole,
  candidates: PairCandidate[],
  recentSessions: AttemptSession[],
  selectedBirdIds: Set<string>
): PairCandidate[] {
  const available = candidates.filter((candidate) => !selectedBirdIds.has(candidate.bird.id));
  if (!available.length) return [];

  if (role === 'review') {
    const urgent = available.filter((candidate) => candidate.due || candidate.missed);
    if (urgent.length) return urgent;
    const fresh = withCooldown(available, recentSessions);
    const lowestLevel = Math.min(...fresh.map((candidate) => candidate.progress.level));
    return fresh.filter((candidate) => candidate.progress.level <= lowestLevel + 1);
  }

  const fresh = withCooldown(available, recentSessions);
  if (role === 'coverage') {
    const unseenBirds = fresh.filter((candidate) => candidate.birdAttempts === 0);
    if (unseenBirds.length) return unseenBirds;
    const unseenPairs = fresh.filter((candidate) => candidate.progress.attempts === 0);
    if (unseenPairs.length) return unseenPairs;
    const lowestAttempts = Math.min(...fresh.map((candidate) => candidate.progress.attempts));
    return fresh.filter((candidate) => candidate.progress.attempts <= lowestAttempts + 1);
  }
  return fresh;
}

function candidateWeight(role: SessionRole, candidate: PairCandidate, now: number): number {
  if (role === 'review') return reviewWeight(candidate, now) * candidate.modeBalance;
  if (role === 'coverage') {
    const coverage =
      candidate.birdAttempts === 0
        ? 6
        : candidate.progress.attempts === 0
          ? 4
          : 1 / (1 + candidate.progress.attempts);
    return (coverage + Math.min(6, candidate.sessionsSinceBirdSeen)) * candidate.modeBalance;
  }
  return (1 + Math.min(6, candidate.sessionsSinceBirdSeen)) * candidate.modeBalance;
}

function chooseSound(
  bird: Bird,
  progress: Record<string, Progress>,
  attempts: Attempt[],
  random: () => number
) {
  const sounds = bird.sounds.filter((sound) => sound.url);
  if (!sounds.length) return bird.sounds[0] ?? null;
  const heard = new Set<string>();
  for (const attempt of attempts)
    if (attempt.birdId === bird.id && isSoundMode(attempt.mode) && attempt.mediaId)
      heard.add(attempt.mediaId);
  for (const [key, value] of Object.entries(progress)) {
    if (key.startsWith(`${bird.id}:sound-`))
      value.seenMedia.forEach((mediaId) => heard.add(mediaId));
  }
  const unseen = sounds.filter((sound) => !heard.has(sound.id));
  if (unseen.length) return unseen[Math.floor(random() * unseen.length)];
  const recentMedia = attempts
    .filter((attempt) => attempt.birdId === bird.id && isSoundMode(attempt.mode) && attempt.mediaId)
    .sort((a, b) => b.at - a.at)[0]?.mediaId;
  const alternatives =
    sounds.length > 1 && recentMedia ? sounds.filter((sound) => sound.id !== recentMedia) : sounds;
  return alternatives[Math.floor(random() * alternatives.length)];
}

export function chooseImage(bird: Bird, random: () => number) {
  const images = bird.images.filter((image) => image.url);
  if (!images.length) return null;
  return images[Math.floor(random() * images.length)];
}

function availableOptions(
  target: Bird,
  difficulty: number,
  learning: BirdLearning,
  blockedIds: Set<string>,
  usedDistractorIds: Set<string>,
  random: () => number
): Bird[] {
  const candidates = activeBirds.filter(
    (bird) => bird.id !== target.id && !blockedIds.has(bird.id)
  );
  const knownConfusionIds = new Set(
    Object.entries(learning.confusions)
      .filter(([, count]) => count >= minimumConfusionEvidence)
      .map(([birdId]) => birdId)
  );
  const showConfusions = readyForConfusions(learning);
  const distractorCandidates =
    knownConfusionIds.size && !showConfusions
      ? candidates.filter((bird) => !knownConfusionIds.has(bird.id))
      : candidates;
  const options = [target];
  const confusionIds = Object.entries(learning.confusions)
    .filter(([birdId]) => candidates.some((bird) => bird.id === birdId))
    .sort(([, a], [, b]) => b - a)
    .map(([birdId]) => birdId);
  const topConfusion =
    showConfusions && confusionIds[0]
      ? candidates.find((bird) => bird.id === confusionIds[0])
      : undefined;
  if (topConfusion) options.push(topConfusion);

  const fill = () => {
    const unused = distractorCandidates.filter(
      (bird) => !options.some((option) => option.id === bird.id) && !usedDistractorIds.has(bird.id)
    );
    const pool = unused.length
      ? unused
      : distractorCandidates.filter((bird) => !options.some((option) => option.id === bird.id));
    if (!pool.length) return;
    options.push(pool[Math.floor(random() * pool.length)]);
  };
  while (options.length < Math.min(4, activeBirds.length)) fill();
  // Difficulty is retained in the selector signature so future catalogue
  // similarity tiers can use it without changing session wiring.
  void difficulty;
  options.slice(1).forEach((option) => usedDistractorIds.add(option.id));
  return shuffle(options, random);
}

function slotsFor(
  selectedModes: Mode[],
  candidates: PairCandidate[],
  now: number,
  random: () => number,
  questionCount: PracticeLength
): SessionSlot[] {
  const soundEnabled = selectedModes.some(isSoundMode);
  const visualEnabled = selectedModes.some((mode) => !isSoundMode(mode));
  const roles: SessionRole[] = shuffle(['review', 'coverage', 'variety'], random);
  if (!soundEnabled || !visualEnabled)
    return Array.from({ length: questionCount }, (_, index) => ({
      role: roles[index % roles.length],
      category: soundEnabled ? 'sound' : 'visual'
    }));

  const urgent = candidates.filter((candidate) => candidate.due || candidate.missed);
  let reviewCategory: Category | null = null;
  if (urgent.length) {
    const categoryScores = (['sound', 'visual'] as Category[]).map((category) =>
      urgent
        .filter((candidate) => categoryFor(candidate.mode) === category)
        .reduce((sum, candidate) => sum + reviewWeight(candidate, now), 0)
    );
    if (categoryScores[0] === categoryScores[1])
      reviewCategory = random() < 0.5 ? 'sound' : 'visual';
    else reviewCategory = categoryScores[0] > categoryScores[1] ? 'sound' : 'visual';
  }

  const categoriesByRole = new Map<SessionRole, Category>();
  if (reviewCategory) {
    categoriesByRole.set('review', reviewCategory);
    const remainingRoles = roles.filter((role) => role !== 'review');
    const remainingCategories: Category[] =
      reviewCategory === 'sound' ? ['sound', 'visual'] : ['sound', 'sound'];
    shuffle(remainingCategories, random).forEach((category, index) =>
      categoriesByRole.set(remainingRoles[index], category)
    );
  } else {
    shuffle<Category>(['sound', 'sound', 'visual'], random).forEach((category, index) =>
      categoriesByRole.set(roles[index], category)
    );
  }
  const firstCycle = roles.map((role) => categoriesByRole.get(role) as Category);
  const additionalCycle: Category[] = ['sound', 'sound', 'visual'];
  return Array.from({ length: questionCount }, (_, index) => {
    const role = roles[index % roles.length];
    const category =
      index < firstCycle.length
        ? firstCycle[index]
        : additionalCycle[(index - firstCycle.length) % additionalCycle.length];
    return { role, category };
  });
}

export function createSession(
  progress: Record<string, Progress>,
  attempts: Attempt[] = [],
  selectedModes: Mode[] = modes,
  options: SessionOptions = {}
): Session {
  const now = options.now ?? Date.now();
  const random = options.random ?? Math.random;
  const questionCount = options.questionCount ?? 3;
  const modeOrder = selectedModes.length ? selectedModes : modes;
  const sessionId = crypto.randomUUID();
  const { candidates, recentSessions } = sessionCandidateData(progress, attempts, modeOrder, now);
  const slots = slotsFor(modeOrder, candidates, now, random, questionCount);
  const selectedBirdIds = new Set<string>();
  const selectedPairs: Array<{ candidate: PairCandidate; soundId: string | null }> = [];
  const soundBirdIds = new Set(
    candidates
      .filter((candidate) => categoryFor(candidate.mode) === 'sound')
      .map((candidate) => candidate.bird.id)
  );

  const addCandidate = (candidate: PairCandidate) => {
    selectedBirdIds.add(candidate.bird.id);
    const sound = isSoundMode(candidate.mode)
      ? chooseSound(candidate.bird, progress, attempts, random)
      : null;
    selectedPairs.push({ candidate, soundId: sound?.id ?? null });
  };

  for (const [slotIndex, slot] of slots.entries()) {
    let slotPool = candidates.filter((candidate) => categoryFor(candidate.mode) === slot.category);
    if (slot.category === 'visual' && soundBirdIds.size) {
      const futureSoundSlots = slots
        .slice(slotIndex + 1)
        .filter((futureSlot) => futureSlot.category === 'sound').length;
      const availableSoundBirds = new Set(
        [...soundBirdIds].filter((birdId) => !selectedBirdIds.has(birdId))
      );
      const visualOnly = slotPool.filter((candidate) => !soundBirdIds.has(candidate.bird.id));
      if (availableSoundBirds.size <= futureSoundSlots && visualOnly.length) slotPool = visualOnly;
    }
    const slotCandidates = candidatesForRole(slot.role, slotPool, recentSessions, selectedBirdIds);
    if (slotCandidates.length) {
      addCandidate(
        weightedChoice(slotCandidates, (item) => candidateWeight(slot.role, item, now), random)
      );
      continue;
    }

    // If a category has fewer unique birds than the requested round, reuse a
    // candidate from that category so the session length and selected mode mix
    // remain stable.
    const repeatCandidates = candidates.filter(
      (candidate) => categoryFor(candidate.mode) === slot.category
    );
    if (repeatCandidates.length)
      addCandidate(
        weightedChoice(repeatCandidates, (item) => candidateWeight(slot.role, item, now), random)
      );
  }

  // A narrow media set or a custom mode selection should never produce an
  // empty round. Fill any unavailable role from the broadest remaining pool.
  while (selectedPairs.length < questionCount) {
    const fallback = candidates.filter((candidate) => !selectedBirdIds.has(candidate.bird.id));
    if (!fallback.length) break;
    const candidate = weightedChoice(
      fallback,
      (item) => candidateWeight('variety', item, now),
      random
    );
    addCandidate(candidate);
  }

  const usedDistractorIds = new Set<string>();
  const blockedIds = new Set(selectedPairs.map(({ candidate }) => candidate.bird.id));
  const questions = shuffle(selectedPairs, random).map(({ candidate, soundId }) => {
    const p = candidate.progress;
    const options = availableOptions(
      candidate.bird,
      Math.min(5, p.level),
      candidate.learning,
      blockedIds,
      usedDistractorIds,
      random
    );
    const image = chooseImage(candidate.bird, random);
    const optionImageIds: Record<string, string> = {};
    if (candidate.mode.endsWith('photo')) {
      for (const option of options) {
        const optionImage = option.id === candidate.bird.id ? image : chooseImage(option, random);
        if (optionImage) optionImageIds[option.id] = optionImage.id;
      }
    }
    return {
      id: crypto.randomUUID(),
      bird: candidate.bird,
      mode: candidate.mode,
      difficulty: Math.min(5, p.level),
      options,
      soundId,
      imageId: image?.id ?? null,
      optionImageIds
    };
  });
  return { id: sessionId, questions, index: 0, score: 0, startedAt: now };
}

export function recordAnswer(
  progress: Record<string, Progress>,
  attempt: Attempt
): Record<string, Progress> {
  const key = progressKey(attempt.birdId, attempt.mode);
  const old = progress[key] ?? emptyProgress();
  const next: Progress = {
    ...old,
    attempts: old.attempts + 1,
    correct: old.correct + (attempt.correct ? 1 : 0),
    confusions: { ...old.confusions }
  };
  if (attempt.mediaId && !next.seenMedia.includes(attempt.mediaId))
    next.seenMedia = [...next.seenMedia, attempt.mediaId];
  if (attempt.selectedBirdId && attempt.selectedBirdId !== attempt.birdId)
    next.confusions[attempt.selectedBirdId] = (next.confusions[attempt.selectedBirdId] ?? 0) + 1;
  if (!attempt.skipped && attempt.correct) {
    const today = day(attempt.at);
    if (old.lastCorrectDay !== today) {
      next.level = Math.min(5, old.level + 1);
      next.lastCorrectDay = today;
    }
    next.nextReview = attempt.at + reviewDays[next.level] * dayMs;
  } else {
    next.level = 0;
    next.nextReview = attempt.at;
  }
  return { ...progress, [key]: next };
}
