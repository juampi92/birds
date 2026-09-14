<script lang="ts">
  import { onDestroy, tick } from 'svelte';

  type Props = {
    src: string;
    recordist: string;
    questionId: string;
    autoplay?: boolean;
    onOpenCredits: () => void;
  };

  let { src, recordist, questionId, autoplay = true, onOpenCredits }: Props = $props();
  let audio = $state<HTMLAudioElement>();
  let playing = $state(false);
  let hasPlayed = $state(false);
  let audioError = $state(false);

  function stop(resetPlayed = false) {
    audio?.pause();
    if (audio) audio.currentTime = 0;
    playing = false;
    audioError = false;
    if (resetPlayed) hasPlayed = false;
  }

  async function play() {
    if (!audio || !src) return;
    audioError = false;
    if (playing) {
      audio.pause();
      playing = false;
      return;
    }
    if (audio.ended || hasPlayed) audio.currentTime = 0;
    try {
      await audio.play();
      playing = true;
      hasPlayed = true;
    } catch {
      audioError = true;
    }
  }

  $effect(() => {
    const currentQuestion = questionId;
    const shouldAutoplay = autoplay;
    const source = src;
    stop(true);
    if (shouldAutoplay && currentQuestion && source) void tick().then(() => play());
  });

  onDestroy(() => stop(true));
</script>

<div class="audio-controls">
  <button
    class:playing
    class="audio-button"
    aria-label={playing ? 'Pause recording' : hasPlayed ? 'Replay recording' : 'Play recording'}
    onclick={play}><span>{playing ? 'Ⅱ' : '▶'}</span></button
  >
  {#if src}
    <audio
      bind:this={audio}
      {src}
      preload="metadata"
      onended={() => {
        playing = false;
        hasPlayed = true;
        if (audio) audio.currentTime = 0;
      }}
      onerror={() => (audioError = true)}
    ></audio>
  {/if}
  {#if audioError || !src}
    <p class="error">This recording is pending a verified local download.</p>
  {/if}
  <div class="audio-credit">
    Audio: {recordist || 'Source contributor'} ·
    <button class="inline-link" onclick={onOpenCredits}>credits</button>
  </div>
</div>
