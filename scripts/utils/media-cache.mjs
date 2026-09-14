import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const indexPath = join(process.cwd(), '.media-cache-index.json');

export const itemFingerprint = (item) =>
  JSON.stringify({
    downloadUrl: item.downloadUrl,
    localFile: item.localFile,
    title: item.title,
    sourceUrl: item.sourceUrl,
    license: item.license,
    transform: item.transform
  });

export async function loadMediaCacheIndex(path = indexPath) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return parsed?.schemaVersion === 1 && parsed.files && typeof parsed.files === 'object'
      ? parsed
      : { schemaVersion: 1, files: {} };
  } catch {
    return { schemaVersion: 1, files: {} };
  }
}

export async function saveMediaCacheIndex(index, path = indexPath) {
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
}

export function isReusableCacheEntry(index, item, inspection) {
  if (!inspection.valid) return false;
  const cached = index.files[item.localFile];
  // Committed files may predate the local preparation index and are trusted
  // after signature validation. Indexed files are checked against both the
  // source fingerprint and content digest.
  if (!cached) return true;
  return cached.fingerprint === itemFingerprint(item) && cached.sha256 === inspection.sha256;
}

export function recordCacheEntry(index, item, inspection) {
  index.files[item.localFile] = {
    fingerprint: itemFingerprint(item),
    sha256: inspection.sha256,
    bytes: inspection.bytes
  };
}
