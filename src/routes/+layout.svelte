<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { startOfflineClient, stopOfflineClient } from '$lib/offline';
  import { AppController } from '$lib/application/app-controller.svelte';
  import { provideApp } from '$lib/application/app-context';
  import InstallBanner from '$lib/features/offline/InstallBanner.svelte';

  const app = new AppController();
  provideApp(app);

  onMount(() => {
    void app.initialize();
    startOfflineClient();
    return stopOfflineClient;
  });
</script>

<svelte:head>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
</svelte:head>

<InstallBanner />
<slot />
