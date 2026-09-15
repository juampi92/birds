<script lang="ts">
  import { resolve } from '$app/paths';
  import { assetUrl, sourceNameFor } from '$lib/media';
  import catalog from '../../../static/media/catalog.json';
  import mediaManifest from '../../../static/media-manifest.json';

  const manifestByUrl = new Map(mediaManifest.assets.map((asset) => [asset.url, asset]));
  const resolvePath = resolve as unknown as (path: string) => string;

  function localAssetUrl(url: string) {
    return resolvePath(manifestByUrl.get(url)?.versionedUrl ?? url);
  }

  function fileName(url: string) {
    return url.split('/').pop() ?? url;
  }
</script>

<svelte:head>
  <title>birds · credits</title>
  <meta
    name="description"
    content="Credits and source links for the images and bird recordings used by birds."
  />
</svelte:head>

<main class="credits-page">
  <header class="credits-header">
    <a class="credits-wordmark" href={resolve('/')} aria-label="Back to birds home">birds</a>
    <p class="eyebrow">MEDIA CREDITS</p>
    <h1>Credits</h1>
    <p class="credits-intro">
      The images and recordings used throughout birds, with links to each local copy, original
      source, contributor, and licence.
    </p>
    <p class="credits-intro">
      Local photo copies are center-cropped, resized to 768 × 768, and converted to WebP. Audio
      copies are converted to Ogg Opus; eligible recordings may be capped at 60 seconds, while
      no-derivatives recordings retain their full duration.
    </p>
    <p class="credits-count">
      {mediaManifest.totals.photos} images · {mediaManifest.totals.sounds} recordings · catalogue updated
      {catalog.updatedAt}
    </p>
  </header>

  <div class="credits-table-wrap">
    <table class="credits-table">
      <caption class="sr-only">
        Credits for the {mediaManifest.totals.assets} images and audio recordings used by birds
      </caption>
      <thead>
        <tr>
          <th scope="col">Bird</th>
          <th scope="col">Resource</th>
          <th scope="col">Static asset</th>
          <th scope="col">Credit</th>
          <th scope="col">Licence</th>
          <th scope="col">Source</th>
        </tr>
      </thead>
      {#each catalog.birds as bird (bird.id)}
        <tbody aria-label={`${bird.name} resources`}>
          {#each bird.images as image (image.id)}
            <tr>
              <th scope="row" class="credits-bird">
                <span>{bird.name}</span>
                <small>{bird.scientificName}</small>
              </th>
              <td>
                <div class="credits-resource">
                  <a
                    class="credits-preview credits-preview-image"
                    href={localAssetUrl(image.url)}
                    target="_blank"
                    rel="external noreferrer"
                    aria-label={`Open local image: ${image.title}`}
                  >
                    <img
                      src={assetUrl(image.url)}
                      alt={`${bird.name}: ${image.title}`}
                      loading="lazy"
                    />
                  </a>
                  <div>
                    <strong>{image.title}</strong>
                    <span class="credits-kind">Image</span>
                  </div>
                </div>
              </td>
              <td>
                <a
                  class="credits-asset-link"
                  href={localAssetUrl(image.url)}
                  target="_blank"
                  rel="external noreferrer">{fileName(image.url)}</a
                >
              </td>
              <td>
                <a href={image.creatorUrl} target="_blank" rel="external noreferrer"
                  >{image.creator}</a
                >
              </td>
              <td>
                <a href={image.licenseUrl} target="_blank" rel="external noreferrer"
                  >{image.license}</a
                >
              </td>
              <td>
                <a href={image.sourceUrl} target="_blank" rel="external noreferrer">
                  {sourceNameFor(image.sourceUrl)}
                </a>
              </td>
            </tr>
          {/each}
          {#each bird.sounds as sound (sound.id)}
            {@const manifestAsset = manifestByUrl.get(sound.url)}
            <tr>
              <th scope="row" class="credits-bird">
                <span>{bird.name}</span>
                <small>{bird.scientificName}</small>
              </th>
              <td>
                <div class="credits-resource credits-audio-resource">
                  <audio
                    controls
                    preload="none"
                    src={assetUrl(sound.url)}
                    aria-label={`Play ${bird.name} ${sound.kind}: ${sound.title}`}
                  >
                    <a href={localAssetUrl(sound.url)} target="_blank" rel="external noreferrer"
                      >Play {sound.title}</a
                    >
                  </audio>
                  <div>
                    <strong>{sound.title}</strong>
                    <span class="credits-kind">{sound.kind}</span>
                  </div>
                </div>
              </td>
              <td>
                <a
                  class="credits-asset-link"
                  href={localAssetUrl(sound.url)}
                  target="_blank"
                  rel="external noreferrer">{fileName(sound.url)}</a
                >
                {#if manifestAsset}<small class="credits-mime">{manifestAsset.mime}</small>{/if}
              </td>
              <td>{sound.recordist}</td>
              <td>
                <a href={sound.licenseUrl} target="_blank" rel="external noreferrer"
                  >{sound.license}</a
                >
              </td>
              <td>
                <a href={sound.sourceUrl} target="_blank" rel="external noreferrer">
                  {sourceNameFor(sound.sourceUrl)}
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>
</main>
