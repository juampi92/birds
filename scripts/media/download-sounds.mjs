import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { inspectMediaFile } from '../utils/media-file.mjs';
import {
  loadMediaCacheIndex,
  isReusableCacheEntry,
  recordCacheEntry,
  saveMediaCacheIndex
} from '../utils/media-cache.mjs';

const catalog = JSON.parse(
  await readFile(join(process.cwd(), 'static', 'media', 'catalog.json'), 'utf8')
);
const allowed = new Set([
  'CC0 1.0',
  'Public domain',
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC BY-SA 3.0',
  'CC BY-SA 2.0',
  'CC BY-NC-SA 4.0',
  'CC BY-NC-ND 4.0'
]);
const outputDir = join(process.cwd(), 'static', 'media', 'sounds');
await mkdir(outputDir, { recursive: true });
const cacheIndex = await loadMediaCacheIndex();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const selectedIds = process.env.SOUND_IDS?.split(',').filter(Boolean);
const execFile = promisify(execFileCallback);
const standardAudioTransform = 'opus-128k-vbr:ogg:max-duration-60s:v1';
const noDerivativesAudioTransform = 'opus-128k-vbr:ogg:full-duration:v1';

function isNoDerivatives(sound) {
  return sound.license === 'CC BY-NC-ND 4.0';
}

function localFileFor(sound) {
  const prefix = '/media/sounds/';
  if (typeof sound.url !== 'string' || !sound.url.startsWith(prefix))
    throw new Error(`Sound URL must be a local media path for ${sound.id}`);
  const localFile = sound.url.slice(prefix.length);
  if (!localFile || localFile.includes('/') || extname(localFile).toLowerCase() !== '.ogg')
    throw new Error(`Sound URL must name a top-level .ogg file for ${sound.id}`);
  return localFile;
}

function sourceFileFor(sound) {
  const urlExtension = extname(new URL(sound.downloadUrl).pathname);
  const extension = urlExtension || extname(sound.title);
  if (!['.flac', '.mp3', '.ogg', '.wav'].includes(extension.toLowerCase()))
    throw new Error(`Cannot determine the source audio format for ${sound.id}`);
  return `${basename(sound.localFile, extname(sound.localFile))}${extension.toLowerCase()}`;
}

const sounds = catalog.birds.flatMap((bird) =>
  bird.sounds.map((sound) => ({ ...sound, birdId: bird.id, localFile: localFileFor(sound) }))
);

async function probeWebOgg(path, maxDuration = 60.01) {
  try {
    const { stdout } = await execFile('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name:format=duration',
      '-of',
      'json',
      path
    ]);
    const probe = JSON.parse(stdout);
    const duration = Number(probe.format?.duration);
    return (
      probe.streams?.[0]?.codec_name === 'opus' &&
      duration > 0 &&
      (maxDuration === null || duration <= maxDuration)
    );
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error('ffprobe is required to validate downloaded sounds. Install ffmpeg first.', {
        cause: error
      });
    return false;
  }
}

async function convertToWebOgg(source, destination, soundId, preserveFullDuration = false) {
  const temporary = join(outputDir, `.${soundId}-${process.pid}.ogg`);
  try {
    const durationArgs = preserveFullDuration ? [] : ['-t', '60'];
    const metadataArgs = preserveFullDuration ? [] : ['-map_metadata', '-1'];
    await execFile('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      source,
      '-map',
      '0:a:0',
      '-vn',
      ...durationArgs,
      '-c:a',
      'libopus',
      '-b:a',
      '128k',
      '-vbr',
      'on',
      '-compression_level',
      '10',
      '-application',
      'audio',
      '-frame_duration',
      '20',
      ...metadataArgs,
      '-fflags',
      '+bitexact',
      temporary
    ]);
    if (!(await probeWebOgg(temporary, preserveFullDuration ? null : 60.01)))
      throw new Error(
        `ffmpeg did not produce a valid ${preserveFullDuration ? 'full-duration ' : '<=60 second '}Ogg Opus file for ${soundId}`
      );
    await rename(temporary, destination);
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error('ffmpeg is required to prepare downloaded sounds. Install ffmpeg first.', {
        cause: error
      });
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

for (const sound of sounds.filter((item) => !selectedIds || selectedIds.includes(item.id))) {
  if (!allowed.has(sound.license))
    throw new Error(`Licence requires review for ${sound.id}: ${sound.license}`);
  const destination = join(outputDir, sound.localFile);
  const sourceFile = sourceFileFor(sound);
  const existingSource = join(outputDir, sourceFile);
  const legacyFlacSource = join(
    outputDir,
    `${basename(sound.localFile, extname(sound.localFile))}.flac`
  );
  const sourceCandidates = [...new Set([existingSource, legacyFlacSource])];
  const preserveFullDuration = isNoDerivatives(sound);
  const cacheItem = {
    ...sound,
    transform: preserveFullDuration ? noDerivativesAudioTransform : standardAudioTransform
  };
  const existing = await inspectMediaFile(destination, 'sound');
  if (
    isReusableCacheEntry(cacheIndex, cacheItem, existing) &&
    (await probeWebOgg(destination, preserveFullDuration ? null : 60.01))
  ) {
    recordCacheEntry(cacheIndex, cacheItem, existing);
    for (const sourceCandidate of sourceCandidates) {
      if (sourceCandidate !== destination) {
        delete cacheIndex.files[relative(outputDir, sourceCandidate)];
        await rm(sourceCandidate, { force: true });
      }
    }
    await saveMediaCacheIndex(cacheIndex);
    if (sourceFile !== sound.localFile) await rm(existingSource, { force: true });
    console.log(`${sound.id}: already prepared`);
    continue;
  }

  let downloadedSource;
  let existingSourcePath;
  for (const sourceCandidate of sourceCandidates) {
    const sourceInspection = await inspectMediaFile(sourceCandidate, 'sound');
    if (sourceInspection.valid) {
      downloadedSource = sourceCandidate;
      existingSourcePath = sourceCandidate;
      console.log(
        `${sound.id}: using existing ${sourceCandidate === legacyFlacSource ? 'prepared FLAC' : 'download'}`
      );
      break;
    }
  }

  let response;
  const xenoId = sound.title.match(/\bXC(\d+)\b/i)?.[1];
  if (!downloadedSource && process.env.SOUND_SOURCE === 'xeno' && !xenoId) continue;
  if (!downloadedSource && process.env.SOUND_SOURCE === 'xeno' && xenoId) {
    response = await fetch(`https://xeno-canto.org/${xenoId}/download`, {
      headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
    });
    if (response.ok) console.log(`${sound.id}: using Xeno-canto source fallback`);
  } else if (!downloadedSource) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await fetch(sound.downloadUrl, {
        headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
      });
      if (response.ok) break;
      if (response.status !== 429)
        throw new Error(`${response.status} while downloading ${sound.id}`);
      await wait(3000 * (attempt + 1));
    }
  }
  if (!downloadedSource && !response?.ok) {
    const fallbackUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(sound.title)}`;
    response = await fetch(fallbackUrl, {
      headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
    });
    if (response.ok) console.log(`${sound.id}: using Commons FilePath fallback`);
  }
  // Commons also hosts the Xeno-canto uploads, but its upload CDN can temporarily
  // rate-limit bulk downloads. The recording ID in the title identifies the same
  // source file at Xeno-canto, so use that build-time fallback while keeping the
  // Commons attribution and source page in the manifest.
  if (!downloadedSource && !response?.ok) {
    if (xenoId) {
      response = await fetch(`https://xeno-canto.org/${xenoId}/download`, {
        headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
      });
      if (response.ok) console.log(`${sound.id}: using Xeno-canto source fallback`);
    }
  }
  if (!downloadedSource && !response?.ok) {
    console.error(`${sound.id}: skipped after repeated rate limiting; rerun later`);
    continue;
  }
  let downloadedBytes = 0;
  if (!downloadedSource) {
    const bytes = Buffer.from(await response.arrayBuffer());
    downloadedBytes = bytes.length;
    const downloadPath = join(outputDir, `.${sound.id}-${process.pid}.download`);
    await writeFile(downloadPath, bytes);
    const downloaded = await inspectMediaFile(downloadPath, 'sound');
    if (!downloaded.valid) {
      await rm(downloadPath, { force: true });
      throw new Error(`Downloaded file is not recognised audio for ${sound.id}`);
    }
    downloadedSource = downloadPath;
  }

  try {
    await convertToWebOgg(downloadedSource, destination, sound.id, preserveFullDuration);
  } finally {
    if (!existingSourcePath) await rm(downloadedSource, { force: true });
  }
  const inspection = await inspectMediaFile(destination, 'sound');
  recordCacheEntry(cacheIndex, cacheItem, inspection);
  for (const sourceCandidate of sourceCandidates) {
    if (sourceCandidate !== destination) {
      delete cacheIndex.files[relative(outputDir, sourceCandidate)];
      await rm(sourceCandidate, { force: true });
    }
  }
  await saveMediaCacheIndex(cacheIndex);
  if (sourceFile !== sound.localFile) await rm(existingSource, { force: true });
  console.log(
    `${sound.id}: ${inspection.bytes} byte Ogg Opus${downloadedBytes ? ` from ${downloadedBytes} downloaded bytes` : ''} (${sound.license})`
  );
  if (downloadedBytes) await wait(1200);
}
