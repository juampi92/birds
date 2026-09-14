<script lang="ts">
  import { offlineState, prepareOffline, pwaInstalled } from '$lib/offline';

  type Props = { variant: 'home' | 'settings' };
  let { variant }: Props = $props();

  let percent = $derived(
    $offlineState.total
      ? Math.min(100, Math.round(($offlineState.downloaded / $offlineState.total) * 100))
      : 0
  );
  let ready = $derived(
    $offlineState.phase === 'complete' &&
      $offlineState.total > 0 &&
      $offlineState.downloaded >= $offlineState.total &&
      $offlineState.failed === 0
  );
  let visible = $derived($pwaInstalled && $offlineState.statusKnown && !ready);

  function formatBytes(bytes: number | null) {
    if (bytes === null || !Number.isFinite(bytes)) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

{#if visible}
  <section class={variant === 'home' ? 'offline-card' : 'offline-settings'} aria-live="polite">
    {#if $offlineState.phase === 'preparing'}
      <p class="offline-kicker">DOWNLOADING FOR OFFLINE</p>
      <h2>{percent}% ready</h2>
      <progress max="100" value={percent} aria-label={`Offline media download ${percent} percent`}
      ></progress>
      <p>
        {$offlineState.downloaded} of {$offlineState.total} files. Keep this tab open while the download
        finishes.
        {#if $offlineState.bytesTotal}
          · {formatBytes($offlineState.bytesDownloaded)} of {formatBytes($offlineState.bytesTotal)}
        {/if}
      </p>
    {:else}
      <p class="offline-kicker">USE OFFLINE</p>
      <h2>
        {variant === 'home' ? 'Keep the bird library with you.' : 'Birds without a connection.'}
      </h2>
      <p>
        Download the reviewed photos and recordings once. Existing cached files are reused.
        {#if $offlineState.bytesTotal}
          Approx. {formatBytes($offlineState.bytesTotal)}.{/if}
      </p>
    {/if}
    {#if $offlineState.phase === 'error'}
      <p class="error">
        {$offlineState.error ?? 'Some files could not be downloaded.'}{#if $offlineState.failed}
          {$offlineState.failed} failed.{/if}
      </p>
    {/if}
    <button
      class="secondary"
      disabled={$offlineState.phase === 'preparing' ||
        !$offlineState.supported ||
        !$offlineState.online}
      onclick={prepareOffline}
      >{$offlineState.phase === 'error' ? 'Retry download' : 'Download for offline'}</button
    >
    {#if !$offlineState.supported}
      <p class="muted">Offline downloads are not available in this browser.</p>
    {:else if !$offlineState.online}
      <p class="muted">Reconnect before downloading.</p>
    {/if}
  </section>
{/if}
