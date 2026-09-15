<script lang="ts">
  import { resolve } from '$app/paths';
  import { useApp } from '$lib/application/app-context';
  import type { Mode } from '$lib/data';
  import ModePicker from '$lib/features/practice/ModePicker.svelte';
  import OfflineDownloadPanel from '$lib/features/offline/OfflineDownloadPanel.svelte';

  const app = useApp();

  function reset() {
    if (confirm('Reset all progress on this device?')) app.resetProgress();
  }
</script>

<main class="shell">
  <section class="page">
    <a class="back" href={resolve('/')} data-sveltekit-replacestate>‹ <span>Back</span></a>
    <p class="eyebrow">SETTINGS</p>
    <h2>Question modes</h2>
    <ModePicker
      selectedModes={app.selectedModes}
      disabled={app.status !== 'ready'}
      className="settings-mode-picker"
      onChange={(modes: Mode[]) => app.setModes(modes)}
    />
    <OfflineDownloadPanel variant="settings" />
    <div class="settings-actions">
      <button class="danger" onclick={reset}>Reset progress</button>
    </div>
    {#if app.storageError}<p class="error">{app.storageError}</p>{/if}
  </section>
</main>
