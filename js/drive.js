// Keyron Drive — transporta somente bundles já cifrados.
// O escopo drive.file limita o app aos arquivos criados/abertos pelo próprio Keyron.
const KeyronDrive = (() => {
  'use strict';

  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_NAME = 'Keyron';
  const BACKUP_FOLDER_NAME = 'Backups';
  const DOCUMENT_FOLDER_NAME = 'Documents';
  const DOCUMENT_OBJECTS_FOLDER_NAME = 'Objects';
  const MAX_DOCUMENT_BYTES = 270 * 1024 * 1024;
  const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
  const VAULT_NAME = 'vault.keyron';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SNAPSHOT_CACHE_KEY = 'keyron_last_snapshot_at_v5';

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

  async function createMetadata(metadata, fields = 'id,name,mimeType,createdTime,modifiedTime,version,size,md5Checksum,parents,appProperties') {
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

  async function createJsonFile(metadata, content, fields = 'id,name,createdTime,modifiedTime,version,size,md5Checksum,parents,appProperties') {
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
    const headers = { 'Content-Type': 'application/octet-stream' };
    // Alguns navegadores não expõem o ETag do Google Drive ao JavaScript. Quando
    // ele existe, mantemos a proteção atômica If-Match; quando não existe, a
    // proteção passa a ser preflight de linhagem + leitura de confirmação.
    if (expectedEtag) headers['If-Match'] = expectedEtag;
    const response = await apiFetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,version,size,md5Checksum`, {
      method: 'PATCH',
      headers,
      body: serialized
    }, { attempts: 3, timeoutMs: 30000 });
    const text = await response.text().catch(() => '');
    let file = {};
    if (text) {
      try { file = JSON.parse(text); } catch { file = {}; }
    }
    return { file, etag: response.headers.get('etag') || null };
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

  function sameOperation(left, right) {
    return Boolean(left?.operationId && right?.operationId && left.operationId === right.operationId);
  }

  function bundleDescendsFrom(candidate, ancestor) {
    if (!candidate || !ancestor || candidate.vaultId !== ancestor.vaultId) return false;
    if (sameOperation(candidate, ancestor)) return true;
    if (Number(candidate.formatVersion || 0) >= 4 && Number(ancestor.formatVersion || 0) >= 4) {
      return Boolean(ancestor.operationId && Array.isArray(candidate.ancestors) && candidate.ancestors.includes(ancestor.operationId));
    }
    return Number(candidate.revision || 0) >= Number(ancestor.revision || 0);
  }

  function driveConflict(message = 'DRIVE_CONFLICT') {
    const error = new Error(message);
    error.code = 'DRIVE_CONFLICT';
    return error;
  }

  async function readRemoteForWrite(fileId) {
    const downloaded = await downloadJsonFile(fileId);
    return { bundle: downloaded.bundle, etag: downloaded.etag || null };
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
      appProperties: { keyronRole: role, keyronVersion: '5' }
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
      appProperties: { keyronRole: 'vault', keyronVersion: '5' }
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
        appProperties: { keyronRole: 'backup', keyronVersion: '5', keyronConflict: options.conflict ? 'true' : 'false' }
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

    // Sempre releia o remoto imediatamente antes do PATCH. Isso permite detectar
    // outro dispositivo mesmo quando o navegador não expõe ETag via CORS.
    const beforeWrite = await readRemoteForWrite(structure.vault.id);
    const previousRemote = beforeWrite.bundle;
    const freshEtag = beforeWrite.etag || cachedVaultEtag || null;

    if (sameOperation(bundle, previousRemote)) {
      cachedRemoteBundle = previousRemote;
      cachedVaultEtag = freshEtag;
      return structure.vault;
    }
    if (!bundleDescendsFrom(bundle, previousRemote)) {
      throw driveConflict('DRIVE_CONFLICT_LINEAGE');
    }

    const updated = await updateJsonFile(structure.vault.id, bundle, freshEtag);
    structure.vault = { ...structure.vault, ...updated.file };

    let confirmedBundle = bundle;
    let confirmedEtag = updated.etag || freshEtag || null;
    // Sem ETag legível, confirme por leitura que o Drive recebeu exatamente a
    // operação enviada. Falhar aqui mantém o WAL local e evita falso “sincronizado”.
    if (!updated.etag) {
      const confirmation = await readRemoteForWrite(structure.vault.id);
      confirmedBundle = confirmation.bundle;
      confirmedEtag = confirmation.etag || confirmedEtag;
      if (!sameOperation(confirmedBundle, bundle)) throw driveConflict('DRIVE_CONFLICT_CONFIRMATION');
    }

    cachedRemoteBundle = confirmedBundle;
    cachedVaultEtag = confirmedEtag;

    if (automaticSnapshot && previousRemote && !sameOperation(previousRemote, bundle)) {
      shouldCreateAutomaticSnapshot()
        .then((needed) => needed && createSnapshot(previousRemote))
        .catch(() => null);
    }
    return updated.file;
  }



  async function ensureDocumentStructure() {
    const structure = await ensureStructure();
    if (!structure.documents) {
      structure.documents = await findOrCreateFolder({ name: DOCUMENT_FOLDER_NAME, parentId: structure.root.id, role: 'documents' });
    }
    if (!structure.documentObjects) {
      structure.documentObjects = await findOrCreateFolder({ name: DOCUMENT_OBJECTS_FOLDER_NAME, parentId: structure.documents.id, role: 'document-objects' });
    }
    return { root: structure.documents, objects: structure.documentObjects };
  }

  async function initiateDocumentUpload(encryptedBlob, metadata) {
    const response = await apiFetch(`${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent('id,name,createdTime,modifiedTime,version,size,md5Checksum,parents,appProperties')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(encryptedBlob.size)
      },
      body: JSON.stringify(metadata)
    }, { idempotent: false, timeoutMs: 30000 });
    const location = response.headers.get('location');
    if (!location || !/^https:\/\/www\.googleapis\.com\//.test(location)) throw new Error('DRIVE_RESUMABLE_LOCATION_UNAVAILABLE');
    return location;
  }

  async function rawUploadFetch(url, { body = null, start = null, end = null, total, signal } = {}) {
    if (!isConnected()) throw new Error('DRIVE_NOT_CONNECTED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const headers = new Headers({
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      });
      headers.set('Content-Range', body ? `bytes ${start}-${end}/${total}` : `bytes */${total}`);
      return await fetch(url, { method: 'PUT', headers, body, signal: controller.signal, referrerPolicy: 'no-referrer', cache: 'no-store' });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  function uploadedOffset(response) {
    const range = response.headers.get('range') || '';
    const match = range.match(/bytes=0-(\d+)/i);
    return match ? Number(match[1]) + 1 : 0;
  }

  async function queryDocumentUploadOffset(sessionUrl, total, signal) {
    const response = await rawUploadFetch(sessionUrl, { total, signal });
    if (response.status === 308) return { complete: false, offset: uploadedOffset(response) };
    if (response.ok) return { complete: true, file: await response.json() };
    if (response.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
    }
    throw new Error(`DRIVE_UPLOAD_STATUS_${response.status}`);
  }

  async function uploadDocumentObject(encryptedBlob, { documentId, operationId, signal, onProgress } = {}) {
    if (!(encryptedBlob instanceof Blob) || encryptedBlob.size <= 0 || encryptedBlob.size > MAX_DOCUMENT_BYTES) throw new Error('DRIVE_DOCUMENT_TOO_LARGE');
    const structure = await ensureDocumentStructure();
    const opaqueName = `${KeyronCrypto.randomId()}.kdoc`;
    const metadata = {
      name: opaqueName,
      mimeType: 'application/octet-stream',
      parents: [structure.objects.id],
      appProperties: {
        keyronRole: 'document-object',
        keyronVersion: '1',
        keyronDocument: String(documentId || '').slice(0, 180),
        keyronOperation: String(operationId || '').slice(0, 180)
      }
    };
    const sessionUrl = await initiateDocumentUpload(encryptedBlob, metadata);
    let offset = 0;
    let attempts = 0;
    while (offset < encryptedBlob.size) {
      if (signal?.aborted) throw new Error('DOCUMENT_OPERATION_ABORTED');
      const endExclusive = Math.min(encryptedBlob.size, offset + RESUMABLE_CHUNK_BYTES);
      const chunk = encryptedBlob.slice(offset, endExclusive, 'application/octet-stream');
      try {
        const response = await rawUploadFetch(sessionUrl, {
          body: chunk,
          start: offset,
          end: endExclusive - 1,
          total: encryptedBlob.size,
          signal
        });
        if (response.status === 308) {
          offset = Math.max(endExclusive, uploadedOffset(response));
          attempts = 0;
          onProgress?.({ stage: 'uploading', loaded: offset, total: encryptedBlob.size, percent: Math.round((offset / encryptedBlob.size) * 100) });
          continue;
        }
        if (response.ok) {
          const file = await response.json();
          onProgress?.({ stage: 'uploading', loaded: encryptedBlob.size, total: encryptedBlob.size, percent: 100 });
          return file;
        }
        if (response.status === 401) {
          accessToken = null;
          tokenExpiresAt = 0;
        }
        if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw new Error(`DRIVE_DOCUMENT_UPLOAD_${response.status}`);
        throw new Error(`DRIVE_DOCUMENT_UPLOAD_TRANSIENT_${response.status}`);
      } catch (error) {
        if (signal?.aborted || error?.message === 'DOCUMENT_OPERATION_ABORTED') throw error;
        attempts += 1;
        if (attempts > 4) throw error;
        await sleep([450, 1100, 2600, 5200][attempts - 1] || 6000);
        const status = await queryDocumentUploadOffset(sessionUrl, encryptedBlob.size, signal).catch(() => null);
        if (status?.complete) return status.file;
        if (status && Number.isFinite(status.offset)) offset = status.offset;
      }
    }
    const finalStatus = await queryDocumentUploadOffset(sessionUrl, encryptedBlob.size, signal);
    if (finalStatus.complete) return finalStatus.file;
    throw new Error('DRIVE_DOCUMENT_UPLOAD_INCOMPLETE');
  }

  async function downloadDocumentObject(fileId, { signal, onProgress } = {}) {
    const response = await apiFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { cache: 'no-store', signal }, { timeoutMs: 30000 });
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_DOCUMENT_BYTES) throw new Error('DRIVE_DOCUMENT_TOO_LARGE');
    if (!response.body?.getReader) {
      const blob = await response.blob();
      if (blob.size > MAX_DOCUMENT_BYTES) throw new Error('DRIVE_DOCUMENT_TOO_LARGE');
      return blob.slice(0, blob.size, 'application/octet-stream');
    }
    const reader = response.body.getReader();
    const parts = [];
    let loaded = 0;
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => null);
        throw new Error('DOCUMENT_OPERATION_ABORTED');
      }
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > MAX_DOCUMENT_BYTES) {
        await reader.cancel().catch(() => null);
        throw new Error('DRIVE_DOCUMENT_TOO_LARGE');
      }
      parts.push(value);
      onProgress?.({ stage: 'downloading', loaded, total: declared || loaded, percent: declared ? Math.round((loaded / declared) * 100) : 0 });
    }
    return new Blob(parts, { type: 'application/octet-stream' });
  }

  async function getDocumentObjectMetadata(fileId) {
    const response = await apiFetch(`${API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,createdTime,modifiedTime,version,size,md5Checksum,parents,appProperties,trashed')}`, { cache: 'no-store' });
    return response.json();
  }

  async function deleteDocumentObject(fileId) {
    try {
      await apiFetch(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, { attempts: 3, timeoutMs: 30000 });
      return true;
    } catch (error) {
      // Exclusão idempotente: um objeto já ausente também satisfaz o objetivo.
      if (error?.status === 404) return true;
      throw error;
    }
  }

  async function reloadBundle() {
    cachedRemoteBundle = null;
    cachedVaultEtag = null;
    return loadBundle({ force: true });
  }

  return Object.freeze({
    ROOT_NAME,
    BACKUP_FOLDER_NAME,
    DOCUMENT_FOLDER_NAME,
    DOCUMENT_OBJECTS_FOLDER_NAME,
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
    ensureStructure,
    ensureDocumentStructure,
    uploadDocumentObject,
    downloadDocumentObject,
    getDocumentObjectMetadata,
    deleteDocumentObject
  });
})();
