<script lang="ts">
  import {
    dismissInstallPrompt,
    installAvailable,
    installHelp,
    installPwa,
    pwaInstalled
  } from '$lib/offline';

  async function install() {
    await installPwa();
  }
</script>

{#if !$pwaInstalled && ($installAvailable || $installHelp)}
  <aside class="install-banner" aria-label="Install Birds">
    {#if $installAvailable}
      <div>
        <strong>Install birds</strong>
        <p>Keep practice and your bird library close at hand.</p>
      </div>
      <div class="install-actions">
        <button class="primary" onclick={install}>Install app</button>
        <button class="text-button" onclick={dismissInstallPrompt}>Later</button>
      </div>
    {:else if $installHelp === 'ios'}
      <div>
        <strong>Add birds to your Home Screen</strong>
        <p>
          In Safari, tap Share, then <span aria-label="Add to Home Screen">Add to Home Screen</span
          >.
        </p>
      </div>
      <button
        class="close-install"
        aria-label="Dismiss install instructions"
        onclick={dismissInstallPrompt}>×</button
      >
    {:else}
      <div>
        <strong>Install birds for quick access</strong>
        <p>
          If your browser supports installation, open its menu and choose “Install app” or “Add to
          Home Screen”.
        </p>
      </div>
      <button
        class="close-install"
        aria-label="Dismiss install instructions"
        onclick={dismissInstallPrompt}>×</button
      >
    {/if}
  </aside>
{/if}
