import { describe, expect, it } from 'vitest';
import { AppController } from './app-controller.svelte';
import { modes } from '$lib/data';

describe('AppController', () => {
  it('hydrates, starts a round, and records one answer transaction', async () => {
    const app = new AppController();
    await app.initialize();

    expect(app.status).toBe('ready');
    expect(app.selectedModes).toEqual(modes);
    expect(app.startPractice(3)).toEqual({ ok: true });
    expect(app.session?.questions).toHaveLength(3);

    const question = app.currentQuestion;
    expect(question).toBeDefined();
    app.answer(question!.options[0].id);
    app.answer(question!.options[1].id);

    expect(app.learning.attempts).toHaveLength(1);
    expect(app.answered).toBe(true);
  });

  it('does not replace an unfinished round and preserves modes when resetting progress', async () => {
    const app = new AppController();
    await app.initialize();

    app.toggleMode('photo-name', false);
    expect(app.selectedModes).not.toContain('photo-name');
    expect(app.startPractice(3)).toEqual({ ok: true });
    expect(app.startPractice(10)).toEqual({ ok: false, reason: 'active-session' });

    app.resetProgress();

    expect(app.session).toBeNull();
    expect(app.learning.attempts).toHaveLength(0);
    expect(app.selectedModes).not.toContain('photo-name');
  });

  it('allows an empty mode selection for the practice launcher validation state', async () => {
    const app = new AppController();
    await app.initialize();

    app.setModes([]);

    expect(app.selectedModes).toEqual([]);
  });
});
