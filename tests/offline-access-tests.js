'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

function createFakeIndexedDB() {
  const databases = new Map();

  class NameList {
    constructor(db) { this.db = db; }
    contains(name) { return this.db.stores.has(name); }
  }

  class FakeDb {
    constructor(name, version) {
      this.name = name;
      this.version = version;
      this.stores = new Map();
      this.objectStoreNames = new NameList(this);
      this.onversionchange = null;
    }
    createObjectStore(name) {
      if (!this.stores.has(name)) this.stores.set(name, new Map());
      return {};
    }
    transaction(name) {
      if (!this.stores.has(name)) throw new Error('STORE_NOT_FOUND');
      const storeMap = this.stores.get(name);
      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: () => ({
          get: (key) => {
            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
            setImmediate(() => {
              request.result = storeMap.get(key);
              request.onsuccess?.({ target: request });
              setImmediate(() => tx.oncomplete?.());
            });
            return request;
          },
          put: (value) => {
            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
            setImmediate(() => {
              storeMap.set(value.id, value);
              request.result = value.id;
              request.onsuccess?.({ target: request });
              setImmediate(() => tx.oncomplete?.());
            });
            return request;
          },
          delete: (key) => {
            const request = { result: undefined, error: null, onsuccess: null, onerror: null };
            setImmediate(() => {
              storeMap.delete(key);
              request.onsuccess?.({ target: request });
              setImmediate(() => tx.oncomplete?.());
            });
            return request;
          }
        })
      };
      return tx;
    }
    close() {}
  }

  return {
    _databases: databases,
    open(name, version) {
      const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      setImmediate(() => {
        let db = databases.get(name);
        const created = !db;
        if (!db) {
          db = new FakeDb(name, version);
          databases.set(name, db);
        }
        request.result = db;
        if (created) request.onupgradeneeded?.({ target: request });
        setImmediate(() => request.onsuccess?.({ target: request }));
      });
      return request;
    }
  };
}

const indexedDB = createFakeIndexedDB();
const context = {
  console,
  crypto: webcrypto,
  indexedDB,
  TextEncoder,
  TextDecoder,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  navigator: { storage: { persist: async () => true } },
  setTimeout,
  clearTimeout,
  setImmediate
};
context.globalThis = context;
vm.createContext(context);
const file = path.resolve(__dirname, '..', 'js', 'offline-access.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
const KeyronOfflineAccess = context.KeyronOfflineAccess;

let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function test(name, fn) { await fn(); passed += 1; console.log(`✓ ${name}`); }

const owner = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const device = 'device-primary-001';
const makeBundle = (vaultId, operationId = 'op-1', revision = 1, ancestors = []) => ({
  vaultId,
  ownerBinding: owner,
  operationId,
  revision,
  ancestors
});

function rawRecord(vaultId) {
  const db = indexedDB._databases.get('keyron-offline-access-v1');
  return db?.stores.get('authorizations')?.get(`offline:${vaultId}`);
}

(async () => {
  await test('Ambiente compatível habilita autorização local', async () => {
    assert(KeyronOfflineAccess.supported(), 'offline access deveria estar disponível');
  });

  await test('Inscrição cria autorização válida vinculada ao cofre e dispositivo', async () => {
    const bundle = makeBundle('vault-enroll');
    const info = await KeyronOfflineAccess.enroll({
      ...bundle,
      deviceId: device,
      deviceLabel: 'Meu computador',
      trustDays: 30
    });
    assert(info.authorized && info.vaultId === bundle.vaultId, 'autorização não criada');
    const verified = await KeyronOfflineAccess.verify(bundle, device);
    assert(verified.deviceLabel === 'Meu computador', 'rótulo divergente');
  });

  await test('Chave HMAC do dispositivo é não exportável', async () => {
    const bundle = makeBundle('vault-key');
    await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    const record = rawRecord(bundle.vaultId);
    assert(record.key.extractable === false, 'chave ficou exportável');
    let rejected = false;
    try { await webcrypto.subtle.exportKey('raw', record.key); } catch { rejected = true; }
    assert(rejected, 'exportação da chave local foi aceita');
  });

  await test('Adulteração de metadados invalida o selo HMAC', async () => {
    const bundle = makeBundle('vault-tamper');
    await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    rawRecord(bundle.vaultId).deviceLabel = 'Atacante';
    const status = await KeyronOfflineAccess.status(bundle, device);
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_TAMPERED', `adulteração não bloqueada: ${status.reason}`);
  });

  await test('Cópia sem a CryptoKey não autoriza outro cofre', async () => {
    const source = makeBundle('vault-source-copy');
    await KeyronOfflineAccess.enroll({ ...source, deviceId: device, deviceLabel: 'PC' });
    const copied = { ...rawRecord(source.vaultId), id: 'offline:vault-copy', vaultId: 'vault-copy', key: null };
    const db = indexedDB._databases.get('keyron-offline-access-v1');
    db.stores.get('authorizations').set(copied.id, copied);
    const status = await KeyronOfflineAccess.status(makeBundle('vault-copy'), device);
    assert(!status.authorized, 'cópia sem chave foi aceita');
  });

  await test('Conta proprietária diferente é bloqueada', async () => {
    const bundle = makeBundle('vault-owner');
    await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    const status = await KeyronOfflineAccess.status({ ...bundle, ownerBinding: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=' }, device);
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_OWNER_MISMATCH', `conta diferente não bloqueada: ${status.reason}`);
  });

  await test('Identificador de dispositivo diferente é bloqueado', async () => {
    const bundle = makeBundle('vault-device');
    await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    const status = await KeyronOfflineAccess.status(bundle, 'device-clonado');
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_DEVICE_MISMATCH', `dispositivo diferente não bloqueado: ${status.reason}`);
  });

  await test('Bundle descendente é aceito e avança a âncora local', async () => {
    const initial = makeBundle('vault-lineage');
    await KeyronOfflineAccess.enroll({ ...initial, deviceId: device, deviceLabel: 'PC' });
    const next = makeBundle('vault-lineage', 'op-2', 2, ['op-1']);
    const advanced = await KeyronOfflineAccess.advance(next, device);
    assert(advanced.operationId === 'op-2' && advanced.revision === 2, 'âncora não avançou');
    const verified = await KeyronOfflineAccess.verify(next, device);
    assert(verified.authorized, 'descendente válido não abriu');
  });

  await test('Atualizações concorrentes preservam a âncora mais recente', async () => {
    const initial = makeBundle('vault-concurrent');
    await KeyronOfflineAccess.enroll({ ...initial, deviceId: device, deviceLabel: 'PC' });
    const second = makeBundle('vault-concurrent', 'op-2', 2, ['op-1']);
    const third = makeBundle('vault-concurrent', 'op-3', 3, ['op-1', 'op-2']);
    await Promise.all([
      KeyronOfflineAccess.advance(second, device),
      KeyronOfflineAccess.advance(third, device)
    ]);
    const verified = await KeyronOfflineAccess.verify(third, device);
    assert(verified.operationId === 'op-3' && verified.revision === 3, 'corrida rebaixou a âncora local');
  });

  await test('Rollback para operação antiga é bloqueado', async () => {
    const initial = makeBundle('vault-rollback');
    await KeyronOfflineAccess.enroll({ ...initial, deviceId: device, deviceLabel: 'PC' });
    const next = makeBundle('vault-rollback', 'op-2', 2, ['op-1']);
    await KeyronOfflineAccess.advance(next, device);
    const status = await KeyronOfflineAccess.status(initial, device);
    assert(!status.authorized, 'rollback foi aceito');
  });

  await test('Linhagem paralela sem ancestral confiável é bloqueada', async () => {
    const initial = makeBundle('vault-divergent');
    await KeyronOfflineAccess.enroll({ ...initial, deviceId: device, deviceLabel: 'PC' });
    const divergent = makeBundle('vault-divergent', 'op-x', 5, ['other-op']);
    const status = await KeyronOfflineAccess.status(divergent, device);
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_LINEAGE_MISMATCH', `divergência não bloqueada: ${status.reason}`);
  });

  await test('Autorização expirada falha fechada', async () => {
    const bundle = makeBundle('vault-expired');
    const info = await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC', trustDays: 1 });
    const future = Date.parse(info.expiresAt) + 1000;
    const status = await KeyronOfflineAccess.status(bundle, device, { now: future });
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_EXPIRED', `expiração não bloqueada: ${status.reason}`);
  });

  await test('Retrocesso relevante do relógio é bloqueado', async () => {
    const bundle = makeBundle('vault-clock');
    const info = await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    const future = Date.parse(info.createdAt) + 2 * 60 * 60 * 1000;
    await KeyronOfflineAccess.verify(bundle, device, { now: future, touch: true });
    const status = await KeyronOfflineAccess.status(bundle, device, { now: Date.parse(info.createdAt) });
    assert(!status.authorized && status.reason === 'OFFLINE_ACCESS_CLOCK_ROLLBACK', `relógio regressivo não bloqueado: ${status.reason}`);
  });

  await test('Revogação remove a autorização do aparelho', async () => {
    const bundle = makeBundle('vault-revoke');
    await KeyronOfflineAccess.enroll({ ...bundle, deviceId: device, deviceLabel: 'PC' });
    await KeyronOfflineAccess.revoke(bundle.vaultId);
    const status = await KeyronOfflineAccess.status(bundle, device);
    assert(!status.authorized, 'autorização revogada ainda funciona');
  });

  console.log(`\n${passed}/14 testes de acesso offline aprovados.`);
})().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
