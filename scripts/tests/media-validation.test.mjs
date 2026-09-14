import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, truncate, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { it } from 'vitest';

const execFile = promisify(execFileCallback);
const validator = resolve(process.cwd(), 'scripts/media/validate-media.mjs');
const mediaRoot = resolve(process.cwd(), 'static/media');

async function withFixture(test) {
  const fixture = await mkdtemp(join(tmpdir(), 'birds-media-validation-'));
  try {
    await cp(mediaRoot, join(fixture, 'static/media'), { recursive: true });
    await test(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function validationError(fixture) {
  await assert.rejects(
    () => execFile(process.execPath, [validator], { cwd: fixture }),
    (error) => error?.code === 1 && typeof error?.stderr === 'string'
  );
}

it('rejects a catalogue entry whose committed file is missing', async () => {
  await withFixture(async (fixture) => {
    await unlink(join(fixture, 'static/media/photos/robin-1.webp'));
    await validationError(fixture);
  });
});

it('rejects an unreferenced committed media file', async () => {
  await withFixture(async (fixture) => {
    await writeFile(join(fixture, 'static/media/photos/orphan.webp'), Buffer.from('RIFF0000WEBP'));
    await validationError(fixture);
  });
});

it('rejects a media file at the per-file size limit', async () => {
  await withFixture(async (fixture) => {
    const oversized = join(fixture, 'static/media/photos/robin-1.webp');
    await writeFile(oversized, Buffer.from('RIFF0000WEBP'));
    await truncate(oversized, 50 * 1024 * 1024);
    await validationError(fixture);
  });
});

it('rejects a catalogue sound without its direct download URL', async () => {
  await withFixture(async (fixture) => {
    const catalogPath = join(fixture, 'static/media/catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    delete catalog.birds.find((bird) => bird.sounds.length)?.sounds[0].downloadUrl;
    await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`);
    await validationError(fixture);
  });
});
