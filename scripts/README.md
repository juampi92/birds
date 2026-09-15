# Script layout

The root `npm` commands are the public interface for local development. Their
multi-step implementations live under `commands/` and use the shared runner in
`utils/`.

- `commands/` — orchestration for `npm run check`, `npm run media`, and `npm run build`.
- `media/` — reviewed image and sound downloaders, catalogue validation, and manifest generation/validation.
- `utils/` — reusable media inspection, local preparation indexing, and child-process helpers.
- `tests/` — Vitest suites covering application, media preparation, and offline-client behavior.

Use `npm run media` for the complete local media workflow. For a focused asset download,
invoke the relevant script in `media/` with `IMAGE_IDS` or `SOUND_IDS` set. Existing
prepared files are reused when their local preparation index still matches the reviewed
source and recipe; remove the target file before a deliberate replacement. `IMAGE_IDS`
accepts either bird IDs or individual image IDs. Photos are prepared as normalized 768px
square WebP files; recordings are prepared as Ogg Opus.
