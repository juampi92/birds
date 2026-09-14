<script lang="ts">
  import { sourceNameFor } from '$lib/media';

  type Recording = {
    recordist: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
  };
  type Photo = {
    photographer?: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
  };
  type Props = { recording?: Recording; photo: Photo };

  let { recording, photo }: Props = $props();
</script>

<section class="credit-summary" aria-label="Credits">
  <p class="credit-summary-label">Credits</p>
  {#if recording}
    <div class="credit-item">
      <svg class="credit-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5Z" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
      <div class="credit-item-copy">
        <p class="credit-kind">Recording</p>
        <p class="credit-line">
          {recording.recordist || 'Source contributor'} -
          {#if recording.sourceUrl}
            <a href={recording.sourceUrl} target="_blank" rel="external noreferrer"
              >{sourceNameFor(recording.sourceUrl)} ↗</a
            >
          {:else}<span>Source</span>{/if}
          ·
          {#if recording.licenseUrl}
            <a href={recording.licenseUrl} target="_blank" rel="external noreferrer"
              >{recording.license || 'Licence'} ↗</a
            >
          {:else}<span>{recording.license || 'Licence'}</span>{/if}
        </p>
      </div>
    </div>
  {/if}

  <div class="credit-item">
    <svg class="credit-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
    </svg>
    <div class="credit-item-copy">
      <p class="credit-kind">Photo</p>
      <p class="credit-line">
        {photo.photographer || 'Source contributor'} -
        {#if photo.sourceUrl}
          <a href={photo.sourceUrl} target="_blank" rel="external noreferrer"
            >{sourceNameFor(photo.sourceUrl)} ↗</a
          >
        {:else}<span>Source</span>{/if}
        ·
        {#if photo.licenseUrl}
          <a href={photo.licenseUrl} target="_blank" rel="external noreferrer"
            >{photo.license || 'Licence'} ↗</a
          >
        {:else}<span>{photo.license || 'Licence'}</span>{/if}
      </p>
    </div>
  </div>
</section>
