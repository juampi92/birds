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
  <p class="eyebrow practice-mode-label">PRACTICE MODES</p>
  <ModePicker {selectedModes} onChange={onModesChange} {disabled} />
  <div class="practice-actions" aria-label="Choose a practice length">
    <button
      class="primary practice-action"
      disabled={disabled || !hasSelectedModes}
      onclick={() => onStart(10)}
    >
      <span>Start practice</span>
      <small>10 questions</small>
    </button>
    <button
      class="secondary practice-action"
      disabled={disabled || !hasSelectedModes}
      onclick={() => onStart(3)}
    >
      <span>Start 3-question practice</span>
    </button>
  </div>
  {#if !hasSelectedModes}
    <p class="practice-error" role="alert">Select at least one question type to start practice.</p>
  {/if}
</div>
