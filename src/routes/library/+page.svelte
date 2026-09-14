<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useApp } from '$lib/application/app-context';
  import BirdProgressItem from '$lib/features/progress/BirdProgressItem.svelte';
  import ProgressOverview from '$lib/features/progress/ProgressOverview.svelte';

  const app = useApp();

  function startPractice() {
    if (app.startPractice(3).ok) void goto(resolve('/practice'));
  }
</script>

<main class="shell">
  <section class="page">
    <a class="back" href={resolve('/')} data-sveltekit-replacestate>‹ <span>Back</span></a>
    <p class="eyebrow">YOUR LIBRARY</p>
    <h1>Birds & progress</h1>
    <p class="muted">
      Your reference library and practice history in one place. Reviews are spaced at 1, 3, 7, 14
      and 30 days.
    </p>
    <ProgressOverview
      correct={app.totals.correct}
      incorrect={app.totals.incorrect}
      accuracy={app.accuracy}
    />
    {#if !app.totals.practices}
      <div class="empty-state">
        <strong>Start with a little listening.</strong>
        <p>Your correct and incorrect answers will appear here, bird by bird.</p>
        <button class="secondary" disabled={app.status !== 'ready'} onclick={startPractice}
          >Practice now</button
        >
      </div>
    {/if}
    <div class="progress-list" aria-label="Bird practice progress">
      {#each app.birdInsights as insight (insight.bird.id)}
        <BirdProgressItem {insight} />
      {/each}
    </div>
  </section>
</main>
