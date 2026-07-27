// Keyron Drive — transporta apenas o bundle já cifrado.
// O escopo drive.file limita o app aos arquivos criados/abertos por ele.
const KeyronDrive = (() => {
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_NAME = 'Keyron';
  const BACKUP_FOLDER_NAME = 'Backups';
  const VAULT_NAME = 'vault.keyron';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let callbacks = { ready: null, error: null };
  let cachedStructure = null;
  let cachedRemoteBundle = null;

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
        callbacks.ready?.();
      },
      error_callback: (error) => callbacks.error?.(error?.type || 'Falha na janela de autenticação')
    });
  }

  function connect(forceAccountChoice = false) {
    if (!tokenClient) throw new Error('GOOGLE_CLIENT_NOT_INITIALIZED');
    tokenClient.requestAccessToken({ prompt: forceAccountChoice ? 'select_account' : '' });
  }

  function disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    cachedStructure = null;
    cachedRemoteBundle = null;
  }

  async function apiFetch(url, options = {}) {
    if (!isConnected()) throw new Error('DRIVE_NOT_CONNECTED');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) {
        accessToken = null;
        tokenExpiresAt = 0;
      }
      throw new Error(`DRIVE_${response.status}:${body.slice(0, 500)}`);
    }
    return response;
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
    });
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
    });
    return response.json();
  }

  async function updateJsonFile(fileId, content) {
    const response = await apiFetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(content)
    });
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
      appProperties: { keyronRole: role, keyronVersion: '2' }
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
      appProperties: { keyronRole: 'vault', keyronVersion: '2' }
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

  async function createSnapshot(bundle = cachedRemoteBundle) {
    if (!bundle) throw new Error('NO_BUNDLE_TO_BACKUP');
    const structure = await ensureStructure();
    const name = `${KeyronCrypto.randomId()}.keyron`;
    const file = await createJsonFile({
      name,
      mimeType: 'application/octet-stream',
      parents: [structure.backups.id],
      appProperties: { keyronRole: 'backup', keyronVersion: '2' }
    }, bundle);
    await trimBackups();
    return file;
  }

  async function shouldCreateAutomaticSnapshot() {
    const backups = await listBackups();
    if (!backups.length) return true;
    const newest = new Date(backups[0].createdTime || backups[0].modifiedTime).getTime();
    return !Number.isFinite(newest) || Date.now() - newest > 12 * 60 * 60 * 1000;
  }

  async function saveBundle(bundle, { automaticSnapshot = true } = {}) {
    const structure = await ensureStructure();
    if (structure.vault) {
      if (automaticSnapshot && cachedRemoteBundle && await shouldCreateAutomaticSnapshot().catch(() => false)) {
        await createSnapshot(cachedRemoteBundle).catch(() => null);
      }
      const result = await updateJsonFile(structure.vault.id, bundle);
      structure.vault = { ...structure.vault, ...result };
      cachedRemoteBundle = bundle;
      return result;
    }
    return createVaultFile(bundle);
  }

  return Object.freeze({
    ROOT_NAME,
    BACKUP_FOLDER_NAME,
    VAULT_NAME,
    init,
    connect,
    disconnect,
    isConnected,
    loadBundle,
    saveBundle,
    createSnapshot,
    ensureStructure
  });
})();
