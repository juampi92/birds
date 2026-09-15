import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const staticRoot = join(root, 'static');
const catalogPath = join(staticRoot, 'media', 'catalog.json');
const manifestPath = join(staticRoot, 'media-manifest.json');

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`, { cause: error });
  }
}

function fail(message) {
  throw new Error(`Invalid media manifest: ${message}`);
}

function canonicalAssetPath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('media/'))
    fail(`${label} must be a static media path`);
  const normalized = value.replaceAll('\\', '/');
  if (normalized !== value || normalized.includes('/../') || normalized.endsWith('/..'))
    fail(`${label} contains an unsafe path`);
  return normalized;
}

function expectedAssets(catalog) {
  const expected = new Map();
  for (const bird of catalog?.birds ?? []) {
    for (const image of bird.images ?? []) {
      const path = canonicalAssetPath(image.url?.replace(/^\//, ''), `catalog image ${image.id}`);
      if (expected.has(path)) fail(`catalog references ${path} more than once`);
      expected.set(path, { kind: 'photo' });
    }
    for (const sound of bird.sounds ?? []) {
      const path = canonicalAssetPath(sound.url?.replace(/^\//, ''), `catalog sound ${sound.id}`);
      if (expected.has(path)) fail(`catalog references ${path} more than once`);
      expected.set(path, { kind: 'sound' });
    }
  }
  return expected;
}

function assertVersion(manifest) {
  const canonical = JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    assets: manifest.assets,
    totals: manifest.totals
  });
  const version = createHash('sha256').update(canonical).digest('hex');
  if (manifest.version !== version)
    fail(`version ${manifest.version ?? '(missing)'} does not match manifest contents`);
}

async function validateMediaManifest() {
  const catalog = await readJson(catalogPath, 'the media catalogue');
  const manifest = await readJson(manifestPath, 'static/media-manifest.json');

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    fail('manifest must be an object');
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!Array.isArray(manifest.assets)) fail('assets must be an array');
  if (!manifest.totals || typeof manifest.totals !== 'object' || Array.isArray(manifest.totals))
    fail('totals must be an object');
  if (typeof manifest.version !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.version))
    fail('version must be a SHA-256 hex digest');

  const expected = expectedAssets(catalog);
  const seen = new Set();
  const totals = { assets: manifest.assets.length, photos: 0, sounds: 0, bytes: 0 };
  const paths = [];

  for (const [index, asset] of manifest.assets.entries()) {
    if (!asset || typeof asset !== 'object') fail(`asset ${index + 1} must be an object`);
    const path = canonicalAssetPath(asset.path, `asset ${index + 1} path`);
    if (seen.has(path)) fail(`asset ${path} appears more than once`);
    seen.add(path);
    paths.push(path);

    const expectedAsset = expected.get(path);
    if (!expectedAsset) fail(`asset ${path} is not referenced by the catalogue`);
    if (asset.kind !== expectedAsset.kind) fail(`asset ${path} has the wrong kind`);
    if (asset.url !== `/${path}`) fail(`asset ${path} has an incorrect url`);
    if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256))
      fail(`asset ${path} must contain a SHA-256 hash`);
    if (asset.versionedUrl !== `/${path}?v=${asset.sha256}`)
      fail(`asset ${path} has an incorrect versionedUrl`);
    if (!Number.isInteger(asset.bytes) || asset.bytes < 0)
      fail(`asset ${path} must contain a non-negative byte count`);

    const expectedMime = mimeTypes[extname(path).toLowerCase()];
    if (!expectedMime || asset.mime !== expectedMime)
      fail(`asset ${path} has an incorrect MIME type`);

    const filePath = resolve(staticRoot, path);
    const relativePath = relative(staticRoot, filePath).replaceAll('\\', '/');
    if (relativePath !== path) fail(`asset ${path} resolves outside static/`);
    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch (error) {
      fail(`asset ${path} is missing: ${error.message}`);
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== asset.bytes) fail(`asset ${path} has an incorrect byte count`);
    if (hash !== asset.sha256) fail(`asset ${path} has an incorrect SHA-256 hash`);

    totals.bytes += asset.bytes;
    totals[asset.kind === 'photo' ? 'photos' : 'sounds'] += 1;
  }

  for (const path of expected.keys()) {
    if (!seen.has(path)) fail(`catalogue asset ${path} is missing from the manifest`);
  }
  const sortedPaths = [...paths].sort();
  if (paths.some((path, index) => path !== sortedPaths[index]))
    fail('assets must be sorted by path');

  for (const key of ['assets', 'photos', 'sounds', 'bytes']) {
    if (manifest.totals[key] !== totals[key])
      fail(`totals.${key} is ${manifest.totals[key]}, expected ${totals[key]}`);
  }
  assertVersion(manifest);

  console.log(
    `Validated media manifest (${totals.assets} assets, ${totals.photos} photos, ${totals.sounds} sounds, ${totals.bytes} bytes).`
  );
}

await validateMediaManifest();
