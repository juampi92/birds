<script lang="ts">
  import { assetUrl, photoCreditFor, sourceFor } from '$lib/media';
  import type { SessionQuestion } from '$lib/engine';
  import AnswerGrid from './AnswerGrid.svelte';
  import AudioPlayer from './AudioPlayer.svelte';
  import BirdReveal from './BirdReveal.svelte';
  import CreditsDialog from './CreditsDialog.svelte';
  import QuestionPrompt from './QuestionPrompt.svelte';

  type Props = {
    question: SessionQuestion;
    position: number;
    total: number;
    answered: boolean;
    onAnswer: (optionId: string) => void;
    onSkip: () => void;
    onNext: () => void;
    onLeave: () => void;
  };

  let { question, position, total, answered, onAnswer, onSkip, onNext, onLeave }: Props = $props();
  let showCredits = $state(false);
  let recording = $derived(sourceFor(question));
  let photoCredits = $derived(photoCreditFor(question));

  function openCredits() {
    showCredits = true;
  }
</script>

<section class:quiz-answered={answered} class="quiz-screen" aria-label="Bird practice">
  <header class="quiz-header">
    <button class="back" aria-label="Leave practice" onclick={onLeave}>‹</button>
    <span>Practice</span>
    <span class="counter">{position + 1} / {total}</span>
  </header>
  <div class="progress-line"><span style={`width:${(position / total) * 100}%`}></span></div>
  <section class="quiz-content">
    <div class="quiz-main">
      {#if answered}
        <BirdReveal {question} {recording} photo={photoCredits} />
      {:else}
        <QuestionPrompt {question} />
        <AnswerGrid
          options={question.options}
          mode={question.mode}
          optionImageIds={question.optionImageIds}
          selectedId={question.selectedId}
          disabled={answered}
          onChoose={onAnswer}
        />
        {#if question.mode.startsWith('sound-')}
          <AudioPlayer
            src={recording?.url ? assetUrl(recording.url) : ''}
            recordist={recording?.recordist ?? ''}
            questionId={question.id}
            onOpenCredits={openCredits}
          />
        {/if}
      {/if}
    </div>
    <footer class="quiz-footer">
      {#if !answered}
        <button class="skip" onclick={onSkip}>Skip</button>
      {:else}
        <button class="primary" onclick={onNext}
          >{position === total - 1 ? 'See result' : 'Continue'}</button
        >
      {/if}
    </footer>
  </section>
  {#if showCredits}
    <CreditsDialog
      recordist={recording?.recordist ?? ''}
      audioSourceUrl={recording?.sourceUrl ?? ''}
      audioLicense={recording?.license ?? ''}
      audioLicenseUrl={recording?.licenseUrl ?? ''}
      photo={photoCredits}
      onClose={() => (showCredits = false)}
    />
  {/if}
</section>
