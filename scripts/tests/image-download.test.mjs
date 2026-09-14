// Intentional integration coverage for the reviewed image downloader:
// square WebP preparation, normalized naming, temporary-file cleanup, and cache reuse.
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { it } from 'vitest';
import { inspectMediaFile } from '../utils/media-file.mjs';

const execFile = promisify(execFileCallback);

it('prepares photos as reusable, normalized square WebP files', { timeout: 30_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'birds-image-download-'));
  const mediaDirectory = join(fixture, 'static', 'media');
  const photosDirectory = join(mediaDirectory, 'photos');
  const source = join(fixture, 'fixture.jpg');
  const destination = join(photosDirectory, 'fixture-bird-1.webp');
  try {
    await mkdir(photosDirectory, { recursive: true });
    await execFile('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1200x800:rate=1',
      '-frames:v',
      '1',
      source
    ]);
    const sourceUrl = `data:image/jpeg;base64,${(await readFile(source)).toString('base64')}`;
    await writeFile(
      join(mediaDirectory, 'catalog.json'),
      JSON.stringify({
        birds: [
          {
            id: 'fixture-bird',
            images: [
              {
                id: 'fixture-image',
                url: '/media/photos/fixture-bird-1.webp',
                title: 'fixture.jpg',
                imageUrl: sourceUrl,
                sourceUrl: 'https://example.invalid/source',
                creator: 'Fixture',
                creatorUrl: 'https://example.invalid/creator',
                license: 'CC0 1.0',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                dimensions: '1200x800',
                identityNote: 'Downloader integration fixture.'
              }
            ]
          }
        ]
      })
    );

    const downloader = resolve(process.cwd(), 'scripts', 'media', 'download-images.mjs');
    const firstRun = await execFile(process.execPath, [downloader], { cwd: fixture });
    assert.match(firstRun.stdout, /768px WebP/);
    assert.equal((await inspectMediaFile(destination, 'photo')).valid, true);
    assert.deepEqual(await readdir(photosDirectory), ['fixture-bird-1.webp']);

    const { stdout: probeOutput } = await execFile('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height',
      '-of',
      'json',
      destination
    ]);
    assert.deepEqual(JSON.parse(probeOutput).streams[0], {
      codec_name: 'webp',
      width: 768,
      height: 768
    });

    const before = await stat(destination);
    const beforeBytes = await readFile(destination);
    const secondRun = await execFile(process.execPath, [downloader], { cwd: fixture });
    const after = await stat(destination);
    assert.match(secondRun.stdout, /already prepared/);
    assert.equal(after.mtimeMs, before.mtimeMs, 'cache hit must not rewrite the prepared file');
    assert.deepEqual(
      await readFile(destination),
      beforeBytes,
      'cache hit must preserve exact bytes'
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
