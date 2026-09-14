<script lang="ts">
  import { assetUrl, photoFor, photoReady } from '$lib/media';
  import type { SessionQuestion } from '$lib/engine';
  import BirdImage from '$lib/ui/BirdImage.svelte';
  import CreditSummary from './CreditSummary.svelte';

  type Props = {
    question: SessionQuestion;
    recording?: {
      recordist: string;
      sourceUrl: string;
      license: string;
      licenseUrl: string;
    };
    photo: {
      photographer?: string;
      sourceUrl: string;
      license: string;
      licenseUrl: string;
    };
  };
  let { question, recording, photo }: Props = $props();
  let correct = $derived(!question.skipped && question.selectedId === question.bird.id);
  let negative = $derived(!question.skipped && !correct);
  let status = $derived(question.skipped ? 'Skipped' : correct ? 'Correct' : 'Incorrect');
</script>

<div class="reveal">
  <div
    class:correct
    class:negative
    class:skipped={question.skipped}
    class="reveal-feedback"
    role="status"
    aria-label={status}
  >
    <span class="reveal-feedback-icon" aria-hidden="true">
      {#if correct}
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      {:else if negative}
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 12h12" />
        </svg>
      {/if}
    </span>
    <span class="reveal-feedback-copy">
      <span class="reveal-status">{status}</span>
    </span>
  </div>
  <h3>{question.bird.name}</h3>
  {#if photoReady(question.bird, question.imageId)}
    <BirdImage
      variant="reveal"
      placeholderClassName="photo-placeholder"
      src={assetUrl(photoFor(question.bird, question.imageId)?.url ?? '')}
      alt={question.bird.name}
    />
  {:else}
    <div class="photo-placeholder">Verified bird photograph pending</div>
  {/if}
  <CreditSummary {recording} {photo} />
</div>
