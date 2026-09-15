import { describe, expect, it } from 'vitest';
import { birds, modes, type Bird, type BirdImage, type Mode } from './data';
import {
  chooseImage,
  createSession,
  emptyProgress,
  recordAnswer,
  summarizeBirdProgress,
  type Attempt,
  type Progress
} from './engine';

const now = Date.UTC(2026, 0, 15, 12);

function image(id: string, url = `/media/photos/${id}.jpg`): BirdImage {
  return {
    id,
    url,
    title: `${id}.jpg`,
    imageUrl: `https://example.com/${id}.jpg`,
    sourceUrl: `https://example.com/${id}`,
    creator: 'Test creator',
    creatorUrl: 'https://example.com/creator',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    dimensions: '100x100',
    identityNote: 'Test image'
  };
}

function birdWithImages(images: BirdImage[]): Bird {
  const first = images[0];
  return {
    id: 'test-bird',
    name: 'Test bird',
    scientificName: 'Testus avis',
    images,
    photoUrl: first?.url ?? '',
    photoCredit: {
      photographer: first?.creator ?? '',
      photographerUrl: first?.creatorUrl ?? '',
      source: first?.title ?? '',
      sourceUrl: first?.sourceUrl ?? '',
      license: first?.license ?? '',
      licenseUrl: first?.licenseUrl ?? ''
    },
    active: true,
    sounds: []
  };
}

function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function attempt(
  birdId: string,
  mode: Mode,
  sessionId: string,
  at: number,
  correct = true,
  selectedBirdId?: string | null
): Attempt {
  return {
    id: `${sessionId}-${birdId}-${mode}`,
    sessionId,
    birdId,
    mode,
    mediaId: null,
    difficulty: 0,
    selectedBirdId: correct
      ? birdId
      : (selectedBirdId ?? birds.find((bird) => bird.id !== birdId)?.id ?? null),
    correct,
    skipped: false,
    at
  };
}

function skippedAttempt(birdId: string, mode: Mode, sessionId: string, at: number): Attempt {
  return { ...attempt(birdId, mode, sessionId, at, false), selectedBirdId: null, skipped: true };
}

function progressFor(attempts: Attempt[]): Record<string, Progress> {
  return attempts.reduce((progress, item) => recordAnswer(progress, item), {});
}

function emptyProgressForTest(): Progress {
  return emptyProgress();
}

function sessionWithQuestion(
  progress: Record<string, Progress>,
  attempts: Attempt[],
  selectedModes: Mode[],
  predicate: (question: ReturnType<typeof createSession>['questions'][number]) => boolean,
  sessionPredicate: (session: ReturnType<typeof createSession>) => boolean = () => true
) {
  for (let seed = 1; seed < 500; seed += 1) {
    const session = createSession(progress, attempts, selectedModes, {
      now,
      random: randomSource(seed)
    });
    const question = session.questions.find(predicate);
    if (question && sessionPredicate(session)) return question;
  }
  throw new Error('Could not find a deterministic session matching the requested predicate');
}

describe('createSession', () => {
  it('creates three unique targets with the default two-sound, one-visual mix', () => {
    const session = createSession({}, [], modes, { now, random: randomSource(1) });
    const targetIds = session.questions.map((question) => question.bird.id);
    const soundCount = session.questions.filter((question) =>
      question.mode.startsWith('sound-')
    ).length;

    expect(session.questions).toHaveLength(3);
    expect(new Set(targetIds).size).toBe(3);
    expect(soundCount).toBe(2);
  });

  it('creates ten unique targets with the same sound-heavy mix', () => {
    const session = createSession({}, [], modes, {
      now,
      random: randomSource(11),
      questionCount: 10
    });
    const targetIds = session.questions.map((question) => question.bird.id);
    const soundCount = session.questions.filter((question) =>
      question.mode.startsWith('sound-')
    ).length;
    expect(session.questions).toHaveLength(10);
    expect(new Set(targetIds).size).toBe(10);
    expect(soundCount).toBe(7);
  });

  it('keeps a ten-question session in the selected category', () => {
    const soundSession = createSession({}, [], ['sound-photo'], {
      now,
      random: randomSource(12),
      questionCount: 10
    });
    const photoSession = createSession({}, [], ['photo-name'], {
      now,
      random: randomSource(13),
      questionCount: 10
    });

    expect(soundSession.questions).toHaveLength(10);
    expect(soundSession.questions.every((question) => question.mode === 'sound-photo')).toBe(true);
    expect(photoSession.questions).toHaveLength(10);
    expect(photoSession.questions.every((question) => question.mode === 'photo-name')).toBe(true);
  });

  it('keeps birds from the last two sessions out when fresh candidates exist', () => {
    const attempts = [
      ...['great-tit', 'blue-tit', 'house-sparrow'].map((birdId, index) =>
        attempt(birdId, modes[index % modes.length], 'session-1', now - 2 * 86400000 + index)
      ),
      ...['robin', 'wren', 'blackbird'].map((birdId, index) =>
        attempt(birdId, modes[index % modes.length], 'session-2', now - 86400000 + index)
      )
    ];
    const session = createSession({}, attempts, modes, { now, random: randomSource(2) });
    const recentBirds = new Set(attempts.map((item) => item.birdId));

    expect(session.questions.every((question) => !recentBirds.has(question.bird.id))).toBe(true);
  });

  it('uses the review slot for a missed recent pair', () => {
    const missed = attempt('great-tit', 'sound-photo', 'session-1', now - 3600000, false);
    const attempts = [
      missed,
      attempt('blue-tit', 'sound-photo', 'session-1', now - 3500000),
      attempt('house-sparrow', 'photo-name', 'session-1', now - 3400000)
    ];
    const progress: Record<string, Progress> = {};
    for (const item of attempts) Object.assign(progress, recordAnswer(progress, item));

    const session = createSession(progress, attempts, modes, { now, random: randomSource(3) });

    expect(
      session.questions.some(
        (question) => question.bird.id === 'great-tit' && question.mode === 'sound-photo'
      )
    ).toBe(true);
  });

  it('covers nine different birds in the first three rounds', () => {
    let progress: Record<string, Progress> = {};
    let attempts: Attempt[] = [];
    const selectedBirds: string[] = [];

    for (let round = 0; round < 3; round++) {
      const session = createSession(progress, attempts, modes, {
        now,
        random: randomSource(10 + round)
      });
      selectedBirds.push(...session.questions.map((question) => question.bird.id));
      for (const question of session.questions) {
        const item = attempt(question.bird.id, question.mode, session.id, now + round);
        attempts = [...attempts, item];
        progress = recordAnswer(progress, item);
      }
    }

    expect(new Set(selectedBirds).size).toBe(9);
  });

  it('summarizes correct, incorrect and repeated confusion by bird', () => {
    const attempts = [
      attempt('great-tit', 'sound-photo', 'history', now - 8 * 86400000, false),
      attempt('great-tit', 'sound-photo', 'history', now - 7 * 86400000, false),
      attempt('great-tit', 'sound-photo', 'history', now - 6 * 86400000),
      attempt('blue-tit', 'sound-photo', 'history', now - 5 * 86400000)
    ];
    let progress: Record<string, Progress> = {};
    for (const item of attempts) progress = recordAnswer(progress, item);

    const greatTit = summarizeBirdProgress(progress, attempts).find(
      (insight) => insight.bird.id === 'great-tit'
    );

    expect(greatTit).toMatchObject({ attempts: 3, correct: 1, incorrect: 2, accuracy: 33 });
    expect(greatTit?.confusions).toEqual([{ birdId: 'blue-tit', count: 2 }]);
  });

  it('keeps a known confusion out while shaky and brings it back after accuracy improves', () => {
    const history = (correctCount: number) => [
      ...Array.from({ length: 2 }, (_, index) =>
        attempt('great-tit', 'sound-photo', 'history', now - (50 - index) * 86400000, false)
      ),
      ...Array.from({ length: correctCount }, (_, index) =>
        attempt('great-tit', 'sound-photo', 'history', now - (48 - index) * 86400000)
      ),
      attempt('wren', 'sound-photo', 'recent-a', now - 2 * 86400000),
      attempt('blackbird', 'sound-photo', 'recent-b', now - 86400000)
    ];
    const sessionWithTarget = (attempts: Attempt[]) => {
      let progress: Record<string, Progress> = {};
      for (const item of attempts) progress = recordAnswer(progress, item);
      for (let seed = 1; seed < 100; seed += 1) {
        const session = createSession(progress, attempts, ['sound-photo'], {
          now,
          random: randomSource(seed)
        });
        const question = session.questions.find((item) => item.bird.id === 'great-tit');
        if (question && !session.questions.some((item) => item.bird.id === 'blue-tit'))
          return question;
      }
      throw new Error('Could not find a deterministic session containing the target pair');
    };

    const shaky = sessionWithTarget(history(2));
    const improving = sessionWithTarget(history(6));

    expect(shaky.options.some((option) => option.id === 'blue-tit')).toBe(false);
    expect(improving.options.some((option) => option.id === 'blue-tit')).toBe(true);
  });
});

describe('chooseImage', () => {
  it('selects from all valid images using the supplied random source', () => {
    const bird = birdWithImages([image('first'), image('second')]);

    expect(chooseImage(bird, () => 0)?.id).toBe('first');
    expect(chooseImage(bird, () => 0.99)?.id).toBe('second');
  });

  it('returns no image when the bird has no usable image', () => {
    expect(chooseImage(birdWithImages([image('missing', '')]), () => 0)).toBeNull();
    expect(chooseImage(birdWithImages([]), () => 0)).toBeNull();
  });
});

describe('question images', () => {
  it('assigns valid images to targets and picture options', () => {
    const session = createSession({}, [], ['sound-photo'], { now, random: randomSource(21) });

    for (const question of session.questions) {
      expect(question.imageId).toBeTruthy();
      expect(question.bird.images.some((image) => image.id === question.imageId)).toBe(true);
      expect(Object.keys(question.optionImageIds).sort()).toEqual(
        question.options.map((option) => option.id).sort()
      );
      for (const option of question.options) {
        expect(option.images.some((image) => image.id === question.optionImageIds[option.id])).toBe(
          true
        );
      }
      expect(question.optionImageIds[question.bird.id]).toBe(question.imageId);
    }
  });

  it('keeps photo-name questions compatible when picture choices are disabled', () => {
    const session = createSession({}, [], ['photo-name'], { now, random: randomSource(22) });

    for (const question of session.questions) {
      expect(question.bird.images.some((image) => image.id === question.imageId)).toBe(true);
      expect(question.optionImageIds).toEqual({});
    }
  });
});

describe('recordAnswer and review scheduling', () => {
  it('advances levels and uses the 1/3/7/14/30-day schedule', () => {
    const times = [
      Date.UTC(2026, 0, 1, 12),
      Date.UTC(2026, 0, 2, 12),
      Date.UTC(2026, 0, 3, 12),
      Date.UTC(2026, 0, 4, 12),
      Date.UTC(2026, 0, 5, 12),
      Date.UTC(2026, 0, 6, 12)
    ];
    let progress: Record<string, Progress> = {};

    times.forEach((at, index) => {
      progress = recordAnswer(progress, attempt('great-tit', 'photo-name', `level-${index}`, at));
      const item = progress['great-tit:photo-name'];
      const expectedDays = [1, 3, 7, 14, 30, 30][index];
      expect(item.level).toBe(Math.min(5, index + 1));
      expect(item.nextReview).toBe(at + expectedDays * 86400000);
    });
  });

  it('does not advance twice on the same UTC day, but reschedules the pair', () => {
    const firstAt = Date.UTC(2026, 0, 1, 9);
    const secondAt = Date.UTC(2026, 0, 1, 18);
    let progress = recordAnswer({}, attempt('great-tit', 'photo-name', 'same-day-1', firstAt));
    progress = recordAnswer(progress, attempt('great-tit', 'photo-name', 'same-day-2', secondAt));

    expect(progress['great-tit:photo-name']).toMatchObject({
      level: 1,
      lastCorrectDay: '2026-01-01',
      nextReview: secondAt + 86400000,
      attempts: 2,
      correct: 2
    });
  });

  it('resets only the failed pair, makes it immediately due, and records directional confusion', () => {
    const firstAt = Date.UTC(2026, 0, 1, 12);
    const failedAt = Date.UTC(2026, 0, 3, 12);
    let progress = recordAnswer({}, attempt('great-tit', 'sound-photo', 'failure-1', firstAt));
    progress = recordAnswer(
      progress,
      attempt('great-tit', 'sound-photo', 'failure-2', failedAt, false, 'blue-tit')
    );
    progress = recordAnswer(progress, attempt('great-tit', 'photo-name', 'other-mode', firstAt));

    expect(progress['great-tit:sound-photo']).toMatchObject({
      level: 0,
      nextReview: failedAt,
      attempts: 2,
      correct: 1,
      confusions: { 'blue-tit': 1 },
      lastCorrectDay: '2026-01-01'
    });
    expect(progress['great-tit:photo-name'].level).toBe(1);
  });

  it('treats a skip like a failure without creating a confusion', () => {
    const skippedAt = Date.UTC(2026, 0, 3, 12);
    const progress = recordAnswer(
      {},
      skippedAttempt('great-tit', 'sound-photo', 'skip-1', skippedAt)
    );

    expect(progress['great-tit:sound-photo']).toMatchObject({
      level: 0,
      nextReview: skippedAt,
      attempts: 1,
      correct: 0,
      confusions: {}
    });
  });

  it('preserves lastCorrectDay across a same-day fail and same-day recovery', () => {
    const firstAt = Date.UTC(2026, 0, 1, 9);
    const failedAt = Date.UTC(2026, 0, 1, 12);
    const recoveredAt = Date.UTC(2026, 0, 1, 18);
    let progress = recordAnswer(
      {},
      attempt('great-tit', 'photo-name', 'same-day-recovery-1', firstAt)
    );
    progress = recordAnswer(
      progress,
      attempt('great-tit', 'photo-name', 'same-day-recovery-2', failedAt, false, 'blue-tit')
    );
    progress = recordAnswer(
      progress,
      attempt('great-tit', 'photo-name', 'same-day-recovery-3', recoveredAt)
    );

    expect(progress['great-tit:photo-name']).toMatchObject({
      level: 0,
      nextReview: recoveredAt,
      lastCorrectDay: '2026-01-01',
      attempts: 3,
      correct: 2
    });
  });

  it('selects an exactly due pair for review even when it was seen recently', () => {
    const previous = Date.UTC(2026, 0, 14, 12);
    const attempts = [attempt('great-tit', 'sound-photo', 'due-session', previous)];
    const progress = progressFor(attempts);
    const question = sessionWithQuestion(
      progress,
      attempts,
      ['sound-photo'],
      (item) => item.bird.id === 'great-tit' && item.mode === 'sound-photo'
    );

    expect(question.bird.id).toBe('great-tit');
    expect(question.mode).toBe('sound-photo');
  });
});

describe('learning summaries and history reconstruction', () => {
  it('aggregates bird progress across modes and exposes the earliest review', () => {
    const progress: Record<string, Progress> = {
      'great-tit:sound-photo': {
        ...emptyProgressForTest(),
        level: 2,
        attempts: 4,
        correct: 3,
        nextReview: now + 4 * 86400000
      },
      'great-tit:photo-name': {
        ...emptyProgressForTest(),
        level: 1,
        attempts: 2,
        correct: 1,
        nextReview: now + 2 * 86400000
      }
    };
    const insight = summarizeBirdProgress(progress).find((item) => item.bird.id === 'great-tit');

    expect(insight).toMatchObject({
      attempts: 6,
      correct: 4,
      incorrect: 2,
      accuracy: 67,
      level: 3,
      nextReview: now + 2 * 86400000
    });
  });

  it('uses the maximum stored confusion count when reconstructing a backup without attempts', () => {
    const progress: Record<string, Progress> = {
      'great-tit:sound-photo': {
        ...emptyProgressForTest(),
        attempts: 2,
        correct: 2,
        confusions: { 'blue-tit': 2 }
      },
      'great-tit:photo-name': {
        ...emptyProgressForTest(),
        attempts: 2,
        correct: 1,
        confusions: { 'blue-tit': 3 }
      }
    };
    const insight = summarizeBirdProgress(progress).find((item) => item.bird.id === 'great-tit');

    expect(insight).toMatchObject({ attempts: 4, correct: 3, accuracy: 75 });
    expect(insight?.confusions).toEqual([{ birdId: 'blue-tit', count: 3 }]);
  });

  it('rebuilds bird-wide attempts and confusions from attempts when both sources exist', () => {
    const attempts = [
      attempt('great-tit', 'sound-photo', 'history', now - 3 * 86400000, false, 'blue-tit'),
      attempt('great-tit', 'photo-name', 'history', now - 2 * 86400000),
      attempt('great-tit', 'photo-name', 'history', now - 86400000, false, 'blue-tit')
    ];
    const progress = {
      ...progressFor(attempts),
      'great-tit:sound-photo': {
        ...progressFor(attempts)['great-tit:sound-photo'],
        attempts: 99,
        correct: 99,
        confusions: { robin: 20 }
      }
    };
    const insight = summarizeBirdProgress(progress, attempts).find(
      (item) => item.bird.id === 'great-tit'
    );

    expect(insight).toMatchObject({ attempts: 3, correct: 1, incorrect: 2, accuracy: 33 });
    expect(insight?.confusions).toEqual([{ birdId: 'blue-tit', count: 2 }]);
  });
});

describe('target roles, cooldown, and mode balance', () => {
  it('uses the visual review category when visual urgency outweighs sound urgency', () => {
    const failed = attempt(
      'wood-pigeon',
      'photo-name',
      'visual-urgent',
      now - 3600000,
      false,
      'robin'
    );
    const session = createSession(progressFor([failed]), [failed], modes, {
      now,
      random: randomSource(30)
    });

    expect(
      session.questions.some(
        (question) => question.bird.id === 'wood-pigeon' && question.mode === 'photo-name'
      )
    ).toBe(true);
  });

  it('uses the lowest-level pair for the non-urgent review slot', () => {
    const progress: Record<string, Progress> = {};
    for (const bird of birds) {
      progress[`${bird.id}:photo-name`] = {
        ...emptyProgressForTest(),
        level: bird.id === 'great-tit' ? 0 : 5,
        attempts: 1,
        correct: 1,
        nextReview: now + 86400000
      };
    }
    const session = createSession(progress, [], ['photo-name'], {
      now,
      random: randomSource(30)
    });

    expect(session.questions.some((question) => question.bird.id === 'great-tit')).toBe(true);
  });

  it('gives a repeatedly failed, high-error pair more review weight than a lower-error miss', () => {
    const highError = Array.from({ length: 5 }, (_, index) =>
      attempt(
        'great-tit',
        'sound-photo',
        'high-error',
        now - (10 - index) * 86400000,
        false,
        'blue-tit'
      )
    );
    const lowError = [
      ...Array.from({ length: 9 }, (_, index) =>
        attempt('blue-tit', 'sound-photo', 'low-error', now - (20 - index) * 86400000)
      ),
      attempt('blue-tit', 'sound-photo', 'low-error', now - 86400000, false, 'great-tit')
    ];
    const attempts = [...highError, ...lowError];
    const counts = { 'great-tit': 0, 'blue-tit': 0 };

    for (let seed = 1; seed <= 160; seed += 1) {
      const session = createSession(progressFor(attempts), attempts, ['sound-photo'], {
        now,
        random: randomSource(seed)
      });
      for (const question of session.questions) {
        if (question.bird.id in counts) counts[question.bird.id as keyof typeof counts] += 1;
      }
    }

    expect(counts['great-tit']).toBeGreaterThan(counts['blue-tit']);
  });

  it('admits only the most recent session when every candidate is inside the cooldown window', () => {
    const soundBirds = birds.filter((bird) => bird.sounds.some((sound) => sound.url));
    const olderBirds = soundBirds.slice(0, 5);
    const latestBirds = soundBirds.slice(5);
    const attempts = [
      ...olderBirds.map((bird, index) =>
        attempt(bird.id, 'sound-photo', 'older', now - 3600000 + index)
      ),
      ...latestBirds.map((bird, index) =>
        attempt(bird.id, 'sound-photo', 'latest', now - 1800000 + index)
      )
    ];
    const session = createSession(progressFor(attempts), attempts, ['sound-photo'], {
      now,
      random: randomSource(31)
    });

    expect(
      session.questions.every((question) =>
        latestBirds.some((bird) => bird.id === question.bird.id)
      )
    ).toBe(true);
  });

  it('falls back to all candidates when the recent sessions contain no eligible candidates', () => {
    const soundBirds = birds.filter((bird) => bird.sounds.some((sound) => sound.url));
    const attempts = [
      ...soundBirds.map((bird, index) =>
        attempt(bird.id, 'sound-photo', 'older-sound', now - 3600000 + index)
      ),
      attempt('wood-pigeon', 'photo-name', 'latest-visual', now - 1800000)
    ];
    const session = createSession(progressFor(attempts), attempts, ['sound-photo'], {
      now,
      random: randomSource(32)
    });

    expect(
      session.questions.every((question) => soundBirds.some((bird) => bird.id === question.bird.id))
    ).toBe(true);
  });

  it('prioritizes a bird-mode pair that has never been practiced when the bird was seen in another mode', () => {
    const otherBirds = birds.filter((bird) => bird.id !== 'great-tit');
    const attempts = [
      attempt('great-tit', 'sound-photo', 'ancient-sound', now - 3 * 86400000),
      ...otherBirds
        .slice(0, 7)
        .map((bird, index) =>
          attempt(bird.id, 'photo-name', 'older-visuals', now - 3600000 + index)
        ),
      ...otherBirds
        .slice(7)
        .map((bird, index) =>
          attempt(bird.id, 'photo-name', 'latest-visuals', now - 1800000 + index)
        )
    ];
    const session = createSession(progressFor(attempts), attempts, ['photo-name'], {
      now,
      random: randomSource(33)
    });

    expect(session.questions.some((question) => question.bird.id === 'great-tit')).toBe(true);
  });

  it('generates only the supported modes across repeated sessions', () => {
    const attempts = Array.from({ length: 6 }, (_, index) =>
      attempt('great-tit', 'sound-photo', `mode-history-${index}`, now - (12 - index) * 3600000)
    );
    const generatedModes = new Set<Mode>();

    for (let seed = 1; seed <= 120; seed += 1) {
      const session = createSession(progressFor(attempts), attempts, modes, {
        now,
        random: randomSource(seed)
      });
      for (const question of session.questions) generatedModes.add(question.mode);
    }

    expect(generatedModes).toEqual(new Set(modes));
  });

  it('keeps sound-only sessions on birds with usable recordings', () => {
    const session = createSession({}, [], ['sound-photo'], {
      now,
      random: randomSource(34),
      questionCount: 10
    });
    expect(
      session.questions.every((question) => question.bird.sounds.some((sound) => sound.url))
    ).toBe(true);
  });

  it('uses distinct sound-capable birds when the catalogue can supply them', () => {
    const session = createSession({}, [], ['sound-photo'], {
      now,
      random: randomSource(39),
      questionCount: 10
    });

    expect(new Set(session.questions.map((question) => question.bird.id)).size).toBe(10);
  });

  it('groups legacy attempts into sets of three for cooldown', () => {
    const legacyAttempts = [
      ...['great-tit', 'blue-tit', 'house-sparrow'].map((birdId, index) =>
        attempt(birdId, 'sound-photo', 'legacy-a', now - 3600000 + index)
      ),
      ...['robin', 'blackbird', 'magpie'].map((birdId, index) =>
        attempt(birdId, 'sound-photo', 'legacy-b', now - 1800000 + index)
      )
    ].map(({ sessionId: _sessionId, ...item }) => item);
    const session = createSession(progressFor(legacyAttempts), legacyAttempts, ['sound-photo'], {
      now,
      random: randomSource(38)
    });
    const recentlySeen = new Set(legacyAttempts.map((item) => item.birdId));

    expect(session.questions.every((question) => !recentlySeen.has(question.bird.id))).toBe(true);
  });
});

describe('confusion-driven surrounding birds', () => {
  it('does not report a one-off confusion in the progress summary', () => {
    const confusion = attempt(
      'great-tit',
      'sound-photo',
      'one-off-summary',
      now - 86400000,
      false,
      'blue-tit'
    );
    const insight = summarizeBirdProgress(progressFor([confusion]), [confusion]).find(
      (item) => item.bird.id === 'great-tit'
    );

    expect(insight?.confusions).toEqual([]);
  });

  it('uses a ready one-off confusion as the forced top distractor', () => {
    const attempts = [
      attempt('great-tit', 'sound-photo', 'ready-1', now - 5 * 86400000),
      attempt('great-tit', 'sound-photo', 'ready-2', now - 4 * 86400000),
      attempt('great-tit', 'sound-photo', 'ready-3', now - 3 * 86400000),
      attempt('great-tit', 'sound-photo', 'ready-4', now - 2 * 86400000, false, 'blue-tit')
    ];
    const question = sessionWithQuestion(
      progressFor(attempts),
      attempts,
      ['sound-photo'],
      (item) => item.bird.id === 'great-tit' && item.mode === 'sound-photo',
      (session) => !session.questions.some((item) => item.bird.id === 'blue-tit')
    );

    expect(question.options[0].id).toBeDefined();
    expect(question.options.some((option) => option.id === 'blue-tit')).toBe(true);
  });

  it('applies confusion readiness across modes rather than per mode', () => {
    const attempts = [
      attempt('great-tit', 'photo-name', 'cross-mode-1', now - 5 * 86400000),
      attempt('great-tit', 'photo-name', 'cross-mode-2', now - 4 * 86400000),
      attempt('great-tit', 'photo-name', 'cross-mode-3', now - 3 * 86400000),
      attempt('great-tit', 'sound-photo', 'cross-mode-4', now - 2 * 86400000, false, 'blue-tit')
    ];
    const question = sessionWithQuestion(
      progressFor(attempts),
      attempts,
      ['sound-photo'],
      (item) => item.bird.id === 'great-tit' && item.mode === 'sound-photo',
      (session) => !session.questions.some((item) => item.bird.id === 'blue-tit')
    );

    expect(question.options.some((option) => option.id === 'blue-tit')).toBe(true);
  });

  it('blocks a confused bird when that bird is also a target in the same session', () => {
    const otherSoundBirds = birds.filter(
      (bird) =>
        bird.id !== 'great-tit' && bird.id !== 'blue-tit' && bird.sounds.some((sound) => sound.url)
    );
    const confusionHistory = [
      ...otherSoundBirds.map((bird, index) =>
        attempt(bird.id, 'sound-photo', 'blocked-old', now - 8 * 86400000 + index)
      ),
      attempt('great-tit', 'sound-photo', 'blocked-latest', now - 6 * 86400000),
      attempt('great-tit', 'sound-photo', 'blocked-latest', now - 5 * 86400000),
      attempt('great-tit', 'sound-photo', 'blocked-latest', now - 4 * 86400000),
      attempt('great-tit', 'sound-photo', 'blocked-latest', now - 3 * 86400000, false, 'blue-tit'),
      attempt('blue-tit', 'sound-photo', 'blocked-latest', now - 2 * 86400000)
    ];
    const progress = progressFor(confusionHistory);
    let matched = false;

    for (let seed = 1; seed < 500 && !matched; seed += 1) {
      const session = createSession(progress, confusionHistory, ['sound-photo'], {
        now,
        random: randomSource(seed)
      });
      const greatTit = session.questions.find((item) => item.bird.id === 'great-tit');
      const hasBlueTitTarget = session.questions.some((item) => item.bird.id === 'blue-tit');
      if (greatTit && hasBlueTitTarget) {
        matched = true;
        expect(greatTit.options.some((option) => option.id === 'blue-tit')).toBe(false);
      }
    }

    expect(matched).toBe(true);
  });

  it('keeps confusion history out of target ranking', () => {
    const attempts = [attempt('great-tit', 'sound-photo', 'ranking', now - 86400000)];
    const base = progressFor(attempts);
    const withConfusion = {
      ...base,
      'great-tit:sound-photo': {
        ...base['great-tit:sound-photo'],
        confusions: { 'blue-tit': 5 }
      }
    };
    const without = createSession(base, attempts, ['sound-photo'], {
      now,
      random: randomSource(35)
    });
    const withHistory = createSession(withConfusion, attempts, ['sound-photo'], {
      now,
      random: randomSource(35)
    });

    expect(withHistory.questions.map((item) => [item.bird.id, item.mode])).toEqual(
      without.questions.map((item) => [item.bird.id, item.mode])
    );
  });

  it('keeps filler distractors unique across questions while birds remain available', () => {
    const session = createSession({}, [], ['sound-photo'], {
      now,
      random: randomSource(36)
    });
    const distractors = session.questions.flatMap((question) =>
      question.options.filter((option) => option.id !== question.bird.id).map((option) => option.id)
    );

    expect(new Set(distractors).size).toBe(distractors.length);
  });

  it('does not use pair difficulty to change the surrounding-bird set', () => {
    const key = 'great-tit:sound-photo';
    const base: Record<string, Progress> = {
      [key]: { ...emptyProgressForTest(), attempts: 1, nextReview: now }
    };
    const harder: Record<string, Progress> = {
      [key]: { ...base[key], level: 5 }
    };
    const easySession = createSession(base, [], ['sound-photo'], {
      now,
      random: randomSource(37)
    });
    const hardSession = createSession(harder, [], ['sound-photo'], {
      now,
      random: randomSource(37)
    });
    const easy = easySession.questions.find((item) => item.bird.id === 'great-tit');
    const hard = hardSession.questions.find((item) => item.bird.id === 'great-tit');

    expect(easy?.difficulty).toBe(0);
    expect(hard?.difficulty).toBe(5);
    expect(easy?.options.map((option) => option.id)).toEqual(
      hard?.options.map((option) => option.id)
    );
  });
});

describe('sound selection after target selection', () => {
  it('chooses an unseen recording before reusing heard recordings', () => {
    const bird = birds.find((item) => item.id === 'great-tit');
    const sounds = bird?.sounds.filter((sound) => sound.url) ?? [];
    const seenMedia = sounds.slice(0, -1).map((sound) => sound.id);
    const progress: Record<string, Progress> = {
      'great-tit:sound-photo': {
        ...emptyProgressForTest(),
        attempts: 1,
        correct: 0,
        nextReview: now,
        seenMedia
      }
    };
    const question = sessionWithQuestion(
      progress,
      [],
      ['sound-photo'],
      (item) => item.bird.id === 'great-tit' && item.mode === 'sound-photo'
    );

    expect(question.soundId).toBe(sounds[sounds.length - 1]?.id);
  });

  it('avoids the most recently heard recording after all recordings have been seen', () => {
    const bird = birds.find((item) => item.id === 'great-tit');
    const sounds = bird?.sounds.filter((sound) => sound.url) ?? [];
    const recentMedia = sounds[0]?.id;
    const attemptHistory = [attempt('great-tit', 'sound-photo', 'sound-history', now - 3600000)];
    const progress: Record<string, Progress> = {
      'great-tit:sound-photo': {
        ...progressFor(attemptHistory)['great-tit:sound-photo'],
        nextReview: now,
        seenMedia: sounds.map((sound) => sound.id)
      }
    };
    const question = sessionWithQuestion(
      progress,
      attemptHistory,
      ['sound-photo'],
      (item) => item.bird.id === 'great-tit' && item.mode === 'sound-photo'
    );

    expect(question.soundId).not.toBe(recentMedia);
  });
});
