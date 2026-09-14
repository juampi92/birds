# birds

An English-language, mobile-first SvelteKit PWA for practising common garden birds by sound and photograph.

## Run locally

```sh
npm install
npm run dev
```

The root scripts are intentionally small. Use `npm run check` for the complete contributor check (Svelte diagnostics, lint, formatting, and tests), `npm run format` to apply formatting, and `npm run build` to validate media, regenerate its manifest, and create the static GitHub Pages site in `build/`. Run `npm run media` when reviewed assets need to be downloaded or refreshed.

## Local back-office

The separate asset desk lives in `back-office/` and has its own command:

```sh
npm run back-office
```

Open `http://localhost:5174`. It reads and manually saves the shared
`static/media/catalog.json` file, which is also the source consumed by the Svelte
app. The editor can rename an existing bird or remove existing pictures and
recordings from the catalogue. Bird IDs, bird count, and the ability to add
birds or media are intentionally locked.

## Content before launch

The gameplay is complete, and the launch catalogue contains 14 active species. Silhouette modes have been removed; visual questions use self-hosted photographs from reviewed Wikimedia Commons files. Reviewed photographs for every active species are downloaded into `static/media/photos`, with creator, source page and licence metadata in the reveal view. Nine species currently have reviewed local recordings under `static/media/sounds`; the remaining five are intentionally visual-only and are skipped for sound questions. These downloaded directories are intentionally ignored by Git.

Run `npm run media` with network access to resume all reviewed media downloads, validate the complete set, and regenerate the manifest. The sound downloader accepts reviewed Commons and direct Xeno-canto sources in MP3, Ogg or WAV format, validates the allowed licence set, retries rate limits and falls back to Wikimedia's official FilePath endpoint or the matching Xeno-canto source when appropriate. `npm run build` runs the validation and manifest steps automatically but never downloads media.

## GitHub Pages media workflow

`.github/workflows/deploy.yml` restores a GitHub Actions cache for the reviewed
`static/media/photos` and `static/media/sounds` directories, logs the cache key and
each restored file, downloads only missing or invalid files, validates the complete
set, and publishes those files as part of the Pages artifact. The cache is restored
into a staging directory and merged only for missing or invalid files, so it cannot
replace a newer checked-in recording. It then saves a content-addressed cache entry;
the stable restore prefixes allow later deploys to reuse the latest immutable cache
entry without downloading the same files again.

The cache also carries a small source fingerprint index outside the published
artifact. When a broad cache prefix is used after the media catalogue grows,
the downloaders reuse only files whose source metadata and digest still match;
changed files are fetched again. A cache-save step runs after downloading even if
validation later fails, so a rate-limited run can resume its partial progress.

The media step writes a deterministic `static/media-manifest.json`.
Each entry includes its byte count, SHA-256 digest, MIME type, original URL and a
digest-query `versionedUrl`. The service worker can use this manifest to keep
unchanged recordings offline while refreshing a recording whose bytes changed.

GitHub Pages publishes a static artifact. The workflow cannot choose response
`Cache-Control` headers, so long lived browser reuse is provided by the service
worker and digest-versioned media URLs. GitHub Pages has a published-site size
limit of 1 GB and a soft bandwidth limit of 100 GB/month; this project currently
ships roughly 76 MB of local media. The cache does not count as Pages storage and
is not available to the next runner unless a cache restore succeeds.

The workflow uses `actions/configure-pages` for Pages metadata, but this deployment
builds with the explicit `BASE_PATH=/birds`. The repository must be named `birds`
and must remain a project site. Configure `barreto.jp` on the owner or
organisation's user Pages site, not on this project repository, so the project is
served at `https://barreto.jp/birds/`. Enable Pages for this repository with
“GitHub Actions” as its source, then push to `main` or run the workflow manually.
