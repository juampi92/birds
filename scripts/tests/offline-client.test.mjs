// Intentional protocol coverage for install prompting, standalone handoff,
// dismissal, progress, errors, and completion in the offline client.
import assert from 'node:assert/strict';
import { it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../src/lib/offline.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((item) => item !== listener)
      );
    },
    dispatch(type, event = {}) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    }
  };
}

function writable(initial) {
  let value = initial;
  const subscribers = new Set();
  return {
    set(next) {
      value = next;
      for (const subscriber of subscribers) subscriber(value);
    },
    update(fn) {
      this.set(fn(value));
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn(value);
      return () => subscribers.delete(fn);
    },
    read() {
      return value;
    }
  };
}

async function loadClient({ controller = {}, standalone = false, ios = false } = {}) {
  const window = eventTarget();
  const document = eventTarget();
  document.visibilityState = 'visible';
  const serviceWorker = eventTarget();
  serviceWorker.controller = controller;
  serviceWorker.ready = Promise.resolve(serviceWorker);
  const navigator = {
    serviceWorker,
    onLine: true,
    userAgent: ios ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Macintosh)',
    platform: ios ? 'iPhone' : 'MacIntel',
    maxTouchPoints: ios ? 5 : 0,
    storage: { persist: async () => true }
  };
  window.navigator = navigator;
  window.matchMedia = () => ({ matches: standalone });
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  };
  const module = { exports: {} };
  const context = vm.createContext({
    console,
    Promise,
    Date,
    Number,
    Math,
    navigator,
    window,
    document,
    localStorage,
    setTimeout,
    clearTimeout,
    module,
    exports: module.exports
  });
  context.require = (name) => {
    if (name === '$app/environment') return { browser: true };
    if (name === 'svelte/store') return { writable };
    throw new Error(`Unexpected import in offline client: ${name}`);
  };
  vm.runInContext(compiled, context, { filename: 'offline.ts' });
  const client = module.exports;
  client.startOfflineClient();
  await Promise.resolve();
  return { ...client, window, document, serviceWorker, navigator };
}

function storeValue(store) {
  let value;
  store.subscribe((next) => {
    value = next;
  })();
  return value;
}

function messages(serviceWorker, type) {
  return (serviceWorker.controller?.posted ?? []).filter((message) => message.type === type);
}

async function testNormalVisitDoesNotPrepare() {
  const controller = {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    }
  };
  const client = await loadClient({ controller });
  assert.equal(storeValue(client.pwaInstalled), false, 'browser visits are not installed PWAs');
  assert.equal(
    messages(client.serviceWorker, 'PREPARE_OFFLINE').length,
    0,
    'ordinary visits must not start a full download'
  );
  assert.equal(
    messages(client.serviceWorker, 'GET_OFFLINE_STATUS').length,
    1,
    'ordinary visits should ask for existing status'
  );
  client.stopOfflineClient();
}

async function testInstallAcceptancePrepares() {
  const controller = {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    }
  };
  const client = await loadClient({ controller });
  let prevented = false;
  client.window.dispatch('beforeinstallprompt', {
    preventDefault() {
      prevented = true;
    },
    async prompt() {},
    userChoice: Promise.resolve({ outcome: 'accepted' })
  });
  assert.equal(prevented, true);
  assert.equal(storeValue(client.installAvailable), true);
  assert.equal(await client.installPwa(), true);
  assert.equal(
    messages(client.serviceWorker, 'PREPARE_OFFLINE').length,
    1,
    'accepted installation must prepare offline media'
  );
  client.window.dispatch('appinstalled');
  assert.equal(storeValue(client.pwaInstalled), true, 'appinstalled marks the PWA as installed');
  assert.equal(
    messages(client.serviceWorker, 'PREPARE_OFFLINE').length,
    2,
    'appinstalled should also resume preparation'
  );
  client.stopOfflineClient();
}

async function testStandaloneControllerHandoff() {
  const client = await loadClient({ controller: null, standalone: true });
  assert.equal(storeValue(client.pwaInstalled), true, 'standalone launches are installed PWAs');
  assert.equal(
    messages(client.serviceWorker, 'PREPARE_OFFLINE').length,
    0,
    'standalone launch waits for its new worker to control the page'
  );
  client.serviceWorker.controller = {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    }
  };
  client.serviceWorker.dispatch('controllerchange');
  assert.equal(
    messages(client.serviceWorker, 'PREPARE_OFFLINE').length,
    1,
    'controller handoff resumes standalone preparation'
  );
  client.stopOfflineClient();
}

async function testDismissal() {
  const client = await loadClient({ controller: null });
  client.window.dispatch('beforeinstallprompt', {
    preventDefault() {},
    async prompt() {},
    userChoice: Promise.resolve({ outcome: 'dismissed' })
  });
  assert.equal(storeValue(client.installAvailable), true);
  client.dismissInstallPrompt();
  assert.equal(storeValue(client.installAvailable), false);
  assert.equal(storeValue(client.installHelp), null);
  client.stopOfflineClient();
}

async function testProgressErrorAndComplete() {
  const controller = {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    }
  };
  const client = await loadClient({ controller });
  client.serviceWorker.dispatch('message', {
    data: {
      type: 'OFFLINE_PROGRESS',
      phase: 'downloading',
      downloaded: 2,
      total: 5,
      bytesDownloaded: 10,
      bytesTotal: 20,
      failed: 0,
      complete: false
    }
  });
  assert.equal(storeValue(client.offlineState).phase, 'preparing');
  assert.equal(storeValue(client.offlineState).statusKnown, true);
  assert.equal(storeValue(client.offlineState).downloaded, 2);
  client.serviceWorker.dispatch('message', {
    data: {
      type: 'OFFLINE_STATUS',
      phase: 'error',
      downloaded: 4,
      total: 5,
      failed: 1,
      error: 'One file failed',
      complete: false
    }
  });
  assert.equal(storeValue(client.offlineState).phase, 'error');
  client.serviceWorker.dispatch('message', {
    data: {
      type: 'OFFLINE_STATUS',
      phase: 'complete',
      downloaded: 5,
      total: 5,
      failed: 0,
      complete: true
    }
  });
  assert.equal(storeValue(client.offlineState).phase, 'complete');
  client.stopOfflineClient();
}

it('handles the offline client protocol', async () => {
  await testNormalVisitDoesNotPrepare();
  await testInstallAcceptancePrepares();
  await testStandaloneControllerHandoff();
  await testDismissal();
  await testProgressErrorAndComplete();
});
