// The preparation index is local-only. It lets the media command reuse a
// valid prepared file while invalidating it when its source or recipe changes.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import { isReusableCacheEntry, recordCacheEntry } from '../utils/media-cache.mjs';

const inspection = {
  valid: true,
  bytes: 18,
  sha256: 'fixture-sha256'
};

const first = {
  downloadUrl: 'https://example.test/first.ogg',
  localFile: 'first.ogg',
  title: 'First',
  sourceUrl: 'source',
  license: 'CC0 1.0'
};

it('reuses unchanged preparation and invalidates changed inputs', () => {
  const index = { schemaVersion: 1, files: {} };
  recordCacheEntry(index, first, inspection);
  assert.equal(isReusableCacheEntry(index, first, inspection), true);
  assert.equal(
    isReusableCacheEntry(
      index,
      { ...first, downloadUrl: 'https://example.test/changed.ogg' },
      inspection
    ),
    false
  );
  assert.equal(
    isReusableCacheEntry(index, { ...first, transform: 'changed-recipe' }, inspection),
    false
  );
  assert.equal(
    isReusableCacheEntry(index, first, { ...inspection, sha256: 'changed-bytes' }),
    false
  );
});
