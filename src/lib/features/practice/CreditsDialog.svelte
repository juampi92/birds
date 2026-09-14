<script lang="ts">
  type Credit = {
    photographer?: string;
    photographerUrl?: string;
    source: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
    identityNote?: string;
  };
  type Props = {
    recordist: string;
    audioSourceUrl: string;
    audioLicense: string;
    audioLicenseUrl: string;
    photo: Credit;
    onClose: () => void;
  };

  let { recordist, audioSourceUrl, audioLicense, audioLicenseUrl, photo, onClose }: Props =
    $props();
</script>

<div
  class="credits-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Recording and photo credits"
>
  <div class="credits-dialog">
    <button class="close-dialog" aria-label="Close credits" onclick={onClose}>×</button>
    <p class="eyebrow">CREDITS</p>
    <h2>Recording & photo</h2>
    <p>
      Audio: {recordist || 'Source contributor'} ·
      <a href={audioSourceUrl || '#'} target="_blank" rel="external noreferrer">source</a>
      ·
      <a href={audioLicenseUrl || '#'} target="_blank" rel="external noreferrer"
        >{audioLicense || 'licence'}</a
      >
    </p>
    <p>
      Photo:
      {#if photo.photographerUrl}
        <a href={photo.photographerUrl} target="_blank" rel="external noreferrer"
          >{photo.photographer}</a
        >
      {:else}{photo.photographer}{/if}
      ·
      <a href={photo.sourceUrl || '#'} target="_blank" rel="external noreferrer">{photo.source}</a>
      ·
      <a href={photo.licenseUrl || '#'} target="_blank" rel="external noreferrer">{photo.license}</a
      >
    </p>
    {#if photo.identityNote}<p>{photo.identityNote}</p>{/if}
  </div>
</div>
