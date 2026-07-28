// Armazena somente o bundle cifrado. IndexedDB evita o limite reduzido do localStorage,
// especialmente quando o cofre contém logos.
const KeyronStorage = (() => {
  'use strict';
  const DB_NAME = 'keyron-secure-vault';
  const DB_VERSION = 1;
  const STORE = 'encrypted';
  const CURRENT_KEY = 'current';
  const RECOVERY_KEY = 'conflict-recovery';
  const FALLBACK_KEY = 'keyron_encrypted_bundle_v2';
  const LEGACY_KEY = 'borion_senhas_bundle';

  let dbPromise = null;

  function localGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function localSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  function localRemove(key) {
    try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ }
  }

  function fallbackKeyFor(key) {
    return key === CURRENT_KEY ? FALLBACK_KEY : `${FALLBACK_KEY}_${key}`;
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    });
    return dbPromise;
  }

  async function get(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      const fallbackKey = fallbackKeyFor(key);
      const raw = localGet(fallbackKey);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch {
        localRemove(fallbackKey);
        return null;
      }
    }
  }

  async function set(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('INDEXEDDB_WRITE_ABORTED'));
      });
      // Uma cópia antiga no fallback não pode ressuscitar depois de logout/limpeza.
      localRemove(fallbackKeyFor(key));
    } catch (error) {
      try {
        if (!localSet(fallbackKeyFor(key), JSON.stringify(value))) throw error;
      } catch {
        throw error;
      }
    }
  }

  async function remove(key) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* IndexedDB indisponível: o fallback ainda será removido abaixo. */ }
    localRemove(fallbackKeyFor(key));
  }

  async function loadCurrent() {
    const current = await get(CURRENT_KEY);
    if (current) return current;

    // Migra automaticamente os bundles cifrados das versões anteriores.
    const fallbackRaw = localGet(FALLBACK_KEY);
    const legacyRaw = localGet(LEGACY_KEY);
    const raw = fallbackRaw || legacyRaw;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      await set(CURRENT_KEY, parsed);
      // set() remove o fallback somente quando o IndexedDB recebeu a cópia.
      // Se o fallback foi o único backend disponível, ele precisa permanecer.
      localRemove(LEGACY_KEY);
      return parsed;
    } catch {
      return null;
    }
  }

  return Object.freeze({
    loadCurrent,
    saveCurrent: (bundle) => set(CURRENT_KEY, bundle),
    saveRecovery: (bundle) => set(RECOVERY_KEY, bundle),
    loadRecovery: () => get(RECOVERY_KEY),
    clearCurrent: () => remove(CURRENT_KEY),
    get,
    set,
    remove
  });
})();
