<script lang="ts">
  import { assetUrl, photoReady } from '$lib/media';
  import type { BirdInsight } from '$lib/engine';
  import { birds } from '$lib/data';
  import BirdImage from '$lib/ui/BirdImage.svelte';

  type Props = { insight: BirdInsight };
  let { insight }: Props = $props();
  const birdNames = new Map(birds.map((bird) => [bird.id, bird.name]));
  let status = $derived(
    !insight.attempts
      ? 'Not practiced yet'
      : insight.accuracy < 70
        ? 'Needs more practice'
        : insight.accuracy >= 90 && insight.level >= 2
          ? 'Looking good'
          : 'In progress'
  );
  let confusion = $derived(
    insight.confusions
      .slice(0, 2)
      .map(({ birdId, count }) => {
        const name = birdNames.get(birdId);
        return name ? `${name} (${count}×)` : undefined;
      })
      .filter((name): name is string => Boolean(name))
  );
</script>

<article class:attention={insight.attempts > 0 && insight.accuracy < 70}>
  {#if photoReady(insight.bird)}
    <BirdImage
      variant="thumb"
      className="thumb-photo"
      placeholderClassName="thumb"
      src={assetUrl(insight.bird.photoUrl)}
      alt={insight.bird.name}
    />
  {:else}
    <div class="thumb"><span>Photo<br />pending</span></div>
  {/if}
  <div class="bird-progress-copy">
    <div class="progress-heading">
      <div>
        <h2>{insight.bird.name}</h2>
        <p>{insight.bird.scientificName}</p>
      </div>
      <span class="progress-percent">{insight.progressPercent}%</span>
    </div>
    <div
      class="progress-track"
      role="progressbar"
      aria-label={`${insight.bird.name} learning progress`}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={insight.progressPercent}
    >
      <span style={`width:${insight.progressPercent}%`}></span>
    </div>
    {#if insight.attempts}
      <p class="practice-result">
        <span class="correct-count">{insight.correct} correct</span><span
          >{insight.incorrect} incorrect</span
        ><span>{insight.accuracy}% accuracy</span>
      </p>
      <p class:attention-text={insight.accuracy < 70} class="practice-status">{status}</p>
      {#if confusion.length}<p class="confusion-note">
          Often mixed up with {confusion.join(' and ')}.
        </p>{/if}
    {:else}
      <p class="practice-status">{status}</p>
    {/if}
  </div>
</article>
