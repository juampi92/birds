/**
 * Messages shared by the page and the service worker. Keep these strings in
 * sync with src/service-worker.ts; service workers cannot import $lib modules
 * in SvelteKit's production build.
 */
export const PREPARE_OFFLINE = 'PREPARE_OFFLINE' as const;
export const GET_OFFLINE_STATUS = 'GET_OFFLINE_STATUS' as const;

export type OfflinePhase = 'idle' | 'preparing' | 'downloading' | 'complete' | 'error';

export type OfflineProgress = {
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

export type OfflineMessage = { type: typeof PREPARE_OFFLINE } | { type: typeof GET_OFFLINE_STATUS };
