<script lang="ts">
  import type { Mode } from '$lib/data';
  import type { PracticeLength } from '$lib/engine';
  import PracticeLauncher from './PracticeLauncher.svelte';

  type Props = {
    score: number;
    length: number;
    selectedModes: Mode[];
    onModesChange: (modes: Mode[]) => void;
    onStartAgain: (length: PracticeLength) => void;
    onBackHome: () => void;
  };

  let { score, length, selectedModes, onModesChange, onStartAgain, onBackHome }: Props = $props();
</script>

<section class="result">
  <div class="result-summary">
    <p class="eyebrow">SESSION COMPLETE</p>
    <h1>{score} / {length}</h1>
  </div>
  <footer class="result-footer">
    <PracticeLauncher {selectedModes} {onModesChange} onStart={onStartAgain} />
    <button class="text-button" onclick={onBackHome}>Back home</button>
  </footer>
</section>
