// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PracticeLauncher from './features/practice/PracticeLauncher.svelte';
import type { Mode } from './data';

afterEach(() => cleanup());

const allModes: Mode[] = ['sound-photo', 'sound-name', 'photo-name'];

function renderPicker(selectedModes: Mode[] = allModes) {
  return render(PracticeLauncher, {
    selectedModes,
    onStart: vi.fn(),
    onModesChange: vi.fn()
  });
}

describe('PracticeLauncher', () => {
  it('shows the three concise question types before Practice and Quick practice', () => {
    const { container } = renderPicker();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(container.querySelectorAll('.mode-icon')).toHaveLength(6);
    expect(container.querySelectorAll('.mode-icon-text')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'sound to photo' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'photo to name' })).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Practice A 10-question round',
      'Quick practice Short 3-question round'
    ]);
  });

  it('keeps the existing round labels while sending the requested length', async () => {
    const onStart = vi.fn();
    render(PracticeLauncher, {
      selectedModes: allModes,
      onStart,
      onModesChange: vi.fn()
    });

    const quickPractice = screen.getByRole('button', { name: /quick practice/i });
    await fireEvent.click(quickPractice);

    expect(onStart).toHaveBeenCalledWith(3);
    expect(quickPractice.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Quick practice Short 3-question round'
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

    expect(onModesChange).toHaveBeenCalledWith(['sound-name', 'photo-name']);
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
