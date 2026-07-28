// Keyron Offline Access — autorização local por dispositivo confiável.
// A chave HMAC é não exportável, fica somente no IndexedDB deste navegador e nunca vai ao Drive.
const KeyronOfflineAccess = (() => {
  'use strict';

  const DB_NAME = 'keyron-offline-access-v1';
  const DB_VERSION = 1;
  const STORE = 'authorizations';
  const SCHEMA = 1;
  const DEFAULT_TRUST_DAYS = 30;
  const MAX_TRUST_DAYS = 30;
  const MAX_CLOCK_ROLLBACK_MS = 5 * 60 * 1000;
  const MAX_LABEL_CHARS = 80;
  const MAX_ID_CHARS = 180;
  const encoder = new TextEncoder();
  let dbPromise = null;
  const mutationQueues = new Map();

  function fail(code) { throw new Error(code); }

  function supported() {
    return Boolean(globalThis.crypto?.subtle && globalThis.indexedDB);
  }

  function recordId(vaultId) {
    return `offline:${vaultId}`;
  }

  function withMutationLock(vaultId, callback) {
    const id = cleanText(vaultId) || 'unknown';
    const lockName = `keyron-offline-access:${id}`;
    if (globalThis.navigator?.locks?.request) {
      return navigator.locks.request(lockName, { mode: 'exclusive' }, callback);
    }
    const previous = mutationQueues.get(lockName) || Promise.resolve();
    const current = previous.catch(() => null).then(callback);
    mutationQueues.set(lockName, current);
    current.finally(() => {
      if (mutationQueues.get(lockName) === current) mutationQueues.delete(lockName);
    }).catch(() => null);
    return current;
  }

  function openDb() {
    if (!supported()) return Promise.reject(new Error('OFFLINE_ACCESS_UNAVAILABLE'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch { /* ignore */ }
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('OFFLINE_ACCESS_DB_OPEN_FAILED'));
      request.onblocked = () => reject(new Error('OFFLINE_ACCESS_DB_BLOCKED'));
    });
    return dbPromise;
  }

  async function getRecord(vaultId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(recordId(vaultId));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('OFFLINE_ACCESS_READ_FAILED'));
    });
  }

  async function putRecord(record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('OFFLINE_ACCESS_WRITE_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('OFFLINE_ACCESS_WRITE_ABORTED'));
    });
  }

  async function deleteRecord(vaultId) {
    if (!vaultId || !supported()) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(recordId(vaultId));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('OFFLINE_ACCESS_DELETE_FAILED'));
    });
  }

  function cleanText(value, max = MAX_ID_CHARS) {
    return String(value || '').trim().slice(0, max);
  }

  function parseIso(value, label) {
    if (typeof value !== 'string') fail(`OFFLINE_ACCESS_INVALID_${label}`);
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) fail(`OFFLINE_ACCESS_INVALID_${label}`);
    return parsed;
  }

  function bytesToBase64Url(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value, { exact = null, min = 1, max = 128, label = 'VALUE' } = {}) {
    if (typeof value !== 'string' || !value || value.length > Math.ceil(max * 4 / 3) + 8 || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`OFFLINE_ACCESS_INVALID_${label}`);
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    let binary;
    try { binary = atob(padded); } catch { fail(`OFFLINE_ACCESS_INVALID_${label}`); }
    if (exact != null && binary.length !== exact) fail(`OFFLINE_ACCESS_INVALID_${label}`);
    if (binary.length < min || binary.length > max) fail(`OFFLINE_ACCESS_INVALID_${label}`);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function randomNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    try { return bytesToBase64Url(bytes); } finally { bytes.fill(0); }
  }

  function isValidHmacKey(key) {
    return Boolean(
      key &&
      key.type === 'secret' &&
      key.extractable === false &&
      key.algorithm?.name === 'HMAC' &&
      key.algorithm?.hash?.name === 'SHA-256' &&
      Array.isArray(key.usages) &&
      key.usages.includes('sign') &&
      key.usages.includes('verify')
    );
  }

  function signedFields(record) {
    return [
      'KEYRON_OFFLINE_ACCESS',
      String(record.schema),
      record.vaultId,
      record.ownerBinding,
      record.deviceId,
      record.deviceLabel,
      record.operationId,
      String(record.revision),
      record.createdAt,
      record.verifiedAt,
      record.expiresAt,
      record.lastSeenAt,
      record.nonce
    ].join('|');
  }

  async function signRecord(record, key = record.key) {
    if (!isValidHmacKey(key)) fail('OFFLINE_ACCESS_INVALID_KEY');
    const data = encoder.encode(signedFields(record));
    try {
      return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, data));
    } finally {
      data.fill(0);
    }
  }

  async function verifyProof(record) {
    if (!isValidHmacKey(record.key)) fail('OFFLINE_ACCESS_INVALID_KEY');
    const proof = base64UrlToBytes(record.proof, { exact: 32, max: 32, label: 'PROOF' });
    const data = encoder.encode(signedFields(record));
    try {
      return await crypto.subtle.verify('HMAC', record.key, proof, data);
    } finally {
      proof.fill(0);
      data.fill(0);
    }
  }

  function validateRecord(record, vaultId, ownerBinding, deviceId, now = Date.now(), { allowExpired = false } = {}) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('OFFLINE_ACCESS_NOT_AUTHORIZED');
    if (record.schema !== SCHEMA || record.id !== recordId(vaultId) || record.vaultId !== vaultId) fail('OFFLINE_ACCESS_INVALID_RECORD');
    if (!record.ownerBinding || record.ownerBinding !== ownerBinding) fail('OFFLINE_ACCESS_OWNER_MISMATCH');
    if (!record.deviceId || record.deviceId !== deviceId) fail('OFFLINE_ACCESS_DEVICE_MISMATCH');
    if (typeof record.deviceLabel !== 'string' || !record.deviceLabel || record.deviceLabel.length > MAX_LABEL_CHARS) fail('OFFLINE_ACCESS_INVALID_LABEL');
    if (typeof record.operationId !== 'string' || !record.operationId || record.operationId.length > MAX_ID_CHARS) fail('OFFLINE_ACCESS_INVALID_OPERATION');
    if (!Number.isSafeInteger(record.revision) || record.revision < 1) fail('OFFLINE_ACCESS_INVALID_REVISION');
    if (typeof record.nonce !== 'string') fail('OFFLINE_ACCESS_INVALID_NONCE');
    const nonce = base64UrlToBytes(record.nonce, { exact: 32, max: 32, label: 'NONCE' });
    nonce.fill(0);
    const createdAt = parseIso(record.createdAt, 'CREATED_AT');
    const verifiedAt = parseIso(record.verifiedAt, 'VERIFIED_AT');
    const expiresAt = parseIso(record.expiresAt, 'EXPIRES_AT');
    const lastSeenAt = parseIso(record.lastSeenAt, 'LAST_SEEN_AT');
    if (verifiedAt < createdAt || expiresAt <= verifiedAt || expiresAt - verifiedAt > (MAX_TRUST_DAYS * 86400000) + 60000) fail('OFFLINE_ACCESS_INVALID_WINDOW');
    if (lastSeenAt < createdAt) fail('OFFLINE_ACCESS_INVALID_CLOCK');
    if (now < lastSeenAt - MAX_CLOCK_ROLLBACK_MS) fail('OFFLINE_ACCESS_CLOCK_ROLLBACK');
    if (!allowExpired && now > expiresAt) fail('OFFLINE_ACCESS_EXPIRED');
    if (!isValidHmacKey(record.key)) fail('OFFLINE_ACCESS_INVALID_KEY');
    return { createdAt, verifiedAt, expiresAt, lastSeenAt };
  }

  function validateInputs({ vaultId, ownerBinding, deviceId }) {
    const cleanVaultId = cleanText(vaultId);
    const cleanOwnerBinding = cleanText(ownerBinding);
    const cleanDeviceId = cleanText(deviceId);
    if (!cleanVaultId || cleanVaultId.length > MAX_ID_CHARS) fail('OFFLINE_ACCESS_INVALID_VAULT');
    if (!cleanOwnerBinding || cleanOwnerBinding.length > MAX_ID_CHARS) fail('OFFLINE_ACCESS_INVALID_OWNER');
    if (!cleanDeviceId || cleanDeviceId.length > MAX_ID_CHARS) fail('OFFLINE_ACCESS_INVALID_DEVICE');
    return { vaultId: cleanVaultId, ownerBinding: cleanOwnerBinding, deviceId: cleanDeviceId };
  }

  function publicInfo(record, now = Date.now()) {
    return Object.freeze({
      authorized: true,
      vaultId: record.vaultId,
      ownerBinding: record.ownerBinding,
      deviceId: record.deviceId,
      deviceLabel: record.deviceLabel,
      operationId: record.operationId,
      revision: record.revision,
      createdAt: record.createdAt,
      verifiedAt: record.verifiedAt,
      expiresAt: record.expiresAt,
      lastSeenAt: record.lastSeenAt,
      expired: now > Date.parse(record.expiresAt)
    });
  }

  async function enrollUnlocked({ vaultId, ownerBinding, deviceId, deviceLabel, operationId, revision, trustDays = DEFAULT_TRUST_DAYS } = {}) {
    if (!supported()) fail('OFFLINE_ACCESS_UNAVAILABLE');
    const ids = validateInputs({ vaultId, ownerBinding, deviceId });
    const label = cleanText(deviceLabel, MAX_LABEL_CHARS) || 'Dispositivo pessoal';
    const cleanOperationId = cleanText(operationId);
    const cleanRevision = Number(revision);
    if (!cleanOperationId || !Number.isSafeInteger(cleanRevision) || cleanRevision < 1) fail('OFFLINE_ACCESS_INVALID_LINEAGE');
    const days = Math.max(1, Math.min(MAX_TRUST_DAYS, Number(trustDays) || DEFAULT_TRUST_DAYS));
    const now = Date.now();
    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify']
    );
    if (!isValidHmacKey(key)) fail('OFFLINE_ACCESS_KEY_CREATION_FAILED');
    const record = {
      id: recordId(ids.vaultId),
      schema: SCHEMA,
      vaultId: ids.vaultId,
      ownerBinding: ids.ownerBinding,
      deviceId: ids.deviceId,
      deviceLabel: label,
      operationId: cleanOperationId,
      revision: cleanRevision,
      createdAt: new Date(now).toISOString(),
      verifiedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86400000).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      nonce: randomNonce(),
      key,
      proof: ''
    };
    record.proof = await signRecord(record, key);
    await putRecord(record);
    try { await navigator.storage?.persist?.(); } catch { /* persistência é best-effort */ }
    return publicInfo(record, now);
  }

  function validateBundleLineage(bundle, record) {
    const operationId = cleanText(bundle?.operationId);
    const revision = Number(bundle?.revision);
    if (!operationId || !Number.isSafeInteger(revision) || revision < 1) fail('OFFLINE_ACCESS_INVALID_BUNDLE_LINEAGE');
    const exact = operationId === record.operationId;
    const descends = Array.isArray(bundle?.ancestors) && bundle.ancestors.includes(record.operationId);
    if (!exact && !descends) fail('OFFLINE_ACCESS_LINEAGE_MISMATCH');
    if (revision < record.revision) fail('OFFLINE_ACCESS_REVISION_ROLLBACK');
    return { operationId, revision };
  }

  async function verifyUnlocked(bundle, deviceId, { now = Date.now(), touch = true } = {}) {
    if (!supported()) fail('OFFLINE_ACCESS_UNAVAILABLE');
    const vaultId = cleanText(bundle?.vaultId);
    const ownerBinding = cleanText(bundle?.ownerBinding);
    const ids = validateInputs({ vaultId, ownerBinding, deviceId });
    const record = await getRecord(ids.vaultId);
    validateRecord(record, ids.vaultId, ids.ownerBinding, ids.deviceId, now);
    if (!(await verifyProof(record))) fail('OFFLINE_ACCESS_TAMPERED');
    const lineage = validateBundleLineage(bundle, record);

    if (touch && now - Date.parse(record.lastSeenAt) >= 60000) {
      record.lastSeenAt = new Date(now).toISOString();
      record.operationId = lineage.operationId;
      record.revision = lineage.revision;
      record.proof = await signRecord(record);
      await putRecord(record);
    }
    return publicInfo(record, now);
  }

  async function refreshUnlocked({ vaultId, ownerBinding, deviceId, deviceLabel, operationId, revision, trustDays = DEFAULT_TRUST_DAYS } = {}) {
    if (!supported()) fail('OFFLINE_ACCESS_UNAVAILABLE');
    const ids = validateInputs({ vaultId, ownerBinding, deviceId });
    const now = Date.now();
    const cleanOperationId = cleanText(operationId);
    const cleanRevision = Number(revision);
    if (!cleanOperationId || !Number.isSafeInteger(cleanRevision) || cleanRevision < 1) fail('OFFLINE_ACCESS_INVALID_LINEAGE');
    const record = await getRecord(ids.vaultId);
    validateRecord(record, ids.vaultId, ids.ownerBinding, ids.deviceId, now, { allowExpired: true });
    if (!(await verifyProof(record))) fail('OFFLINE_ACCESS_TAMPERED');
    const days = Math.max(1, Math.min(MAX_TRUST_DAYS, Number(trustDays) || DEFAULT_TRUST_DAYS));
    record.deviceLabel = cleanText(deviceLabel, MAX_LABEL_CHARS) || record.deviceLabel;
    record.operationId = cleanOperationId;
    record.revision = cleanRevision;
    record.verifiedAt = new Date(now).toISOString();
    record.expiresAt = new Date(now + days * 86400000).toISOString();
    record.lastSeenAt = new Date(now).toISOString();
    record.nonce = randomNonce();
    record.proof = await signRecord(record);
    await putRecord(record);
    try { await navigator.storage?.persist?.(); } catch { /* best-effort */ }
    return publicInfo(record, now);
  }

  async function advanceUnlocked(bundle, deviceId, { now = Date.now() } = {}) {
    if (!supported()) fail('OFFLINE_ACCESS_UNAVAILABLE');
    const vaultId = cleanText(bundle?.vaultId);
    const ownerBinding = cleanText(bundle?.ownerBinding);
    const ids = validateInputs({ vaultId, ownerBinding, deviceId });
    const record = await getRecord(ids.vaultId);
    validateRecord(record, ids.vaultId, ids.ownerBinding, ids.deviceId, now);
    if (!(await verifyProof(record))) fail('OFFLINE_ACCESS_TAMPERED');
    const lineage = validateBundleLineage(bundle, record);
    record.operationId = lineage.operationId;
    record.revision = lineage.revision;
    record.lastSeenAt = new Date(now).toISOString();
    record.nonce = randomNonce();
    record.proof = await signRecord(record);
    await putRecord(record);
    return publicInfo(record, now);
  }

  function enroll(options = {}) {
    return withMutationLock(options?.vaultId, () => enrollUnlocked(options));
  }

  function verify(bundle, deviceId, options = {}) {
    if (options?.touch === false) return verifyUnlocked(bundle, deviceId, options);
    return withMutationLock(bundle?.vaultId, () => verifyUnlocked(bundle, deviceId, options));
  }

  function refresh(options = {}) {
    return withMutationLock(options?.vaultId, () => refreshUnlocked(options));
  }

  function advance(bundle, deviceId, options = {}) {
    return withMutationLock(bundle?.vaultId, () => advanceUnlocked(bundle, deviceId, options));
  }

  function revoke(vaultId) {
    return withMutationLock(vaultId, () => revokeUnlocked(vaultId));
  }

  async function status(bundle, deviceId, { now = Date.now() } = {}) {
    try {
      return await verifyUnlocked(bundle, deviceId, { now, touch: false });
    } catch (error) {
      return Object.freeze({ authorized: false, reason: error?.message || 'OFFLINE_ACCESS_NOT_AUTHORIZED' });
    }
  }

  async function revokeUnlocked(vaultId) {
    await deleteRecord(cleanText(vaultId));
    return true;
  }

  return Object.freeze({
    supported,
    enroll,
    verify,
    refresh,
    advance,
    status,
    revoke,
    DEFAULT_TRUST_DAYS,
    MAX_TRUST_DAYS
  });
})();

// Exposição explícita para a interface. A API permanece congelada e não contém segredos.
globalThis.KeyronOfflineAccess = KeyronOfflineAccess;
