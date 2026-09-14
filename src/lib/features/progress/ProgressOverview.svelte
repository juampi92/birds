<script lang="ts">
  type Props = { correct: number; incorrect: number; accuracy: number };
  let { correct, incorrect, accuracy }: Props = $props();
</script>

<section class="progress-overview" aria-label="Practice overview">
  <div class="progress-stat"><strong>{correct}</strong><span>correct</span></div>
  <div class="progress-stat"><strong>{incorrect}</strong><span>to revisit</span></div>
  <div class="progress-stat"><strong>{accuracy}%</strong><span>accuracy</span></div>
</section>
