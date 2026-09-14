import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectMediaFile } from '../utils/media-file.mjs';

const root = process.cwd();
const maxMediaFileBytes = 50 * 1024 * 1024;
const maxMediaBytes = 250 * 1024 * 1024;
const catalog = await readFile(join(root, 'static', 'media', 'catalog.json'), 'utf8').then(
  JSON.parse
);
const birdIds = new Set();
const soundIds = new Set();
const allowedSoundLicences = new Set([
  'CC0 1.0',
  'Public domain',
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC BY-SA 3.0',
  'CC BY-SA 2.0',
  'CC BY-NC-SA 4.0',
  'CC BY-NC-ND 4.0'
]);
const expectedPhotos = new Set();
const expectedSounds = new Set();
let mediaBytes = 0;

async function filesUnder(directory, prefix = '') {
  let entries;
  try {
    entries = await readdir(join(directory, prefix), { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(directory, relativePath)));
    else if (entry.isFile() && !entry.name.startsWith('.')) files.push(relativePath);
  }
  return files;
}

async function validateFile(path, kind, label) {
  const inspection = await inspectMediaFile(path, kind);
  if (!inspection.valid) throw new Error(`Invalid or missing ${kind} for ${label}`);
  if (inspection.bytes >= maxMediaFileBytes)
    throw new Error(
      `${kind} exceeds the 50 MiB per-file limit for ${label}: ${inspection.bytes} bytes`
    );
  mediaBytes += inspection.bytes;
}

for (const bird of catalog.birds) {
  if (birdIds.has(bird.id)) throw new Error(`Duplicate bird ${bird.id}`);
  birdIds.add(bird.id);
  const imageIds = new Set();
  for (const [imageIndex, image] of bird.images.entries()) {
    if (imageIds.has(image.id)) throw new Error(`Duplicate image ${image.id}`);
    imageIds.add(image.id);
    for (const field of [
      'id',
      'url',
      'title',
      'imageUrl',
      'sourceUrl',
      'creator',
      'creatorUrl',
      'license',
      'licenseUrl',
      'dimensions',
      'identityNote'
    ]) {
      if (!image[field]) throw new Error(`Missing image ${field} for ${bird.id}`);
    }
    const expectedUrl = `/media/photos/${bird.id}-${imageIndex + 1}.webp`;
    if (image.url !== expectedUrl)
      throw new Error(`Image filename mismatch for ${image.id}: ${image.url} != ${expectedUrl}`);
    expectedPhotos.add(image.url.replace(/^\/media\/photos\//, ''));
    const file = image.url.replace(/^\/media\//, '');
    await validateFile(join(root, 'static', 'media', file), 'photo', `${bird.id}: ${image.url}`);
  }
  for (const sound of bird.sounds) {
    if (soundIds.has(sound.id)) throw new Error(`Duplicate sound ${sound.id}`);
    soundIds.add(sound.id);
    for (const field of [
      'id',
      'kind',
      'title',
      'url',
      'downloadUrl',
      'sourceUrl',
      'recordist',
      'license',
      'licenseUrl',
      'description'
    ]) {
      if (!sound[field]) throw new Error(`Missing sound ${field} for ${sound.id ?? 'unknown'}`);
    }
    try {
      const downloadUrl = new URL(sound.downloadUrl);
      if (!['http:', 'https:'].includes(downloadUrl.protocol))
        throw new Error('unsupported scheme');
    } catch {
      throw new Error(`Invalid sound download URL for ${sound.id}: ${sound.downloadUrl}`);
    }
    if (!allowedSoundLicences.has(sound.license))
      throw new Error(`Licence requires review for ${sound.id}: ${sound.license}`);
    const localFile = sound.url.replace(/^\/media\/sounds\//, '');
    if (!localFile || localFile.includes('/') || !localFile.endsWith('.ogg'))
      throw new Error(`Sound URL must name a top-level .ogg file for ${sound.id}`);
    const file = sound.url.replace(/^\/media\//, '');
    expectedSounds.add(sound.url.replace(/^\/media\/sounds\//, ''));
    await validateFile(join(root, 'static', 'media', file), 'sound', `${bird.id}: ${sound.url}`);
  }
}

for (const [directory, expected] of [
  ['photos', expectedPhotos],
  ['sounds', expectedSounds]
]) {
  const actual = new Set(await filesUnder(join(root, 'static', 'media', directory)));
  const unexpected = [...actual].filter((file) => !expected.has(file));
  if (unexpected.length)
    throw new Error(`Unreferenced ${directory} file(s): ${unexpected.sort().join(', ')}`);
  const missing = [...expected].filter((file) => !actual.has(file));
  if (missing.length) throw new Error(`Missing ${directory} file(s): ${missing.sort().join(', ')}`);
}

if (mediaBytes >= maxMediaBytes)
  throw new Error(`Reviewed media exceeds the 250 MiB aggregate limit: ${mediaBytes} bytes`);

console.log(
  `Validated ${catalog.birds.length} birds, ${expectedPhotos.size} photos and ${expectedSounds.size} recordings (${mediaBytes} bytes).`
);
