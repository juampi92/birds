<script lang="ts">
  import type { Mode } from '$lib/data';
  import type { PracticeLength } from '$lib/engine';
  import ModePicker from './ModePicker.svelte';

  type Props = {
    selectedModes: Mode[];
    onModesChange: (modes: Mode[]) => void;
    onStart: (length: PracticeLength) => void;
    disabled?: boolean;
  };

  let { selectedModes, onModesChange, onStart, disabled = false }: Props = $props();
  let hasSelectedModes = $derived(selectedModes.length > 0);
</script>

<div class="practice-picker">
  <ModePicker {selectedModes} onChange={onModesChange} {disabled} />
  <div class="practice-actions" aria-label="Choose a practice length">
    <button
      class="primary practice-action"
      disabled={disabled || !hasSelectedModes}
      onclick={() => onStart(10)}
    >
      <span>Practice</span>
      <small>A 10-question round</small>
    </button>
    <button
      class="primary practice-action"
      disabled={disabled || !hasSelectedModes}
      onclick={() => onStart(3)}
    >
      <span>Quick practice</span>
      <small>Short 3-question round</small>
    </button>
  </div>
  {#if !hasSelectedModes}
    <p class="practice-error" role="alert">Select at least one question type to start practice.</p>
  {/if}
</div>
