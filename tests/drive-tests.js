'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const localMap = new Map();
const localStorage = {
  getItem: (key) => localMap.has(key) ? localMap.get(key) : null,
  setItem: (key, value) => localMap.set(key, String(value)),
  removeItem: (key) => localMap.delete(key)
};

function createCryptoContext() {
  const context = {
    console,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    structuredClone,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary')
  };
  context.globalThis = context;
  vm.createContext(context);
  const file = path.resolve(__dirname, '..', 'js', 'crypto.js');
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;globalThis.KeyronCrypto=KeyronCrypto;', context, { filename: file });
  return context.KeyronCrypto;
}

const KeyronCrypto = createCryptoContext();
const vault = { id: 'vault-drive-test', version: 3, entries: [], columns: [], categories: [], preferences: {} };
let baseBundle;
let nextBundle;
let newestBundle;
let tokenCallback;
let patchMode = 'conflict';
let expectedEtag = '"etag-v1"';
let exposeEtag = true;
let patchHeaders = [];
let listCalls = 0;

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

async function fetchMock(url, options = {}) {
  const target = String(url);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (headers.get('Authorization') !== 'Bearer token-1' && headers.get('Authorization') !== 'Bearer token-2') {
    throw new Error('AUTH_HEADER_MISSING');
  }
  if (target.includes('/about?fields=user')) {
    return jsonResponse({ user: { permissionId: 'google-user-1', displayName: 'Pedro', emailAddress: 'pedro@example.test' } });
  }
  if (target.includes('/files?') && method === 'GET') {
    listCalls += 1;
    const parsed = new URL(target);
    const q = parsed.searchParams.get('q') || '';
    if (q.includes("keyronRole' and value='root")) return jsonResponse({ files: [{ id: 'root-id', name: 'Keyron', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("keyronRole' and value='backups")) return jsonResponse({ files: [{ id: 'backups-id', name: 'Backups', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("keyronRole' and value='vault")) return jsonResponse({ files: [{ id: 'vault-file-id', name: 'vault.keyron', mimeType: 'application/octet-stream' }] });
    return jsonResponse({ files: [] });
  }
  if (target.includes('/files/vault-file-id?alt=media') && method === 'GET') {
    const body = JSON.stringify(baseBundle);
    return new Response(body, { status: 200, headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(Buffer.byteLength(body)),
      ...(exposeEtag && expectedEtag ? { ETag: expectedEtag } : {})
    } });
  }
  if (target.includes('/upload/drive/v3/files/vault-file-id') && method === 'PATCH') {
    const ifMatch = headers.get('If-Match');
    patchHeaders.push(ifMatch);
    if (ifMatch && ifMatch !== expectedEtag) return new Response('wrong etag', { status: 412 });
    if (patchMode === 'conflict') return new Response('precondition failed', { status: 412 });
    const body = JSON.parse(options.body);
    KeyronCrypto.assertValidBundle(body);
    expectedEtag = patchMode === 'success-1' ? '"etag-v2"' : patchMode === 'success-2' ? '"etag-v3"' : '"etag-v4"';
    baseBundle = body;
    return jsonResponse(
      { id: 'vault-file-id', name: 'vault.keyron', modifiedTime: new Date().toISOString(), version: '4' },
      { headers: exposeEtag ? { ETag: expectedEtag } : {} }
    );
  }
  throw new Error(`UNEXPECTED_FETCH ${method} ${target}`);
}

const context = {
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  structuredClone,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  Headers,
  Response,
  URL,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: fetchMock,
  localStorage,
  KeyronCrypto,
  KeyronConfig: { MAX_BUNDLE_BYTES: 96 * 1024 * 1024, MAX_DRIVE_BACKUPS: 10, AUTO_SNAPSHOT_HOURS: 12 },
  window: {}
};
context.window.google = {
  accounts: {
    oauth2: {
      initTokenClient: (options) => {
        tokenCallback = options.callback;
        return { requestAccessToken: () => options.callback({ access_token: 'token-1', expires_in: 3600 }) };
      },
      revoke: (_token, done) => done?.()
    }
  }
};
context.google = context.window.google;
context.globalThis = context;
vm.createContext(context);
const driveFile = path.resolve(__dirname, '..', 'js', 'drive.js');
vm.runInContext(fs.readFileSync(driveFile, 'utf8') + '\n;globalThis.KeyronDrive=KeyronDrive;', context, { filename: driveFile });
const KeyronDrive = context.KeyronDrive;

let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function test(name, fn) { await fn(); passed += 1; console.log(`✓ ${name}`); }

(async () => {
  const created = await KeyronCrypto.createBundle('frase mestra longa para drive 2026!', vault, {
    ownerAccountId: 'google-user-1', deviceId: 'device-drive', saveReason: 'create'
  });
  baseBundle = created.bundle;
  nextBundle = await KeyronCrypto.updateBundle(created.key, baseBundle, vault, { deviceId: 'device-drive', saveReason: 'next' });
  newestBundle = await KeyronCrypto.updateBundle(created.key, nextBundle, vault, { deviceId: 'device-drive', saveReason: 'newest' });

  await test('OAuth retorna conta verificável antes de liberar o Drive', async () => {
    const profile = await new Promise((resolve, reject) => {
      KeyronDrive.init('client-id.apps.googleusercontent.com', resolve, reject);
      KeyronDrive.connect(false);
    });
    assert(profile.id === 'google-user-1', 'permissionId não retornou');
    assert(KeyronDrive.isConnected(), 'Drive não ficou conectado');
  });

  await test('Download do cofre valida bundle e captura ETag', async () => {
    const loaded = await KeyronDrive.loadBundle();
    assert(loaded.bundle.operationId === baseBundle.operationId, 'bundle remoto divergente');
    assert(loaded.etag === '"etag-v1"', `ETag inesperado: ${loaded.etag}`);
  });

  await test('PATCH envia If-Match e transforma 412 em DRIVE_CONFLICT', async () => {
    let error;
    try { await KeyronDrive.saveBundle(nextBundle, { automaticSnapshot: false }); } catch (caught) { error = caught; }
    assert(error?.code === 'DRIVE_CONFLICT', `erro inesperado: ${error?.code}`);
    assert(patchHeaders.at(-1) === '"etag-v1"', 'If-Match inicial ausente');
  });

  await test('Após sucesso, o próximo PATCH usa o novo ETag', async () => {
    patchMode = 'success-1';
    await KeyronDrive.saveBundle(nextBundle, { automaticSnapshot: false });
    assert(patchHeaders.at(-1) === '"etag-v1"', 'retry seguro não usou ETag original');
    patchMode = 'success-2';
    await KeyronDrive.saveBundle(newestBundle, { automaticSnapshot: false });
    assert(patchHeaders.at(-1) === '"etag-v2"', `novo ETag não foi usado: ${patchHeaders.at(-1)}`);
  });

  await test('Novo token limpa estrutura e cache da conta anterior', async () => {
    const before = listCalls;
    tokenCallback({ access_token: 'token-2', expires_in: 3600 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await KeyronDrive.loadBundle();
    assert(listCalls > before, 'estrutura antiga foi reutilizada após novo token');
  });
  await test('Envio ao Drive bloqueia bundle acima do limite antes da rede', async () => {
    const originalLimit = context.KeyronConfig.MAX_BUNDLE_BYTES;
    context.KeyronConfig.MAX_BUNDLE_BYTES = 128;
    let error;
    try { await KeyronDrive.saveBundle(newestBundle, { automaticSnapshot: false }); } catch (caught) { error = caught; }
    context.KeyronConfig.MAX_BUNDLE_BYTES = originalLimit;
    assert(error?.message === 'DRIVE_VAULT_TOO_LARGE', `erro inesperado: ${error?.message}`);
  });


  await test('Drive sem ETag sincroniza com preflight de linhagem e leitura de confirmação', async () => {
    KeyronDrive.disconnect();
    exposeEtag = false;
    expectedEtag = '"etag-v3"';
    patchMode = 'success-no-etag';
    await new Promise((resolve, reject) => {
      KeyronDrive.init('client-id.apps.googleusercontent.com', resolve, reject);
      KeyronDrive.connect(false);
    });
    await KeyronDrive.loadBundle();
    const laterBundle = await KeyronCrypto.updateBundle(created.key, newestBundle, vault, { deviceId: 'device-drive', saveReason: 'later-no-etag' });
    await KeyronDrive.saveBundle(laterBundle, { automaticSnapshot: false });
    assert(baseBundle.operationId === laterBundle.operationId, 'Drive não confirmou a operação sem ETag');
    assert(patchHeaders.at(-1) === null, 'If-Match não deveria ser enviado sem ETag exposto');
  });

  await test('Preflight bloqueia linhagens divergentes mesmo sem ETag', async () => {
    const common = baseBundle;
    const localCandidate = await KeyronCrypto.updateBundle(created.key, common, vault, { deviceId: 'device-local', saveReason: 'local-branch' });
    const remoteDivergent = await KeyronCrypto.updateBundle(created.key, common, vault, { deviceId: 'device-remote', saveReason: 'remote-branch' });
    baseBundle = remoteDivergent;
    const beforePatches = patchHeaders.length;
    let error;
    try { await KeyronDrive.saveBundle(localCandidate, { automaticSnapshot: false }); } catch (caught) { error = caught; }
    assert(error?.code === 'DRIVE_CONFLICT', `conflito inesperado: ${error?.code}`);
    assert(patchHeaders.length === beforePatches, 'PATCH foi enviado apesar da divergência');
  });

  console.log(`\n${passed}/8 testes de Drive com mocks aprovados.`);
})().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
