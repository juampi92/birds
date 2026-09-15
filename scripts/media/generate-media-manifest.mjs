import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ url: string }} CatalogMedia */
/** @typedef {{ images: CatalogMedia[], sounds: CatalogMedia[] }} CatalogBird */
/** @typedef {{ birds: CatalogBird[] }} MediaCatalog */
/** @typedef {'photo' | 'sound'} MediaKind */
/** @typedef {{ kind: MediaKind, path: string, url: string, versionedUrl: string, bytes: number, sha256: string, mime: string }} ManifestAsset */
/** @typedef {{ assets: number, photos: number, sounds: number, bytes: number }} ManifestTotals */
/** @typedef {{ schemaVersion: 1, version: string, totals: ManifestTotals, assets: ManifestAsset[] }} MediaManifest */

/** @type {Record<string, string>} */
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

/**
 * @param {string} root
 * @returns {Promise<{ output: string, manifest: MediaManifest, totals: ManifestTotals }>}
 */
export async function generateMediaManifest(root = process.cwd()) {
  const staticRoot = join(root, 'static');
  const mediaRoot = join(staticRoot, 'media');
  const output = join(staticRoot, 'media-manifest.json');
  /** @type {MediaCatalog} */
  const catalog = await readFile(join(mediaRoot, 'catalog.json'), 'utf8').then(JSON.parse);
  const candidateFiles = new Set(
    catalog.birds.flatMap((bird) => [
      ...bird.images.map((image) => image.url.replace(/^\//, '')),
      ...bird.sounds.map((sound) => sound.url.replace(/^\//, ''))
    ])
  );

  /** @param {string} directory @returns {Promise<string[]>} */
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(path)));
      else if (entry.isFile()) files.push(path);
    }
    return files;
  }

  const files = (await walk(mediaRoot))
    .filter((file) => /\.(?:jpe?g|webp|flac|mp3|ogg|wav)$/i.test(file))
    .filter((file) => candidateFiles.has(relative(staticRoot, file).split('\\').join('/')))
    .sort();

  /** @type {ManifestAsset[]} */
  const assets = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const relativePath = relative(staticRoot, file).split('\\').join('/');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const extension = extname(file).toLowerCase();
    const kind = relativePath.startsWith('media/photos/') ? 'photo' : 'sound';
    assets.push({
      kind,
      path: relativePath,
      url: '/' + relativePath,
      versionedUrl: '/' + relativePath + '?v=' + hash,
      bytes: bytes.length,
      sha256: hash,
      mime: mimeTypes[extension] ?? 'application/octet-stream'
    });
  }

  const totals = {
    assets: assets.length,
    photos: assets.filter((asset) => asset.kind === 'photo').length,
    sounds: assets.filter((asset) => asset.kind === 'sound').length,
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0)
  };
  const canonical = JSON.stringify({ schemaVersion: 1, assets, totals });
  const version = createHash('sha256').update(canonical).digest('hex');
  /** @type {MediaManifest} */
  const manifest = { schemaVersion: 1, version, totals, assets };

  await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
  return { output, manifest, totals };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output, totals, manifest } = await generateMediaManifest();
  console.log(
    'Wrote ' +
      relative(process.cwd(), output) +
      ' (' +
      totals.assets +
      ' assets, ' +
      totals.bytes +
      ' bytes, version ' +
      manifest.version.slice(0, 16) +
      ')'
  );
}
