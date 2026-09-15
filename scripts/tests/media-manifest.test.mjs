import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { it } from 'vitest';

const execFile = promisify(execFileCallback);
const generator = resolve(process.cwd(), 'scripts/media/generate-media-manifest.mjs');
const validator = resolve(process.cwd(), 'scripts/media/validate-media-manifest.mjs');
const mediaRoot = resolve(process.cwd(), 'static/media');

async function withFixture(test) {
  const fixture = await mkdtemp(join(tmpdir(), 'birds-media-manifest-'));
  try {
    await cp(mediaRoot, join(fixture, 'static/media'), { recursive: true });
    await execFile(process.execPath, [generator], { cwd: fixture });
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

it('accepts a generated manifest and its reviewed assets', async () => {
  await withFixture(async (fixture) => {
    const result = await execFile(process.execPath, [validator], { cwd: fixture });
    assert.match(result.stdout, /Validated media manifest \(\d+ assets, \d+ photos, \d+ sounds/);
  });
});

it('rejects a manifest whose asset hash is stale', async () => {
  await withFixture(async (fixture) => {
    const path = join(fixture, 'static/media-manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.assets[0].sha256 = '0'.repeat(64);
    await writeFile(path, `${JSON.stringify(manifest)}\n`);
    await validationError(fixture);
  });
});

it('rejects a manifest that omits a reviewed asset', async () => {
  await withFixture(async (fixture) => {
    const manifestPath = join(fixture, 'static/media-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const removed = manifest.assets.pop();
    manifest.totals.assets -= 1;
    manifest.totals[removed.kind === 'photo' ? 'photos' : 'sounds'] -= 1;
    manifest.totals.bytes -= removed.bytes;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await validationError(fixture);
  });
});

it('rejects a manifest with an extra asset entry', async () => {
  await withFixture(async (fixture) => {
    const path = join(fixture, 'static/media-manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.assets.push({ ...manifest.assets[0] });
    await writeFile(path, `${JSON.stringify(manifest)}\n`);
    await validationError(fixture);
  });
});

it('rejects a manifest whose reviewed file is missing', async () => {
  await withFixture(async (fixture) => {
    await unlink(join(fixture, 'static/media/photos/robin-1.webp'));
    await validationError(fixture);
  });
});

it('rejects a manifest with incorrect totals', async () => {
  await withFixture(async (fixture) => {
    const path = join(fixture, 'static/media-manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.totals.bytes += 1;
    await writeFile(path, `${JSON.stringify(manifest)}\n`);
    await validationError(fixture);
  });
});

it('rejects a manifest with an incorrect version', async () => {
  await withFixture(async (fixture) => {
    const path = join(fixture, 'static/media-manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.version = '0'.repeat(64);
    await writeFile(path, `${JSON.stringify(manifest)}\n`);
    await validationError(fixture);
  });
});
