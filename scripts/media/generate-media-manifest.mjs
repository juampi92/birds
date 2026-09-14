import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const staticRoot = join(root, 'static');
const mediaRoot = join(staticRoot, 'media');
const output = join(staticRoot, 'media-manifest.json');
const catalog = await readFile(join(mediaRoot, 'catalog.json'), 'utf8').then(JSON.parse);
const candidateFiles = new Set(
  catalog.birds.flatMap((bird) => [
    ...bird.images.map((image) => image.url.replace(/^\//, '')),
    ...bird.sounds.map((sound) => sound.url.replace(/^\//, ''))
  ])
);

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

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
    url: `/${relativePath}`,
    versionedUrl: `/${relativePath}?v=${hash}`,
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
const manifest = { schemaVersion: 1, version, totals, assets };

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${relative(root, output)} (${totals.assets} assets, ${totals.bytes} bytes, version ${version.slice(0, 16)})`
);
