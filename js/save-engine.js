// Keyron Save Engine — durabilidade local rápida inspirada no WAL estável do Borion.
// Nunca grava o cofre em texto puro: apenas bundles já cifrados com AES-GCM.
const KeyronSaveEngine = (() => {
  'use strict';

  const DB_NAME = 'keyron-save-engine-v3';
  const DB_VERSION = 1;
  const STORE_PENDING = 'pending';
  const PENDING_ID = 'latest-encrypted-vault';
  const MARKER_KEY = 'keyron_pending_save_v3';
  const DEVICE_KEY = 'keyron_device_id_v3';
  const CHANNEL_NAME = 'keyron-save-events-v3';

  let dbPromise = null;
  let currentBundle = null;
  let latestTask = null;
  let workerPromise = null;
  let sequence = 0;
  let channel = null;
  const waiters = [];
  const listeners = new Set();

  function clone(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  function randomId() {
    if (globalThis.KeyronCrypto?.randomId) return KeyronCrypto.randomId();
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = randomId();
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return `ephemeral-${randomId()}`;
    }
  }

  const deviceId = getDeviceId();

  function nextSequence() {
    sequence = (sequence + 1) % 1000;
    return (Date.now() * 1000) + sequence;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!('indexedDB' in window)) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PENDING)) db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('SAVE_ENGINE_DB_OPEN_FAILED'));
    });
    return dbPromise;
  }

  async function putPending(record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readwrite');
      tx.objectStore(STORE_PENDING).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('SAVE_ENGINE_PENDING_WRITE_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('SAVE_ENGINE_PENDING_WRITE_ABORTED'));
    });
  }

  async function getPendingRecord() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PENDING, 'readonly');
        const request = tx.objectStore(STORE_PENDING).get(PENDING_ID);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('SAVE_ENGINE_PENDING_READ_FAILED'));
      });
    } catch {
      return null;
    }
  }

  async function deletePendingIfConfirmed(bundle) {
    const confirmedRevision = Number(bundle?.revision || 0);
    const confirmedOperationId = String(bundle?.operationId || '');
    const db = await openDb();
    let removed = false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readwrite');
      const store = tx.objectStore(STORE_PENDING);
      const request = store.get(PENDING_ID);
      request.onsuccess = () => {
        const record = request.result;
        if (!record) return;
        const recordRevision = Number(record.bundle?.revision || record.revision || 0);
        const recordOperationId = String(record.bundle?.operationId || record.operationId || '');
        const sameVault = String(record.bundle?.vaultId || '') === String(bundle?.vaultId || '');
        const exactOperation = confirmedOperationId && recordOperationId === confirmedOperationId;
        const recordVersion = Number(record.bundle?.formatVersion || 0);
        const confirmedVersion = Number(bundle?.formatVersion || 0);
        const confirmedDescendsPending = confirmedVersion >= 4 && recordVersion >= 4 && recordOperationId &&
          Array.isArray(bundle?.ancestors) && bundle.ancestors.includes(recordOperationId);
        const legacyConfirmed = confirmedVersion < 4 && recordVersion < 4 && recordRevision <= confirmedRevision;
        // Nunca descarte um WAL divergente só porque o número da revisão remota é maior.
        if (sameVault && (exactOperation || confirmedDescendsPending || legacyConfirmed)) {
          store.delete(PENDING_ID);
          removed = true;
        }
      };
      request.onerror = () => reject(request.error || new Error('SAVE_ENGINE_PENDING_CONFIRM_FAILED'));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('SAVE_ENGINE_PENDING_CONFIRM_FAILED'));
    });
    if (removed) {
      try { localStorage.removeItem(MARKER_KEY); } catch { /* ignore */ }
      broadcast({ type: 'remote-confirmed', revision: confirmedRevision, operationId: confirmedOperationId });
    }
    return removed;
  }

  function writeMarker(task) {
    try {
      localStorage.setItem(MARKER_KEY, JSON.stringify({
        schema: 1,
        vaultId: task.bundle?.vaultId || currentBundle?.vaultId || null,
        sequence: task.sequence,
        operationId: task.operationId,
        reason: task.reason,
        requestedAt: task.requestedAt,
        deviceId
      }));
    } catch { /* marker is best-effort and contains no secret */ }
  }

  function notify(event) {
    for (const listener of listeners) {
      try { listener(event); } catch (error) { console.warn('[KeyronSaveEngine] listener', error); }
    }
  }

  function broadcast(payload) {
    if (!channel) return;
    try { channel.postMessage({ ...payload, deviceId, at: Date.now() }); } catch { /* ignore */ }
  }

  function ensureChannel() {
    if (channel || typeof BroadcastChannel === 'undefined') return;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      const message = event.data;
      if (!message || message.deviceId === deviceId) return;
      notify({ type: 'other-tab', message });
    };
  }

  function initialize(bundle) {
    currentBundle = bundle ? clone(bundle) : null;
    ensureChannel();
    return currentBundle;
  }

  function resolveWaiters(upToSequence, result, error = null) {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.sequence > upToSequence) continue;
      waiters.splice(index, 1);
      if (error) waiter.reject(error); else waiter.resolve(result);
    }
  }

  async function processLoop() {
    try {
      while (latestTask) {
        const task = latestTask;
        latestTask = null;
        const source = currentBundle || task.bundle;
        if (!source) throw new Error('SAVE_ENGINE_NO_BASE_BUNDLE');

        const revision = Math.max(Number(source.revision || 0), Number(task.bundle?.revision || 0)) + 1;
        const bundle = await KeyronCrypto.updateBundle(task.key, source, task.vault, {
          revision,
          operationId: task.operationId,
          deviceId,
          saveReason: task.reason,
          locallySavedAt: new Date().toISOString()
        });
        const record = {
          id: PENDING_ID,
          schema: 1,
          sequence: task.sequence,
          revision,
          operationId: task.operationId,
          requestedAt: task.requestedAt,
          locallySavedAt: Date.now(),
          reason: task.reason,
          bundle
        };

        // WAL cifrado primeiro; current depois. Uma queda entre as duas etapas ainda é recuperável.
        await putPending(record);
        await KeyronStorage.saveCurrent(bundle);
        currentBundle = bundle;

        try { task.onLocalSaved?.(bundle); } catch (error) { console.warn('[KeyronSaveEngine] callback', error); }
        resolveWaiters(task.sequence, { bundle, revision, operationId: task.operationId });
        notify({ type: 'local-saved', bundle, revision, operationId: task.operationId });
        broadcast({ type: 'local-saved', revision, operationId: task.operationId, vaultId: bundle.vaultId });
      }
    } catch (error) {
      const failedSequence = latestTask?.sequence || Number.MAX_SAFE_INTEGER;
      resolveWaiters(failedSequence, null, error);
      notify({ type: 'local-error', error });
      throw error;
    } finally {
      workerPromise = null;
      if (latestTask) workerPromise = processLoop();
    }
  }

  function commit({ key, bundle, vault, reason = 'data-change', onLocalSaved } = {}) {
    if (!key || !bundle || !vault) return Promise.reject(new Error('SAVE_ENGINE_LOCKED'));
    const task = {
      key,
      bundle,
      vault: clone(vault),
      reason: String(reason || 'data-change').slice(0, 80),
      operationId: randomId(),
      requestedAt: Date.now(),
      sequence: nextSequence(),
      onLocalSaved
    };
    latestTask = task; // latest-wins: alterações rápidas são consolidadas em um único bundle.
    writeMarker(task);
    const promise = new Promise((resolve, reject) => waiters.push({ sequence: task.sequence, resolve, reject }));
    if (!workerPromise) workerPromise = processLoop();
    return promise;
  }


  async function stageBundle(bundle, reason = 'bundle-stage') {
    if (!bundle) throw new Error('SAVE_ENGINE_NO_BUNDLE');
    // Metadados de bundles v4 fazem parte da autenticação criptográfica. Nunca os
    // altere aqui depois que o Crypto os selou; apenas persista a cópia exata.
    KeyronCrypto.assertValidBundle(bundle, { allowLegacy: false });
    const staged = clone(bundle);
    const operationId = staged.operationId || randomId();
    if (Number(staged.formatVersion || 0) >= 4 && !staged.operationId) {
      throw new Error('SAVE_ENGINE_UNSIGNED_METADATA');
    }
    const task = {
      bundle: staged,
      sequence: nextSequence(),
      operationId,
      reason,
      requestedAt: Date.now()
    };
    writeMarker(task);
    await putPending({
      id: PENDING_ID,
      schema: 1,
      sequence: task.sequence,
      revision: Number(staged.revision || 0),
      operationId,
      requestedAt: task.requestedAt,
      locallySavedAt: Date.now(),
      reason,
      bundle: staged
    });
    await KeyronStorage.saveCurrent(staged);
    currentBundle = staged;
    notify({ type: 'local-saved', bundle: staged, revision: Number(staged.revision || 0), operationId });
    broadcast({ type: 'local-saved', revision: Number(staged.revision || 0), operationId, vaultId: staged.vaultId });
    return staged;
  }

  async function flush(timeoutMs = 1800) {
    if (!workerPromise && !latestTask) return { flushed: true, bundle: currentBundle };
    const work = workerPromise || processLoop();
    let timer;
    try {
      return await Promise.race([
        work.then(() => ({ flushed: true, bundle: currentBundle })),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ flushed: false, timeout: true, bundle: currentBundle }), Math.max(100, timeoutMs)); })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadPendingBundle() {
    const record = await getPendingRecord();
    return record?.bundle || null;
  }

  async function confirmRemote(bundle) {
    return deletePendingIfConfirmed(bundle).catch((error) => {
      console.warn('[KeyronSaveEngine] confirmRemote', error);
      return false;
    });
  }


  async function discardPending() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PENDING, 'readwrite');
        tx.objectStore(STORE_PENDING).delete(PENDING_ID);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('SAVE_ENGINE_PENDING_DISCARD_FAILED'));
      });
    } catch { /* fallback marker is still cleared below */ }
    try { localStorage.removeItem(MARKER_KEY); } catch { /* ignore */ }
    latestTask = null;
    return true;
  }

  async function status() {
    const pending = await getPendingRecord();
    return {
      pending: Boolean(pending),
      revision: Number(pending?.bundle?.revision || currentBundle?.revision || 0),
      operationId: pending?.bundle?.operationId || currentBundle?.operationId || null,
      marker: (() => { try { return JSON.parse(localStorage.getItem(MARKER_KEY) || 'null'); } catch { return null; } })()
    };
  }

  async function withDriveLock(callback) {
    if (navigator?.locks?.request) {
      return navigator.locks.request('keyron-drive-sync-v3', { mode: 'exclusive' }, callback);
    }
    return callback();
  }

  function onEvent(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getCurrentBundle() {
    return currentBundle;
  }

  return Object.freeze({
    initialize,
    commit,
    stageBundle,
    flush,
    loadPendingBundle,
    confirmRemote,
    discardPending,
    status,
    withDriveLock,
    onEvent,
    getCurrentBundle,
    deviceId
  });
})();
