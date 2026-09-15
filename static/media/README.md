# Media ingestion

The app uses the reviewed image records in `catalog.json` as its single source of truth.
They are stable original upload URLs with source pages, creators and licence metadata. A
generic “scientific name” search can resolve to a distribution map or unrelated file, so each
source is intentionally explicit. Optimized copies live in `photos/` and `sounds/`, are
committed to Git, and are served locally by the PWA. This keeps builds deterministic
and avoids requiring the Pages workflow to contact a source provider.

Run `npm run media` when adding or refreshing reviewed media. The image portion of the command
checks the licence allowlist, center-crops each reviewed source to the square presentation
used by the app, and writes a 768x768 WebP at quality 82. The 768px output is more than twice
the app's largest 320px photo presentation while keeping the offline download compact. It
uses the official Commons resized endpoint when the original upload host is rate-limited.
Files are named `<bird-id>-<one-based-index>.webp`. Every shipped photo still needs a final
visual identity and crop check before release.

Nine launch birds currently have at least one independent recording in `catalog.json`; five launch birds are intentionally visual-only.
The sound portion of the command converts each source
to Ogg Opus at 128 kbps VBR and capped at 60 seconds; unchanged prepared files are
reused from the local preparation index without another download or transcode. Every recording is
linked to its provider source page, recordist, direct download URL and exact licence in
`catalog.json`. Reviewed direct Xeno-canto downloads are
self-hosted with the other recordings, so the deployed app has no runtime dependency on
the provider.
For this non-commercial app, the reviewed sound allowlist also accepts CC BY-NC-SA 4.0
recordings when their attribution is kept with the local copy.
Reviewed CC BY-NC-ND 4.0 recordings are also permitted, but are format-converted only:
their complete duration is retained instead of applying the normal 60-second cap.
Do not use the generated planning mockup as a photograph source.

The media workflow produces `../media-manifest.json` from the committed local copies. The
deployment build validates that committed manifest against the local files instead of
regenerating it. The manifest is deterministic and records each file's SHA-256 digest, size,
MIME type and a digest-query URL so the PWA can identify unchanged files across deployments.
