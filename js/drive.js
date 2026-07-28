// Keyron Drive — transporta somente bundles já cifrados.
// O escopo drive.file limita o app aos arquivos criados/abertos pelo próprio Keyron.
const KeyronDrive = (() => {
  'use strict';

  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file';
  const ROOT_NAME = 'Keyron';
  const BACKUP_FOLDER_NAME = 'Backups';
  const VAULT_NAME = 'vault.keyron';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SNAPSHOT_CACHE_KEY = 'keyron_last_snapshot_at_v3';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let callbacks = { ready: null, error: null };
  let cachedStructure = null;
  let cachedRemoteBundle = null;
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
        fetchCurrentUser().catch(() => null).finally(() => callbacks.ready?.(currentUser));
      },
      error_callback: (error) => callbacks.error?.(error?.type || 'Falha na janela de autenticação')
    });
  }

  function connect(forceAccountChoice = false) {
    if (!tokenClient) throw new Error('GOOGLE_CLIENT_NOT_INITIALIZED');
    tokenClient.requestAccessToken({ prompt: forceAccountChoice ? 'select_account' : '' });
  }

  async function fetchCurrentUser() {
    if (!isConnected()) return null;
    const response = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo', { cache: 'no-store' });
    const profile = await response.json();
    currentUser = {
      id: profile.sub || '',
      name: profile.name || profile.email || 'Conta Google',
      email: profile.email || '',
      picture: profile.picture || ''
    };
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
        const response = await fetch(url, { ...options, headers, signal: options.signal || controller.signal });
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

  async function createJsonFile(metadata, content, fields = 'id,name,createdTime,modifiedTime,parents,appProperties') {
    const boundary = `keyron_${KeyronCrypto.randomId().replace(/[^a-z0-9]/gi, '')}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${JSON.stringify(content)}\r\n` +
      `--${boundary}--`;
    const response = await apiFetch(`${UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }, { idempotent: false, timeoutMs: 30000 });
    return response.json();
  }

  async function updateJsonFile(fileId, content) {
    const response = await apiFetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(content)
    }, { attempts: 3, timeoutMs: 30000 });
    return response.json();
  }

  async function downloadJsonFile(fileId) {
    const response = await apiFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { cache: 'no-store' });
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error('DRIVE_INVALID_VAULT_FILE'); }
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
      appProperties: { keyronRole: role, keyronVersion: '3' }
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
    const bundle = await downloadJsonFile(file.id);
    return { bundle, file, legacy: true };
  }

  async function loadBundle() {
    const structure = await ensureStructure();
    if (structure.vault) {
      const bundle = await downloadJsonFile(structure.vault.id);
      cachedRemoteBundle = bundle;
      return { bundle, file: structure.vault, legacy: false };
    }
    const legacy = await findLegacyBundle();
    if (legacy) {
      cachedRemoteBundle = legacy.bundle;
      return legacy;
    }
    return null;
  }

  async function createVaultFile(bundle) {
    const structure = await ensureStructure();
    const file = await createJsonFile({
      name: VAULT_NAME,
      mimeType: 'application/octet-stream',
      parents: [structure.root.id],
      appProperties: { keyronRole: 'vault', keyronVersion: '3' }
    }, bundle);
    structure.vault = file;
    cachedRemoteBundle = bundle;
    return file;
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

  function readLastSnapshotAt() {
    try { return Number(localStorage.getItem(SNAPSHOT_CACHE_KEY) || 0); } catch { return 0; }
  }

  function writeLastSnapshotAt(value = Date.now()) {
    try { localStorage.setItem(SNAPSHOT_CACHE_KEY, String(value)); } catch { /* ignore */ }
  }

  async function createSnapshot(bundle = cachedRemoteBundle) {
    if (!bundle) throw new Error('NO_BUNDLE_TO_BACKUP');
    if (snapshotInFlight) return snapshotInFlight;
    snapshotInFlight = (async () => {
      const structure = await ensureStructure();
      const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${KeyronCrypto.randomId().slice(0, 8)}.keyron`;
      const file = await createJsonFile({
        name,
        mimeType: 'application/octet-stream',
        parents: [structure.backups.id],
        appProperties: { keyronRole: 'backup', keyronVersion: '3' }
      }, bundle);
      writeLastSnapshotAt();
      await trimBackups().catch(() => null);
      return file;
    })();
    try { return await snapshotInFlight; } finally { snapshotInFlight = null; }
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

  async function saveBundle(bundle, { automaticSnapshot = true } = {}) {
    const structure = await ensureStructure();
    if (!structure.vault) return createVaultFile(bundle);

    const previousRemote = cachedRemoteBundle;
    const result = await updateJsonFile(structure.vault.id, bundle);
    structure.vault = { ...structure.vault, ...result };
    cachedRemoteBundle = bundle;

    // O snapshot da versão anterior é feito depois da confirmação do current,
    // em segundo plano, para não atrasar o salvamento principal.
    if (automaticSnapshot && previousRemote) {
      shouldCreateAutomaticSnapshot()
        .then((needed) => needed && createSnapshot(previousRemote))
        .catch(() => null);
    }
    return result;
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
    saveBundle,
    createSnapshot,
    ensureStructure
  });
})();
