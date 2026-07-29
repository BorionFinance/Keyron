/* Keyron Documents Cache — persiste somente containers já cifrados. */
const KeyronDocumentsCache = (() => {
  'use strict';

  const DB_NAME = 'keyron-documents-cache-v1';
  const DB_VERSION = 1;
  const STORE = 'encryptedObjects';
  let dbPromise = null;

  function key(vaultId, documentId, version = 1) {
    return `${String(vaultId)}:${String(documentId)}:${Number(version || 1)}`;
  }

  function openDb() {
    if (!('indexedDB' in globalThis)) return Promise.reject(new Error('DOCUMENT_CACHE_UNAVAILABLE'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('vaultId', 'vaultId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('DOCUMENT_CACHE_OPEN_FAILED'));
    });
    return dbPromise;
  }

  async function transaction(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error || new Error('DOCUMENT_CACHE_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('DOCUMENT_CACHE_ABORTED'));
    });
  }

  async function put(vaultId, documentId, version, encryptedBlob) {
    if (!(encryptedBlob instanceof Blob)) throw new Error('DOCUMENT_CACHE_REQUIRES_CIPHERTEXT');
    return transaction('readwrite', (store) => store.put({
      key: key(vaultId, documentId, version),
      vaultId: String(vaultId),
      documentId: String(documentId),
      version: Number(version || 1),
      encryptedBlob,
      bytes: encryptedBlob.size,
      storedAt: new Date().toISOString()
    }));
  }

  async function get(vaultId, documentId, version) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key(vaultId, documentId, version));
      request.onsuccess = () => resolve(request.result?.encryptedBlob instanceof Blob ? request.result.encryptedBlob : null);
      request.onerror = () => reject(request.error || new Error('DOCUMENT_CACHE_READ_FAILED'));
    });
  }

  async function remove(vaultId, documentId, version) {
    return transaction('readwrite', (store) => store.delete(key(vaultId, documentId, version)));
  }

  async function clearVault(vaultId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const index = tx.objectStore(STORE).index('vaultId');
      const request = index.openCursor(IDBKeyRange.only(String(vaultId)));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('DOCUMENT_CACHE_CLEAR_FAILED'));
    });
  }

  async function estimateVault(vaultId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let bytes = 0;
      let count = 0;
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).index('vaultId').openCursor(IDBKeyRange.only(String(vaultId)));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        bytes += Math.max(0, Number(cursor.value?.bytes || 0));
        count += 1;
        cursor.continue();
      };
      tx.oncomplete = () => resolve({ bytes, count });
      tx.onerror = () => reject(tx.error || new Error('DOCUMENT_CACHE_ESTIMATE_FAILED'));
    });
  }

  return Object.freeze({ DB_NAME, put, get, remove, clearVault, estimateVault });
})();
