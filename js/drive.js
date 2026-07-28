// Keyron Drive — transporta somente bundles já cifrados.
// O escopo drive.file limita o app aos arquivos criados/abertos pelo próprio Keyron.
const KeyronDrive = (() => {
  'use strict';

  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_NAME = 'Keyron';
  const BACKUP_FOLDER_NAME = 'Backups';
  const VAULT_NAME = 'vault.keyron';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SNAPSHOT_CACHE_KEY = 'keyron_last_snapshot_at_v4';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let callbacks = { ready: null, error: null };
  let cachedStructure = null;
  let cachedRemoteBundle = null;
  let cachedVaultEtag = null;
  let currentUser = null;
  let snapshotInFlight = null;

  function isConnected() {
    return Boolean(accessToken) && Date.now() < tokenExpiresAt;
  }

  function init(clientId, onReady, onError) {
    if (!window.google?.accounts?.oauth2) throw new Error('GOOGLE_LIBRARY_NOT_READY');
    callbacks = { ready: onReady, error: onError };
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          callbacks.error?.(response.error_description || response.error);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) * 1000) - 60000;
        // Um novo token pode pertencer a outra conta: nunca reutilize IDs/ETag do Drive anterior.
        cachedStructure = null;
        cachedRemoteBundle = null;
        cachedVaultEtag = null;
        currentUser = null;
        fetchCurrentUser()
          .then((profile) => callbacks.ready?.(profile))
          .catch((error) => {
            console.error('[KeyronDrive] conta Google sem identificador verificável', error);
            accessToken = null;
            tokenExpiresAt = 0;
            callbacks.error?.('GOOGLE_ACCOUNT_ID_UNAVAILABLE');
          });
      },
      error_callback: (error) => callbacks.error?.(error?.type || 'Falha na janela de autenticação')
    });
  }

  function connect(forceAccountChoice = false) {
    if (!tokenClient) throw new Error('GOOGLE_CLIENT_NOT_INITIALIZED');
    tokenClient.requestAccessToken(forceAccountChoice ? { prompt: 'select_account' } : {});
  }

  async function fetchCurrentUser() {
    if (!isConnected()) return null;
    const response = await apiFetch(`${API}/about?fields=user(permissionId,displayName,emailAddress,photoLink)`, { cache: 'no-store' });
    const data = await response.json();
    const profile = data?.user || {};
    currentUser = {
      id: profile.permissionId || '',
      name: profile.displayName || profile.emailAddress || 'Conta Google',
      email: profile.emailAddress || '',
      picture: profile.photoLink || ''
    };
    if (!currentUser.id) throw new Error('GOOGLE_ACCOUNT_ID_UNAVAILABLE');
    return currentUser;
  }

  function getCurrentUser() {
    return currentUser ? { ...currentUser } : null;
  }

  function disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
    tokenExpiresAt = 0;
    cachedStructure = null;
    cachedRemoteBundle = null;
    cachedVaultEtag = null;
    currentUser = null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function apiFetch(url, options = {}, policy = {}) {
    if (!isConnected()) throw new Error('DRIVE_NOT_CONNECTED');
    const method = String(options.method || 'GET').toUpperCase();
    const idempotent = policy.idempotent ?? ['GET', 'HEAD', 'PATCH', 'PUT', 'DELETE'].includes(method);
    const maxAttempts = idempotent ? Number(policy.attempts || 3) : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Number(policy.timeoutMs || 20000));
      try {
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${accessToken}`);
        const response = await fetch(url, { ...options, headers, signal: options.signal || controller.signal, referrerPolicy: 'no-referrer' });
        if (response.ok) return response;

        const body = await response.text().catch(() => '');
        if (response.status === 401) {
          accessToken = null;
          tokenExpiresAt = 0;
        }
        const error = new Error(`DRIVE_${response.status}:${body.slice(0, 500)}`);
        error.status = response.status;
        error.code = response.status === 412 ? 'DRIVE_CONFLICT' : `DRIVE_${response.status}`;
        const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
        if (!transient || attempt >= maxAttempts) throw error;
        lastError = error;
      } catch (error) {
        const transient = error?.name === 'AbortError' || /network|failed to fetch/i.test(String(error?.message || ''));
        if (!transient || attempt >= maxAttempts) throw error;
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
      }
      await sleep([350, 900, 2200][attempt - 1] || 3000);
    }
    throw lastError || new Error('DRIVE_REQUEST_FAILED');
  }

  function escapeQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function listFiles(query, fields = 'files(id,name,mimeType,createdTime,modifiedTime,parents,appProperties)', pageSize = 100) {
    const params = new URLSearchParams({ q: query, spaces: 'drive', fields, pageSize: String(pageSize), orderBy: 'modifiedTime desc' });
    const response = await apiFetch(`${API}/files?${params.toString()}`);
    return response.json();
  }

  async function createMetadata(metadata, fields = 'id,name,mimeType,createdTime,modifiedTime,parents,appProperties') {
    const response = await apiFetch(`${API}/files?fields=${encodeURIComponent(fields)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(metadata)
    }, { idempotent: false });
    return response.json();
  }

  function maxBundleBytes() {
    return Number(KeyronConfig.MAX_BUNDLE_BYTES || KeyronCrypto.MAX_CIPHERTEXT_BYTES || 67108864);
  }

  function serializeBundle(content) {
    KeyronCrypto.assertValidBundle(content);
    const serialized = JSON.stringify(content);
    if (new TextEncoder().encode(serialized).byteLength > maxBundleBytes()) {
      throw new Error('DRIVE_VAULT_TOO_LARGE');
    }
    return serialized;
  }

  async function createJsonFile(metadata, content, fields = 'id,name,createdTime,modifiedTime,parents,appProperties') {
    const serialized = serializeBundle(content);
    const boundary = `keyron_${KeyronCrypto.randomId().replace(/[^a-z0-9]/gi, '')}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${serialized}\r\n` +
      `--${boundary}--`;
    const response = await apiFetch(`${UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }, { idempotent: false, timeoutMs: 30000 });
    return { file: await response.json(), etag: response.headers.get('etag') || null };
  }

  async function updateJsonFile(fileId, content, expectedEtag = null) {
    const serialized = serializeBundle(content);
    if (!expectedEtag) {
      const error = new Error('DRIVE_ETAG_UNAVAILABLE');
      error.code = 'DRIVE_ETAG_UNAVAILABLE';
      throw error;
    }
    const headers = { 'Content-Type': 'application/octet-stream', 'If-Match': expectedEtag };
    const response = await apiFetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
      method: 'PATCH',
      headers,
      body: serialized
    }, { attempts: 3, timeoutMs: 30000 });
    return { file: await response.json(), etag: response.headers.get('etag') || null };
  }

  async function downloadJsonFile(fileId) {
    const response = await apiFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { cache: 'no-store' });
    const maxBytes = maxBundleBytes();
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('DRIVE_VAULT_TOO_LARGE');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('DRIVE_VAULT_TOO_LARGE');
    let bundle;
    try { bundle = JSON.parse(text); } catch { throw new Error('DRIVE_INVALID_VAULT_FILE'); }
    try { KeyronCrypto.assertValidBundle(bundle); } catch { throw new Error('DRIVE_INVALID_VAULT_FILE'); }
    return { bundle, etag: response.headers.get('etag') || null };
  }

  async function findOrCreateFolder({ name, parentId = null, role }) {
    const clauses = [
      `mimeType='${FOLDER_MIME}'`,
      'trashed=false',
      `name='${escapeQuery(name)}'`,
      `appProperties has { key='keyronRole' and value='${escapeQuery(role)}' }`
    ];
    if (parentId) clauses.push(`'${escapeQuery(parentId)}' in parents`);
    const result = await listFiles(clauses.join(' and '));
    if (result.files?.[0]) return result.files[0];
    return createMetadata({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
      appProperties: { keyronRole: role, keyronVersion: '4' }
    });
  }

  async function findVaultFile(rootId) {
    const query = [
      `'${escapeQuery(rootId)}' in parents`,
      'trashed=false',
      `name='${VAULT_NAME}'`,
      `appProperties has { key='keyronRole' and value='vault' }`
    ].join(' and ');
    const result = await listFiles(query);
    return result.files?.[0] || null;
  }

  async function ensureStructure() {
    if (cachedStructure) return cachedStructure;
    const root = await findOrCreateFolder({ name: ROOT_NAME, role: 'root' });
    const backups = await findOrCreateFolder({ name: BACKUP_FOLDER_NAME, parentId: root.id, role: 'backups' });
    const vault = await findVaultFile(root.id);
    cachedStructure = { root, backups, vault };
    return cachedStructure;
  }

  async function findLegacyBundle() {
    const result = await listFiles("name='borion-senhas-vault.json' and trashed=false");
    const file = result.files?.[0];
    if (!file) return null;
    const downloaded = await downloadJsonFile(file.id);
    return { bundle: downloaded.bundle, file, etag: downloaded.etag, legacy: true };
  }

  async function loadBundle({ force = false } = {}) {
    const structure = await ensureStructure();
    if (structure.vault) {
      if (!force && cachedRemoteBundle) return { bundle: cachedRemoteBundle, file: structure.vault, etag: cachedVaultEtag, legacy: false };
      const downloaded = await downloadJsonFile(structure.vault.id);
      cachedRemoteBundle = downloaded.bundle;
      cachedVaultEtag = downloaded.etag;
      return { bundle: downloaded.bundle, file: structure.vault, etag: downloaded.etag, legacy: false };
    }
    const legacy = await findLegacyBundle();
    if (legacy) {
      cachedRemoteBundle = legacy.bundle;
      cachedVaultEtag = legacy.etag;
      return legacy;
    }
    return null;
  }

  async function createVaultFile(bundle) {
    const structure = await ensureStructure();
    const created = await createJsonFile({
      name: VAULT_NAME,
      mimeType: 'application/octet-stream',
      parents: [structure.root.id],
      appProperties: { keyronRole: 'vault', keyronVersion: '4' }
    }, bundle);
    structure.vault = created.file;
    cachedRemoteBundle = bundle;
    cachedVaultEtag = created.etag;
    return created.file;
  }

  async function listBackups() {
    const structure = await ensureStructure();
    const query = [
      `'${escapeQuery(structure.backups.id)}' in parents`,
      'trashed=false',
      `appProperties has { key='keyronRole' and value='backup' }`
    ].join(' and ');
    const result = await listFiles(query, 'files(id,name,createdTime,modifiedTime,appProperties)', 100);
    return result.files || [];
  }

  async function trimBackups() {
    const files = await listBackups();
    const max = Number(KeyronConfig.MAX_DRIVE_BACKUPS || 10);
    const excess = files.slice(max);
    await Promise.all(excess.map((file) => apiFetch(`${API}/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' }).catch(() => null)));
  }

  function snapshotCacheKey() {
    const account = String(currentUser?.id || 'unverified').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
    return `${SNAPSHOT_CACHE_KEY}:${account}`;
  }

  function readLastSnapshotAt() {
    try { return Number(localStorage.getItem(snapshotCacheKey()) || 0); } catch { return 0; }
  }

  function writeLastSnapshotAt(value = Date.now()) {
    try { localStorage.setItem(snapshotCacheKey(), String(value)); } catch { /* ignore */ }
  }

  async function createSnapshot(bundle = cachedRemoteBundle, options = {}) {
    if (!bundle) throw new Error('NO_BUNDLE_TO_BACKUP');
    KeyronCrypto.assertValidBundle(bundle);
    const allowParallel = Boolean(options.conflict);
    if (snapshotInFlight && !allowParallel) return snapshotInFlight;
    const work = (async () => {
      const structure = await ensureStructure();
      const prefix = options.conflict ? 'CONFLITO_' : '';
      const name = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}_${KeyronCrypto.randomId().slice(0, 8)}.keyron`;
      const created = await createJsonFile({
        name,
        mimeType: 'application/octet-stream',
        parents: [structure.backups.id],
        appProperties: { keyronRole: 'backup', keyronVersion: '4', keyronConflict: options.conflict ? 'true' : 'false' }
      }, bundle);
      writeLastSnapshotAt();
      await trimBackups().catch(() => null);
      return created.file;
    })();
    if (allowParallel) return work;
    snapshotInFlight = work;
    try { return await work; } finally { snapshotInFlight = null; }
  }

  async function shouldCreateAutomaticSnapshot() {
    const interval = Number(KeyronConfig.AUTO_SNAPSHOT_HOURS || 12) * 60 * 60 * 1000;
    const cachedAt = readLastSnapshotAt();
    if (cachedAt && Date.now() - cachedAt < interval) return false;
    const backups = await listBackups();
    if (!backups.length) return true;
    const newest = new Date(backups[0].createdTime || backups[0].modifiedTime).getTime();
    if (Number.isFinite(newest)) writeLastSnapshotAt(newest);
    return !Number.isFinite(newest) || Date.now() - newest > interval;
  }

  async function ensureCurrentEtag(structure) {
    if (cachedVaultEtag || !structure.vault) return;
    const downloaded = await downloadJsonFile(structure.vault.id);
    cachedRemoteBundle = downloaded.bundle;
    cachedVaultEtag = downloaded.etag;
  }

  async function saveBundle(bundle, { automaticSnapshot = true } = {}) {
    KeyronCrypto.assertValidBundle(bundle);
    const structure = await ensureStructure();
    if (!structure.vault) return createVaultFile(bundle);

    await ensureCurrentEtag(structure);
    const previousRemote = cachedRemoteBundle;
    const updated = await updateJsonFile(structure.vault.id, bundle, cachedVaultEtag);
    structure.vault = { ...structure.vault, ...updated.file };
    cachedRemoteBundle = bundle;
    cachedVaultEtag = updated.etag;

    if (automaticSnapshot && previousRemote) {
      shouldCreateAutomaticSnapshot()
        .then((needed) => needed && createSnapshot(previousRemote))
        .catch(() => null);
    }
    return updated.file;
  }

  async function reloadBundle() {
    cachedRemoteBundle = null;
    cachedVaultEtag = null;
    return loadBundle({ force: true });
  }

  return Object.freeze({
    ROOT_NAME,
    BACKUP_FOLDER_NAME,
    VAULT_NAME,
    init,
    connect,
    disconnect,
    isConnected,
    getCurrentUser,
    loadBundle,
    reloadBundle,
    saveBundle,
    createSnapshot,
    ensureStructure
  });
})();
