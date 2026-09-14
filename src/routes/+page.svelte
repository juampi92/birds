<script lang="ts">
  import { base, resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { birds, type Mode } from '$lib/data';
  import type { PracticeLength } from '$lib/engine';
  import { useApp } from '$lib/application/app-context';
  import PracticeLauncher from '$lib/features/practice/PracticeLauncher.svelte';
  import OfflineDownloadPanel from '$lib/features/offline/OfflineDownloadPanel.svelte';

  const app = useApp();
  let showMenu = $state(false);

  function updateModes(modes: Mode[]) {
    app.setModes(modes);
  }

  function startPractice(length: PracticeLength) {
    if (app.startPractice(length).ok) void goto(resolve('/practice'));
  }
</script>

<svelte:head>
  <title>birds · daily practice</title>
  <link rel="manifest" href={`${base}/manifest.webmanifest`} />
</svelte:head>

<main class="shell">
  <header class="topbar">
    <a class="wordmark" href={resolve('/')}>birds</a>
    <button
      class="icon-button"
      aria-label={showMenu ? 'Close menu' : 'Open menu'}
      aria-expanded={showMenu}
      aria-controls="primary-menu"
      onclick={() => (showMenu = !showMenu)}>☰</button
    >
  </header>
  {#if showMenu}
    <nav id="primary-menu" class="menu" aria-label="Main navigation">
      <a href={resolve('/library')} onclick={() => (showMenu = false)}>Birds & progress</a>
      <a href={resolve('/settings')} onclick={() => (showMenu = false)}>Settings</a>
    </nav>
  {/if}

  <section class="home-content">
    <img
      class="home-hero"
      src={`${base}/brand/robin-logo.png`}
      alt="birds logo — European robin silhouette on a Dutch balcony"
    />
    <PracticeLauncher
      selectedModes={app.selectedModes}
      disabled={app.status !== 'ready'}
      onModesChange={updateModes}
      onStart={startPractice}
    />
    <OfflineDownloadPanel variant="home" />
    <div class="home-links">
      <a href={resolve('/library')}>
        <span class="home-link-label">Birds & progress</span>
        <span class="home-link-detail">{birds.length} birds</span>
        <span class="home-link-arrow">›</span>
      </a>
      <a href={resolve('/settings')}>Settings <span>›</span></a>
    </div>
    <footer class="home-footer" aria-label="About birds">
      <a href="https://github.com/juampi92/birds" target="_blank" rel="external noreferrer"
        >github</a
      >
      <span aria-hidden="true">·</span>
      <a href="https://merlin.allaboutbirds.org/" target="_blank" rel="external noreferrer"
        >merlin bird id</a
      >
      <span aria-hidden="true">·</span>
      <span>no tracking</span>
    </footer>
  </section>
</main>
