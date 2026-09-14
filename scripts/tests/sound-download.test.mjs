// Intentional integration coverage for the reviewed sound downloader:
// transcoding, the 60-second cap, source cleanup, and local preparation reuse.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { inspectMediaFile } from '../utils/media-file.mjs';

const execFile = promisify(execFileCallback);

function silentWav(durationSeconds, sampleRate = 8000) {
  const samples = Math.ceil(durationSeconds * sampleRate);
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

it('prepares recordings as reusable, capped Ogg Opus files', { timeout: 30_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'birds-sound-download-'));
  const soundsDirectory = join(fixture, 'static', 'media', 'sounds');
  const source = join(soundsDirectory, 'fixture.wav');
  const destination = join(soundsDirectory, 'fixture.ogg');
  try {
    await mkdir(soundsDirectory, { recursive: true });
    await writeFile(
      join(fixture, 'static', 'media', 'catalog.json'),
      JSON.stringify({
        birds: [
          {
            id: 'fixture-bird',
            images: [],
            sounds: [
              {
                id: 'fixture',
                kind: 'call',
                title: 'fixture.wav',
                url: '/media/sounds/fixture.ogg',
                downloadUrl: 'https://example.invalid/fixture.wav',
                sourceUrl: 'https://example.invalid/source',
                recordist: 'Fixture',
                license: 'CC0 1.0',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                description: 'Downloader integration fixture.'
              }
            ]
          }
        ]
      })
    );
    await writeFile(source, silentWav(61.25));

    const downloader = resolve(process.cwd(), 'scripts', 'media', 'download-sounds.mjs');
    const firstRun = await execFile(process.execPath, [downloader], { cwd: fixture });
    assert.match(firstRun.stdout, /using existing download/);
    assert.equal((await inspectMediaFile(destination, 'sound')).valid, true);
    await assert.rejects(() => stat(source), { code: 'ENOENT' });

    const { stdout: probeOutput } = await execFile('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name:format=duration',
      '-of',
      'json',
      destination
    ]);
    const probe = JSON.parse(probeOutput);
    assert.equal(probe.streams[0].codec_name, 'opus');
    assert.ok(Number(probe.format.duration) <= 60.01, 'prepared audio must not exceed 60 seconds');

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

it('preserves the full duration of NoDerivatives recordings', { timeout: 30_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'birds-sound-download-nd-'));
  const soundsDirectory = join(fixture, 'static', 'media', 'sounds');
  const source = join(soundsDirectory, 'fixture-nd.wav');
  const destination = join(soundsDirectory, 'fixture-nd.ogg');
  try {
    await mkdir(soundsDirectory, { recursive: true });
    await writeFile(
      join(fixture, 'static', 'media', 'catalog.json'),
      JSON.stringify({
        birds: [
          {
            id: 'fixture-bird',
            images: [],
            sounds: [
              {
                id: 'fixture-nd',
                kind: 'call',
                title: 'fixture-nd.wav',
                url: '/media/sounds/fixture-nd.ogg',
                downloadUrl: 'https://example.invalid/fixture-nd.wav',
                sourceUrl: 'https://example.invalid/source',
                recordist: 'Fixture',
                license: 'CC BY-NC-ND 4.0',
                licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
                description: 'NoDerivatives downloader integration fixture.'
              }
            ]
          }
        ]
      })
    );
    await writeFile(source, silentWav(61.25));

    const downloader = resolve(process.cwd(), 'scripts', 'media', 'download-sounds.mjs');
    await execFile(process.execPath, [downloader], { cwd: fixture });

    const { stdout: probeOutput } = await execFile('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      destination
    ]);
    const duration = Number(JSON.parse(probeOutput).format.duration);
    assert.ok(duration >= 61.2, 'NoDerivatives recording must not be truncated');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
