import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type OfflinePhase = 'idle' | 'preparing' | 'complete' | 'error';

export type OfflineState = {
  phase: OfflinePhase;
  statusKnown: boolean;
  downloaded: number;
  total: number;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
  failed: number;
  error: string | null;
  online: boolean;
  supported: boolean;
};

const initial: OfflineState = {
  phase: 'idle',
  statusKnown: false,
  downloaded: 0,
  total: 0,
  bytesDownloaded: null,
  bytesTotal: null,
  failed: 0,
  error: null,
  online: true,
  supported: false
};

export const offlineState = writable<OfflineState>(initial);
export const installAvailable = writable(false);
export const installHelp = writable<'ios' | 'browser' | null>(null);
/** True when the app is running as an installed PWA. */
export const pwaInstalled = writable(false);

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
let deferredPrompt: InstallPrompt | null = null;
let started = false;
let requested = false;
let standaloneRequested = false;
let removeListeners: (() => void) | null = null;

function normalizeStatus(message: Record<string, unknown>): Partial<OfflineState> {
  const downloaded = Number(message.downloaded ?? 0);
  const total = Number(message.total ?? 0);
  const failed = Number(message.failed ?? 0);
  const complete =
    message.complete === true || message.status === 'complete' || message.phase === 'complete';
  const phase =
    complete && failed === 0
      ? 'complete'
      : message.error || failed > 0 || message.phase === 'error'
        ? 'error'
        : message.phase === 'preparing' || message.phase === 'downloading'
          ? 'preparing'
          : 'idle';
  return {
    phase,
    downloaded: Number.isFinite(downloaded) ? downloaded : 0,
    total: Number.isFinite(total) ? total : 0,
    bytesDownloaded: typeof message.bytesDownloaded === 'number' ? message.bytesDownloaded : null,
    bytesTotal: typeof message.bytesTotal === 'number' ? message.bytesTotal : null,
    failed: Number.isFinite(failed) ? failed : 0,
    error: typeof message.error === 'string' ? message.error : null,
    online: typeof message.online === 'boolean' ? message.online : navigator.onLine
  };
}

function send(type: 'PREPARE_OFFLINE' | 'GET_OFFLINE_STATUS') {
  if (!browser || !navigator.serviceWorker.controller) return false;
  navigator.serviceWorker.controller.postMessage({ type, requestId: `offline-${Date.now()}` });
  return true;
}

export function requestOfflineStatus() {
  send('GET_OFFLINE_STATUS');
}

/** Start/resume the download. The service worker owns cache writes and skips hits. */
export function prepareOffline() {
  if (!browser) return false;
  requested = true;
  requestPersistentStorage();
  offlineState.update((state) => ({
    ...state,
    phase: 'preparing',
    error: null,
    online: navigator.onLine
  }));
  if (!send('PREPARE_OFFLINE')) {
    // A newly installed worker can become the controller a moment after the
    // page is ready. controllerchange below retries without showing a false
    // download error during that handoff.
    return true;
  }
  return true;
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function shouldShowInstallPrompt() {
  try {
    const dismissed = Number(localStorage.getItem('birds-install-dismissed') ?? 0);
    return !dismissed || Date.now() - dismissed > 14 * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem('birds-install-dismissed', String(Date.now()));
  } catch {
    /* storage is optional */
  }
  installAvailable.set(false);
  installHelp.set(null);
}

function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  void navigator.storage.persist().catch(() => undefined);
}

export async function installPwa() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  installAvailable.set(false);
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'accepted') prepareOffline();
  return choice.outcome === 'accepted';
}

export function startOfflineClient() {
  if (!browser || started) return;
  started = true;
  const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  offlineState.update((state) => ({
    ...state,
    supported: Boolean(serviceWorker?.controller),
    statusKnown: false,
    online: navigator.onLine
  }));

  const onBeforeInstall = (event: Event) => {
    // An installed PWA can still receive this event in some browsers after a
    // navigation. Never offer installation UI from the standalone app.
    if (isStandalone()) return;
    event.preventDefault();
    deferredPrompt = event as InstallPrompt;
    installHelp.set(null);
    if (shouldShowInstallPrompt()) installAvailable.set(true);
  };
  const onInstalled = () => {
    pwaInstalled.set(true);
    deferredPrompt = null;
    installAvailable.set(false);
    installHelp.set(null);
    prepareOffline();
  };
  const onOnline = () => offlineState.update((state) => ({ ...state, online: true }));
  const onOffline = () => offlineState.update((state) => ({ ...state, online: false }));
  const onVisibility = () => {
    if (document.visibilityState === 'visible') requestOfflineStatus();
  };
  const onControllerChange = () => {
    requestOfflineStatus();
    if (requested || standaloneRequested) prepareOffline();
  };
  const onMessage = (event: MessageEvent) => {
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as Record<string, unknown>;
    if (data.type !== 'OFFLINE_PROGRESS' && data.type !== 'OFFLINE_STATUS') return;
    offlineState.update((state) => ({
      ...state,
      ...normalizeStatus(data),
      statusKnown: true,
      supported: true
    }));
  };
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onInstalled);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisibility);
  serviceWorker?.addEventListener('message', onMessage);
  serviceWorker?.addEventListener('controllerchange', onControllerChange);
  removeListeners = () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onInstalled);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisibility);
    serviceWorker?.removeEventListener('message', onMessage);
    serviceWorker?.removeEventListener('controllerchange', onControllerChange);
  };

  standaloneRequested = isStandalone();
  pwaInstalled.set(standaloneRequested);
  if (standaloneRequested) {
    installAvailable.set(false);
    installHelp.set(null);
    prepareOffline();
  } else if (!deferredPrompt && isIos() && shouldShowInstallPrompt()) installHelp.set('ios');
  else if (!deferredPrompt && shouldShowInstallPrompt()) installHelp.set('browser');

  serviceWorker?.ready
    .then(() => {
      offlineState.update((state) => ({ ...state, supported: Boolean(serviceWorker.controller) }));
      requestOfflineStatus();
      if (requested || standaloneRequested) prepareOffline();
    })
    .catch(() => offlineState.update((state) => ({ ...state, supported: false })));
}

export function stopOfflineClient() {
  removeListeners?.();
  removeListeners = null;
  started = false;
  requested = false;
  standaloneRequested = false;
  pwaInstalled.set(false);
}
