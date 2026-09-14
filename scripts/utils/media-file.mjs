import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function inspectMediaFile(path, kind) {
  try {
    const bytes = await readFile(path);
    const isPhoto =
      kind === 'photo' &&
      ((bytes.length > 2 && bytes.subarray(0, 2).toString('hex') === 'ffd8') ||
        (bytes.length > 12 &&
          bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
          bytes.subarray(8, 12).toString('ascii') === 'WEBP'));
    const isOgg = bytes.length > 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS';
    const isFlac = bytes.length > 4 && bytes.subarray(0, 4).toString('ascii') === 'fLaC';
    const isMp3 =
      bytes.length > 3 &&
      (bytes.subarray(0, 3).toString('ascii') === 'ID3' ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    const isWav =
      bytes.length > 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WAVE';
    const valid = isPhoto || (kind === 'sound' && (isFlac || isOgg || isMp3 || isWav));
    return { valid, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    return { valid: false, bytes: 0, sha256: null };
  }
}

export async function isValidMediaFile(path, kind) {
  return (await inspectMediaFile(path, kind)).valid;
}
