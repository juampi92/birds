# Development and collaboration

This document covers local setup, development commands, and the workflow for changing the project. The product overview is in [README.md](README.md).

## Install

Requirements:

- Node.js and npm
- Network access if you need to add or refresh reviewed media

Install the locked dependencies from the repository root:

```sh
npm install
```

## Run locally

Start the SvelteKit development server:

```sh
npm run dev
```

To run the local media catalogue editor as well:

```sh
npm run back-office
```

Then open `http://localhost:5174`. The back office reads and saves `static/media/catalog.json`, which is also the catalogue consumed by the app.

Other useful commands:

```sh
npm run check          # Diagnostics, lint, formatting check, and the full test suite
npm test               # Full Vitest suite (supports filters after --)
npm run format         # Format the project
npm run media          # Download, validate, and prepare reviewed media
npm run build          # Validate media, generate the manifest, and build the site
npm run preview        # Preview the production build locally
```

## Media workflow

Reviewed media is self-hosted and committed so the deployed PWA can work offline and builds remain deterministic. Before changing an asset, verify its source page, creator or recordist, and licence. Keep that information in the catalogue and preserve the source decision in `static/media/source-review.json` when applicable. Commit the prepared binary together with its catalogue and attribution changes; media retain their individual licences and are not covered by the application’s MIT licence.

To add or refresh reviewed downloads, validate the catalogue, and regenerate the manifest:

```sh
npm run media
```

The build runs media validation and manifest generation automatically. Do not replace a reviewed asset with a new file without updating its attribution metadata and checking the licence allowlist used by the download scripts. To replace an existing prepared file, remove that target from `static/media/photos` or `static/media/sounds`, then run the focused downloader with `IMAGE_IDS` or `SOUND_IDS`. Invoke the corresponding downloader directly with `node scripts/media/download-images.mjs` or `node scripts/media/download-sounds.mjs` when needed.
Validation rejects unreferenced files, media at or above 50 MiB per file, and a
library at or above 250 MiB; approaching the aggregate limit requires revisiting
the storage strategy before adding more assets.

## Collaboration workflow

1. Create a focused branch for the change.
2. Keep source changes, catalogue edits, and attribution updates together when they are part of the same change.
3. Run `npm run check` and `npm run build`.
4. Review the rendered app and any changed credits before opening a pull request.
5. Describe user-visible changes, media provenance changes, and the checks you ran in the pull request.

Generated build output belongs to the deployment process. Prefer changing the source files, catalogue, or scripts that produce it rather than hand-editing generated files.
