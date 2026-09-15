import { describe, expect, it } from 'vitest';
import { modes } from '$lib/data';
import { normalizeSnapshot } from './indexed-db';

describe('normalizeSnapshot', () => {
  it('migrates retired modes out of preferences, progress and attempts', () => {
    const snapshot = normalizeSnapshot({
      schemaVersion: 2,
      preferences: { modes: ['sound-name', 'photo-name'] },
      progress: {
        'robin:sound-name': { attempts: 4 },
        'robin:photo-name': { attempts: 2 }
      },
      attempts: [
        { id: 'legacy', mode: 'sound-name' },
        { id: 'current', mode: 'photo-name' }
      ]
    });

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.preferences.modes).toEqual(['photo-name']);
    expect(snapshot.progress).toEqual({ 'robin:photo-name': { attempts: 2 } });
    expect(snapshot.attempts).toEqual([{ id: 'current', mode: 'photo-name' }]);
  });

  it('defaults invalid or missing preferences to both supported modes', () => {
    expect(normalizeSnapshot({ preferences: { modes: ['sound-name'] } }).preferences.modes).toEqual(
      modes
    );
    expect(normalizeSnapshot({}).preferences.modes).toEqual(modes);
  });
});
