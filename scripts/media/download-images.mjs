import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  'CC BY 3.0',
  'CC BY 2.0',
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC BY-SA 3.0',
  'CC BY-SA 2.5',
  'CC BY-SA 2.0',
  'CC BY 2.0 France'
]);
const outputDir = join(process.cwd(), 'static', 'media', 'photos');
await mkdir(outputDir, { recursive: true });
const cacheIndex = await loadMediaCacheIndex();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const selectedIds = process.env.IMAGE_IDS?.split(',').filter(Boolean);
const execFile = promisify(execFileCallback);
const photoSize = 768;
const photoQuality = 82;
const photoTransform = `webp-${photoSize}x${photoSize}-cover:q${photoQuality}:v1`;

async function probeWebPhoto(path) {
  try {
    const { stdout } = await execFile('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height',
      '-of',
      'json',
      path
    ]);
    const stream = JSON.parse(stdout).streams?.[0];
    return (
      stream?.codec_name === 'webp' && stream.width === photoSize && stream.height === photoSize
    );
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error('ffprobe is required to validate downloaded photos. Install ffmpeg first.', {
        cause: error
      });
    return false;
  }
}

async function prepareWebPhoto(source, destination, imageId) {
  const temporary = join(outputDir, `.${imageId}-${process.pid}.webp`);
  try {
    await execFile('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      source,
      '-map',
      '0:v:0',
      '-vf',
      `scale=${photoSize}:${photoSize}:force_original_aspect_ratio=increase:flags=lanczos,crop=${photoSize}:${photoSize}`,
      '-frames:v',
      '1',
      '-an',
      '-map_metadata',
      '-1',
      '-c:v',
      'libwebp',
      '-preset',
      'picture',
      '-quality',
      String(photoQuality),
      '-compression_level',
      '6',
      temporary
    ]);
    if (!(await probeWebPhoto(temporary)))
      throw new Error(`ffmpeg did not produce a valid ${photoSize}px square WebP for ${imageId}`);
    await rename(temporary, destination);
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error('ffmpeg is required to prepare downloaded photos. Install ffmpeg first.', {
        cause: error
      });
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

function commonsThumbnailUrl(image) {
  const source = new URL(image.imageUrl);
  if (source.hostname !== 'upload.wikimedia.org') return null;
  const marker = '/wikipedia/commons/';
  if (!source.pathname.startsWith(marker)) return null;
  const relativePath = source.pathname.slice(marker.length);
  const filename = relativePath.split('/').at(-1);
  const declaredWidth = Number.parseInt(image.dimensions, 10);
  const width = Number.isFinite(declaredWidth) ? Math.min(1280, declaredWidth) : 1280;
  return `https://upload.wikimedia.org${marker}thumb/${relativePath}/${width}px-${filename}`;
}

for (const bird of catalog.birds) {
  for (const [imageIndex, image] of bird.images.entries()) {
    if (selectedIds && !selectedIds.includes(bird.id) && !selectedIds.includes(image.id)) continue;
    const expectedLocalFile = `${bird.id}-${imageIndex + 1}.webp`;
    const expectedUrl = `/media/photos/${expectedLocalFile}`;
    if (image.url !== expectedUrl)
      throw new Error(
        `Photo filename must be normalized for ${image.id}: ${image.url} != ${expectedUrl}`
      );
    if (!allowed.has(image.license))
      throw new Error(`Licence requires review for ${image.id}: ${image.license}`);
    const destination = join(outputDir, expectedLocalFile);
    const item = {
      ...image,
      localFile: expectedLocalFile,
      downloadUrl: image.imageUrl,
      transform: photoTransform
    };
    const existing = await inspectMediaFile(destination, 'photo');
    if (isReusableCacheEntry(cacheIndex, item, existing) && (await probeWebPhoto(destination))) {
      recordCacheEntry(cacheIndex, item, existing);
      await saveMediaCacheIndex(cacheIndex);
      console.log(`${image.id}: already prepared`);
      continue;
    }
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(image.imageUrl, {
        headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
      });
      if (response.ok) break;
      if (response.status !== 429)
        throw new Error(`${response.status} while downloading ${image.id}`);
      await wait(2000 * (attempt + 1));
    }
    if (!response?.ok && image.sourceUrl.includes('commons.wikimedia.org')) {
      const thumbnailUrl = commonsThumbnailUrl(image);
      if (thumbnailUrl) {
        response = await fetch(thumbnailUrl, {
          headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
        });
        if (response.ok) console.log(`${image.id}: using Commons thumbnail fallback`);
      }
    }
    if (!response?.ok && image.sourceUrl.includes('commons.wikimedia.org')) {
      // Commons can rate-limit the original upload host. The official FilePath
      // endpoint redirects to a resized Wikimedia thumbnail while preserving
      // the same source file and attribution.
      const fallbackUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.title)}?width=1280`;
      response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'birds-practice-media-downloader/1.0' }
      });
      if (response.ok) console.log(`${image.id}: using resized Commons FilePath fallback`);
    }
    if (!response?.ok) {
      console.error(`${image.id}: skipped after repeated rate limiting; rerun later`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const downloadPath = join(outputDir, `.${image.id}-${process.pid}.download`);
    await writeFile(downloadPath, bytes);
    const downloaded = await inspectMediaFile(downloadPath, 'photo');
    if (!downloaded.valid) {
      await rm(downloadPath, { force: true });
      throw new Error(`Downloaded file is not a recognised photo for ${image.id}`);
    }
    try {
      await prepareWebPhoto(downloadPath, destination, image.id);
    } finally {
      await rm(downloadPath, { force: true });
    }
    const inspection = await inspectMediaFile(destination, 'photo');
    recordCacheEntry(cacheIndex, item, inspection);
    await saveMediaCacheIndex(cacheIndex);
    console.log(
      `${image.id}: ${inspection.bytes} byte ${photoSize}px WebP from ${bytes.length} downloaded bytes (${image.license})`
    );
    await wait(1500);
  }
}
