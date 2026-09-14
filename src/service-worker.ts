import { build, files, version } from '$service-worker';

type MediaManifestAsset = {
  kind?: string;
  path?: string;
  url?: string;
  versionedUrl?: string;
  bytes?: number;
  sha256?: string;
  mime?: string;
};

type MediaManifest = {
  schemaVersion?: number;
  assets?: MediaManifestAsset[];
};

type MediaEntry = {
  key: string;
  fetchUrl: string;
  hash?: string;
  bytes?: number;
  mime?: string;
};

type OfflinePhase = 'idle' | 'preparing' | 'downloading' | 'complete' | 'error';

type OfflineStatus = {
  type: 'OFFLINE_PROGRESS' | 'OFFLINE_STATUS';
  downloaded: number;
  total: number;
  bytesDownloaded: number;
  bytesTotal: number;
  failed: number;
  complete: boolean;
  phase: OfflinePhase;
  error?: string;
};

type OfflineMessage = { type?: string };

type MediaFetchResult = {
  response: Response | null;
  cached: boolean;
  bytes?: number;
  error?: string;
  quota?: boolean;
};

const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
// Cache names are origin-wide. Encoding the complete scope prevents two
// project sites such as /a-b/ and /a/b/ from sharing a cache namespace.
const scopeKey = encodeURIComponent(scopePath);
const shellCacheName = `birds-shell-${scopeKey}-${version}`;
// This name intentionally does not contain the SvelteKit build version. A
// media body stays reusable when only the app shell changes.
const mediaCacheName = `birds-media-v2-${scopeKey}`;
const mediaCachePrefix = `birds-media-`;
const digestHeader = 'X-Birds-Asset-SHA256';
const appRoot = new URL('./', scopeUrl).href;

const isMediaPath = (url: URL) => /\/media\/(?:photos|sounds)\//.test(url.pathname);

/** Resolve a root-relative static path against a project Pages scope. */
function resolveAssetUrl(raw: string): URL {
  const value = raw.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return new URL(value);
  if (value.startsWith('/')) {
    // Manifest URLs are root-relative (`/media/...`) while files from
    // $service-worker already include the configured base (`/birds/...`).
    if (scopePath === '/' || value === scopePath || value.startsWith(scopePath))
      return new URL(value, scopeUrl);
    return new URL(value.slice(1), scopeUrl);
  }
  return new URL(value, scopeUrl);
}

function canonicalRequest(url: URL): Request {
  const key = new URL(url.href);
  key.search = '';
  key.hash = '';
  return new Request(key.href, { method: 'GET' });
}

function canonicalUrl(raw: string): URL {
  return new URL(canonicalRequest(resolveAssetUrl(raw)).url);
}

function pathForMessage(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(scopePath, '/').replace(/^\/?/, '/');
  } catch {
    return url;
  }
}

const declaredMediaEntries: MediaEntry[] = files
  .map((file) => {
    try {
      const url = canonicalUrl(file);
      if (!isMediaPath(url) || url.origin !== self.location.origin) return null;
      return { key: url.href, fetchUrl: url.href };
    } catch {
      return null;
    }
  })
  .filter((entry): entry is MediaEntry => entry !== null);

const manifestFile = files.find((file) => {
  try {
    const path = resolveAssetUrl(file).pathname;
    return path.endsWith('/media-manifest.json') || path.endsWith('/media/media-manifest.json');
  } catch {
    return false;
  }
});
const manifestUrl = resolveAssetUrl(manifestFile ?? 'media-manifest.json');

const precache = [
  appRoot,
  ...build,
  ...files.filter((file) => !file.includes('/media/photos/') && !file.includes('/media/sounds/'))
];

let manifestPromise: Promise<MediaManifest | null> | null = null;
let mediaEntriesPromise: Promise<MediaEntry[]> | null = null;
let activePrepare: Promise<void> | null = null;
let mediaManifestAvailable = false;
let lastStatus: OfflineStatus = {
  type: 'OFFLINE_STATUS',
  downloaded: 0,
  total: 0,
  bytesDownloaded: 0,
  bytesTotal: 0,
  failed: 0,
  complete: false,
  phase: 'idle'
};
const mediaInflight = new Map<string, Promise<MediaFetchResult>>();

async function readMediaManifest(): Promise<MediaManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    // Prefer this worker's shell. A newly activated worker must not mix a
    // later live manifest with the files known by its own build.
    try {
      const shell = await caches.open(shellCacheName);
      const cached = await shell.match(manifestUrl.href);
      if (cached?.ok) {
        const manifest = (await cached.json()) as MediaManifest;
        if (Array.isArray(manifest.assets)) {
          mediaManifestAvailable = true;
          return manifest;
        }
      }
    } catch {
      // Fall through to a network read for a development worker whose shell
      // has not been installed yet.
    }
    try {
      const response = await fetch(manifestUrl.href, { cache: 'no-cache' });
      if (!response.ok) return null;
      const manifest = (await response.json()) as MediaManifest;
      if (Array.isArray(manifest.assets)) mediaManifestAvailable = true;
      return mediaManifestAvailable ? manifest : null;
    } catch {
      return null;
    }
  })();
  return manifestPromise;
}

function manifestEntry(asset: MediaManifestAsset): MediaEntry | null {
  const bare = asset.url ?? asset.path;
  if (!bare) return null;
  try {
    const keyUrl = canonicalUrl(bare);
    if (keyUrl.origin !== self.location.origin || !isMediaPath(keyUrl)) return null;
    const fetchUrl = resolveAssetUrl(asset.versionedUrl ?? bare);
    if (fetchUrl.origin !== self.location.origin) return null;
    return {
      key: keyUrl.href,
      fetchUrl: fetchUrl.href,
      hash: typeof asset.sha256 === 'string' ? asset.sha256.toLowerCase() : undefined,
      bytes: Number.isFinite(asset.bytes) ? asset.bytes : undefined,
      mime: asset.mime
    };
  } catch {
    return null;
  }
}

async function getMediaEntries(): Promise<MediaEntry[]> {
  if (mediaEntriesPromise) return mediaEntriesPromise;
  mediaEntriesPromise = (async () => {
    const byKey = new Map(declaredMediaEntries.map((entry) => [entry.key, entry]));
    const manifest = await readMediaManifest();
    for (const asset of manifest?.assets ?? []) {
      const entry = manifestEntry(asset);
      if (!entry) continue;
      byKey.set(entry.key, { ...byKey.get(entry.key), ...entry });
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();
  return mediaEntriesPromise;
}

async function entryForRequest(request: Request): Promise<MediaEntry | null> {
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || !isMediaPath(requestUrl)) return null;
  const key = canonicalRequest(requestUrl).url;
  const known = (await getMediaEntries()).find((entry) => entry.key === key);
  return known ?? { key, fetchUrl: requestUrl.href };
}

function isUsableMediaResponse(response: Response, entry: MediaEntry): boolean {
  // A cached range response is never a complete media object.
  if (response.status !== 200 || !response.ok) return false;
  return !entry.hash || response.headers.get(digestHeader)?.toLowerCase() === entry.hash;
}

async function digestMatches(
  response: Response,
  expected: string
): Promise<{ matches: boolean; body: ArrayBuffer }> {
  const body = await response.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', body);
  const actual = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { matches: actual === expected.toLowerCase(), body };
}

function responseWithDigest(response: Response, body: ArrayBuffer, digest: string): Response {
  const headers = new Headers(response.headers);
  headers.set(digestHeader, digest);
  // Body bytes are decoded by Fetch before arrayBuffer(), so retaining a
  // content-encoding header would make a synthetic response invalid.
  headers.delete('content-encoding');
  headers.set('content-length', String(body.byteLength));
  return new Response(body, { status: 200, statusText: response.statusText, headers });
}

async function findCachedMedia(entry: MediaEntry): Promise<Response | null> {
  const mediaCache = await caches.open(mediaCacheName);
  const current = await mediaCache.match(entry.key);
  if (current) {
    if (isUsableMediaResponse(current, entry)) return current;
    if (entry.hash) {
      try {
        const checked = await digestMatches(current, entry.hash);
        if (checked.matches) {
          const stamped = responseWithDigest(current, checked.body, entry.hash);
          await mediaCache.put(canonicalRequest(new URL(entry.key)), stamped.clone());
          return stamped;
        }
      } catch {
        // Treat an unreadable or partial body as a cache miss.
      }
    }
    await mediaCache.delete(entry.key);
  }

  // Migrate bodies from a previous worker cache when they are still valid.
  // The URL is scoped to this app, and unknown cache names are never deleted.
  const names = await caches.keys();
  for (const name of names) {
    if (
      name === mediaCacheName ||
      (!name.startsWith(mediaCachePrefix) && !name.startsWith('birds-'))
    )
      continue;
    const candidateCache = await caches.open(name);
    const candidate = await candidateCache.match(entry.key);
    if (!candidate) continue;
    let valid = isUsableMediaResponse(candidate, entry);
    let candidateToStore = candidate.clone();
    if (!valid && entry.hash && candidate.status === 200 && candidate.ok) {
      try {
        const checked = await digestMatches(candidate, entry.hash);
        valid = checked.matches;
        if (valid) candidateToStore = responseWithDigest(candidate, checked.body, entry.hash);
      } catch {
        valid = false;
      }
    }
    if (!valid) continue;
    try {
      await mediaCache.put(canonicalRequest(new URL(entry.key)), candidateToStore);
      return candidate;
    } catch {
      return candidate;
    }
  }
  return null;
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: number; message?: string };
  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.code === 22 ||
    /quota|storage.?full/i.test(candidate.message ?? '')
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Network request failed';
}

async function fetchAndCacheMedia(entry: MediaEntry): Promise<MediaFetchResult> {
  const running = mediaInflight.get(entry.key);
  if (running) return cloneMediaResult(await running);

  const operation = (async (): Promise<MediaFetchResult> => {
    let response: Response;
    try {
      // Digest-query URLs provide a cache-busting URL for GitHub Pages/CDNs;
      // the Cache API key remains the canonical bare path below.
      response = await fetch(new Request(entry.fetchUrl, { method: 'GET', cache: 'no-cache' }));
    } catch (error) {
      return {
        response: null,
        cached: false,
        error: `Network error for ${pathForMessage(entry.key)}: ${errorMessage(error)}`
      };
    }

    const bytes = Number(response.headers.get('content-length')) || entry.bytes;
    if (!(response.ok && response.status === 200)) {
      return {
        response,
        cached: false,
        bytes,
        error: `HTTP ${response.status} for ${pathForMessage(entry.key)}`
      };
    }

    try {
      const mediaCache = await caches.open(mediaCacheName);
      if (entry.hash) {
        const checked = await digestMatches(response, entry.hash);
        if (!checked.matches) {
          return {
            response: new Response('Media integrity check failed', {
              status: 502,
              headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' }
            }),
            cached: false,
            bytes,
            error: `Integrity check failed for ${pathForMessage(entry.key)}`
          };
        }
        await mediaCache.put(
          canonicalRequest(new URL(entry.key)),
          responseWithDigest(response, checked.body, entry.hash)
        );
      } else {
        await mediaCache.put(canonicalRequest(new URL(entry.key)), response.clone());
      }
      return { response, cached: true, bytes };
    } catch (error) {
      return {
        response,
        cached: false,
        bytes,
        quota: isQuotaError(error),
        error: isQuotaError(error)
          ? `Storage quota exceeded while saving ${pathForMessage(entry.key)}. Free device storage and try again.`
          : `Could not cache ${pathForMessage(entry.key)}: ${errorMessage(error)}`
      };
    }
  })();

  mediaInflight.set(entry.key, operation);
  operation.then(
    () => {
      if (mediaInflight.get(entry.key) === operation) mediaInflight.delete(entry.key);
    },
    () => {
      if (mediaInflight.get(entry.key) === operation) mediaInflight.delete(entry.key);
    }
  );
  return cloneMediaResult(await operation);
}

function cloneMediaResult(result: MediaFetchResult): MediaFetchResult {
  return { ...result, response: result.response ? result.response.clone() : null };
}

function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start >= size || start > end)
      return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

async function rangeResponse(full: Response, range: string): Promise<Response> {
  const body = await full.clone().arrayBuffer();
  const parsed = parseRange(range, body.byteLength);
  if (!parsed) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${body.byteLength}` }
    });
  }
  const headers = new Headers(full.headers);
  headers.delete('content-encoding');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${body.byteLength}`);
  headers.set('Content-Length', String(parsed.end - parsed.start + 1));
  return new Response(body.slice(parsed.start, parsed.end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}

function unavailableMediaResponse(entry: MediaEntry, error?: string): Response {
  return new Response(error ?? `Media is unavailable offline: ${pathForMessage(entry.key)}`, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' }
  });
}

async function handleMediaRequest(request: Request): Promise<Response> {
  const entry = await entryForRequest(request);
  if (!entry) return fetch(request);

  const cached = await findCachedMedia(entry);
  if (cached) {
    const range = request.headers.get('range');
    return range ? rangeResponse(cached, range) : cached;
  }

  const result = await fetchAndCacheMedia(entry);
  if (result.response) {
    const range = request.headers.get('range');
    // A full 200 body is sliced for range clients. A server-supplied 206 is
    // returned as-is but is deliberately never written to Cache Storage.
    if (range && result.response.status === 200) return rangeResponse(result.response, range);
    return result.response;
  }
  return unavailableMediaResponse(entry, result.error);
}

async function handleFetch(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const inScope =
    scopePath === '/' ||
    requestUrl.pathname === scopePath.slice(0, -1) ||
    requestUrl.pathname.startsWith(scopePath);
  if (requestUrl.origin !== self.location.origin || !inScope) return fetch(request);

  if (isMediaPath(requestUrl)) return handleMediaRequest(request);

  const shell = await caches.open(shellCacheName);
  const cached = await shell.match(request);
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch (error) {
    // Navigation fallback is intentionally limited to navigations. Returning
    // index.html for a failed script, JSON, image, or audio request masks the
    // real error and breaks media playback.
    if (request.mode === 'navigate') {
      const fallback = await shell.match(appRoot);
      if (fallback) return fallback;
    }
    throw error;
  }
}

function postStatus(status: OfflineStatus, target?: Client | null): void {
  const payload = { ...status };
  if (target) {
    target.postMessage(payload);
    return;
  }
  void self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      try {
        const clientUrl = new URL(client.url);
        const inScope =
          scopePath === '/' ||
          clientUrl.pathname === scopePath.slice(0, -1) ||
          clientUrl.pathname.startsWith(scopePath);
        if (clientUrl.origin === scopeUrl.origin && inScope) client.postMessage(payload);
      } catch {
        // A client can disappear while the worker is enumerating it.
      }
    }
  });
}

function mergeError(current: string | undefined, next: string): string {
  if (!current) return next;
  if (current.includes(next)) return current;
  const parts = current.split(' · ');
  return [...parts.slice(-2), next].join(' · ');
}

async function statusForEntries(
  entries: MediaEntry[]
): Promise<{ downloaded: number; bytesDownloaded: number; keys: Set<string> }> {
  let downloaded = 0;
  let bytesDownloaded = 0;
  const keys = new Set<string>();
  for (const entry of entries) {
    const cached = await findCachedMedia(entry);
    if (!cached) continue;
    downloaded += 1;
    keys.add(entry.key);
    bytesDownloaded += entry.bytes ?? (Number(cached.headers.get('content-length')) || 0);
  }
  return { downloaded, bytesDownloaded, keys };
}

async function currentOfflineStatus(): Promise<OfflineStatus> {
  if (activePrepare) return lastStatus;
  const entries = await getMediaEntries();
  const cached = await statusForEntries(entries);
  const complete = entries.length > 0 && cached.downloaded === entries.length;
  return {
    type: 'OFFLINE_STATUS',
    downloaded: cached.downloaded,
    total: entries.length,
    bytesDownloaded: cached.bytesDownloaded,
    bytesTotal: entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
    failed: 0,
    complete,
    phase: complete ? 'complete' : 'idle'
  };
}

async function runPrepareOffline(): Promise<void> {
  const entries = await getMediaEntries();
  const unverified = entries.filter((entry) => !entry.hash);
  if (!mediaManifestAvailable || unverified.length > 0) {
    lastStatus = {
      type: 'OFFLINE_PROGRESS',
      downloaded: 0,
      total: entries.length,
      bytesDownloaded: 0,
      bytesTotal: entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      failed: Math.max(1, unverified.length),
      complete: false,
      phase: 'error',
      error: !mediaManifestAvailable
        ? 'The offline media manifest is unavailable. Reload this page while online, then try again.'
        : 'The offline media manifest is incomplete. Reload this page to receive a verified media list, then try again.'
    };
    postStatus(lastStatus);
    return;
  }
  const bytesTotal = entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0);
  const initial = await statusForEntries(entries);
  lastStatus = {
    type: 'OFFLINE_PROGRESS',
    downloaded: initial.downloaded,
    total: entries.length,
    bytesDownloaded: initial.bytesDownloaded,
    bytesTotal,
    failed: 0,
    complete: entries.length > 0 && initial.downloaded === entries.length,
    phase: initial.downloaded === entries.length && entries.length > 0 ? 'complete' : 'preparing'
  };
  postStatus(lastStatus);
  if (lastStatus.complete) return;

  const countedKeys = new Set(initial.keys);
  lastStatus.phase = 'downloading';
  postStatus(lastStatus);
  for (const entry of entries) {
    const cached = await findCachedMedia(entry);
    if (cached) {
      // The initial scan may have been interrupted by another tab's request.
      // Count a body exactly once in this run.
      if (!countedKeys.has(entry.key)) {
        countedKeys.add(entry.key);
        lastStatus.downloaded += 1;
        lastStatus.bytesDownloaded +=
          entry.bytes ?? (Number(cached.headers.get('content-length')) || 0);
      }
      postStatus(lastStatus);
      continue;
    }

    const result = await fetchAndCacheMedia(entry);
    if (result.cached) {
      if (!countedKeys.has(entry.key)) {
        countedKeys.add(entry.key);
        lastStatus.downloaded += 1;
        lastStatus.bytesDownloaded += result.bytes ?? 0;
      }
    } else {
      lastStatus.failed += 1;
      lastStatus.error = mergeError(
        lastStatus.error,
        result.error ?? `Could not download ${pathForMessage(entry.key)}`
      );
      postStatus(lastStatus);
      if (result.quota) {
        lastStatus.phase = 'error';
        lastStatus.complete = false;
        postStatus(lastStatus);
        return;
      }
    }
    postStatus(lastStatus);
  }

  // Re-scan after the loop so concurrent requests and cache migration cannot
  // make the progress counters claim more files than are actually stored.
  const final = await statusForEntries(entries);
  lastStatus.downloaded = final.downloaded;
  lastStatus.bytesDownloaded = final.bytesDownloaded;
  lastStatus.complete = lastStatus.failed === 0 && lastStatus.downloaded === lastStatus.total;
  lastStatus.phase = lastStatus.complete ? 'complete' : 'error';
  postStatus(lastStatus);
}

function prepareOffline(): Promise<void> {
  if (!activePrepare) {
    activePrepare = runPrepareOffline()
      .catch((error) => {
        lastStatus = {
          ...lastStatus,
          type: 'OFFLINE_PROGRESS',
          phase: 'error',
          complete: false,
          error: errorMessage(error)
        };
        postStatus(lastStatus);
      })
      .finally(() => {
        activePrepare = null;
      });
  }
  return activePrepare;
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(shellCacheName)
      .then((cache) => cache.addAll(precache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(`birds-shell-${scopeKey}-`) && key !== shellCacheName)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const message = (event.data ?? {}) as OfflineMessage;
  if (message.type === 'PREPARE_OFFLINE') {
    event.waitUntil(prepareOffline());
  } else if (message.type === 'GET_OFFLINE_STATUS') {
    event.waitUntil(
      currentOfflineStatus().then((status) => postStatus(status, event.source as Client | null))
    );
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(handleFetch(event.request));
});
