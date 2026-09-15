// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PracticeLauncher from './features/practice/PracticeLauncher.svelte';
import type { Mode } from './data';

afterEach(() => cleanup());

const allModes: Mode[] = ['sound-photo', 'photo-name'];

function renderPicker(selectedModes: Mode[] = allModes) {
  return render(PracticeLauncher, {
    selectedModes,
    onStart: vi.fn(),
    onModesChange: vi.fn()
  });
}

describe('PracticeLauncher', () => {
  it('shows the two concise question types selected by default', () => {
    const { container } = renderPicker();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(container.querySelectorAll('.mode-icon')).toHaveLength(2);
    expect(container.querySelectorAll('.mode-icon-text')).toHaveLength(0);
    expect(container.querySelectorAll('.mode-check')).toHaveLength(2);
    expect(container.textContent).not.toContain('Sound → name');
    expect(screen.getByRole('checkbox', { name: 'sound to photo' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'photo to name' })).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Start practice 10 questions',
      'Start 3-question practice'
    ]);
  });

  it('uses the clear three-question action while sending the requested length', async () => {
    const onStart = vi.fn();
    render(PracticeLauncher, {
      selectedModes: allModes,
      onStart,
      onModesChange: vi.fn()
    });

    const quickPractice = screen.getByRole('button', { name: 'Start 3-question practice' });
    await fireEvent.click(quickPractice);

    expect(onStart).toHaveBeenCalledWith(3);
    expect(quickPractice.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Start 3-question practice'
    );
  });

  it('reports the selected mode and checked state when a type is toggled', async () => {
    const onModesChange = vi.fn();
    render(PracticeLauncher, {
      selectedModes: allModes,
      onStart: vi.fn(),
      onModesChange
    });

    const soundToPhoto = screen.getByRole('checkbox', { name: 'sound to photo' });
    await fireEvent.click(soundToPhoto);

    expect(onModesChange).toHaveBeenCalledWith(['photo-name']);
    expect((soundToPhoto as HTMLInputElement).checked).toBe(false);
  });

  it('allows the final question type to be deselected', async () => {
    const onModesChange = vi.fn();
    render(PracticeLauncher, {
      selectedModes: ['photo-name'],
      onStart: vi.fn(),
      onModesChange
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'photo to name' }));

    expect(onModesChange).toHaveBeenCalledWith([]);
  });

  it('blocks both round lengths and explains the empty selection state', () => {
    renderPicker([]);

    const buttons = screen.getAllByRole('button');
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('alert').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Select at least one question type to start practice.'
    );
  });
});
