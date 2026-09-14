<script lang="ts">
  import { assetUrl, photoFor, photoReady } from '$lib/media';
  import type { SessionQuestion } from '$lib/engine';
  import BirdImage from '$lib/ui/BirdImage.svelte';

  type Props = { question: SessionQuestion };
  let { question }: Props = $props();

  let prompt = $derived(
    question.mode.startsWith('sound-')
      ? 'Which bird made this sound?'
      : question.mode === 'photo-name'
        ? 'Which bird is this?'
        : question.bird.name
  );
</script>

<div class="quiz-prompt">
  <p class="eyebrow">
    {question.mode === 'sound-photo'
      ? 'Sound → photo'
      : question.mode === 'sound-name'
        ? 'Sound → name'
        : 'Photo → name'}
  </p>
  <h2>{prompt}</h2>
  {#if question.mode === 'photo-name'}
    {#if photoReady(question.bird, question.imageId)}
      <BirdImage
        variant="question"
        className="question-photo"
        placeholderClassName="photo-placeholder"
        src={assetUrl(photoFor(question.bird, question.imageId)?.url ?? '')}
        alt="Bird photograph"
      />
    {:else}
      <div class="photo-placeholder">Verified bird photograph pending</div>
    {/if}
  {/if}
</div>
