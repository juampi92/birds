<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useApp } from '$lib/application/app-context';
  import type { Mode } from '$lib/data';
  import type { PracticeLength } from '$lib/engine';
  import PracticeQuestion from '$lib/features/practice/PracticeQuestion.svelte';
  import PracticeResult from '$lib/features/practice/PracticeResult.svelte';

  const app = useApp();
  let redirecting = $state(false);

  beforeNavigate((navigation) => {
    if (navigation.to?.url.pathname !== resolve('/practice')) app.abandonPractice();
  });

  $effect(() => {
    if (app.status === 'ready' && !app.session && !redirecting) {
      redirecting = true;
      void goto(resolve('/'), { replaceState: true });
    }
  });

  function leavePractice() {
    app.abandonPractice();
    history.back();
  }

  function startAgain(length: PracticeLength) {
    app.startPractice(length);
  }

  function updateModes(modes: Mode[]) {
    app.setModes(modes);
  }

  function backHome() {
    app.closeResults();
    void goto(resolve('/'), { replaceState: true });
  }
</script>

{#if app.status !== 'ready' || !app.session}
  <main class="shell"><p class="muted">Loading practice…</p></main>
{:else if app.sessionDone}
  <main class="shell">
    <PracticeResult
      score={app.score}
      length={app.sessionLength}
      selectedModes={app.selectedModes}
      onModesChange={updateModes}
      onStartAgain={startAgain}
      onBackHome={backHome}
    />
  </main>
{:else if app.currentQuestion}
  <main class="shell">
    <PracticeQuestion
      question={app.currentQuestion}
      position={app.session.index}
      total={app.session.questions.length}
      answered={app.answered}
      onAnswer={(optionId) => app.answer(optionId)}
      onSkip={() => app.skip()}
      onNext={() => app.nextQuestion()}
      onLeave={leavePractice}
    />
  </main>
{/if}
