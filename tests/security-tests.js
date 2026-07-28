'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const context = {
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  structuredClone,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  setTimeout,
  clearTimeout,
  AbortController,
  fetch: async () => { throw new Error('NETWORK_DISABLED_IN_UNIT_TEST'); }
};
context.globalThis = context;
vm.createContext(context);

function load(file, exportName) {
  const source = fs.readFileSync(file, 'utf8') + `\n;globalThis.${exportName}=${exportName};`;
  vm.runInContext(source, context, { filename: file });
  return context[exportName];
}

const base = path.resolve(__dirname, '..', 'js');
const KeyronCrypto = load(`${base}/crypto.js`, 'KeyronCrypto');
const KeyronVault = load(`${base}/vault.js`, 'KeyronVault');
const KeyronGenerator = load(`${base}/generator.js`, 'KeyronGenerator');

let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function expectError(fn, code) {
  try { await fn(); } catch (error) {
    if (code && error?.message !== code) throw new Error(`erro ${error?.message}, esperado ${code}`);
    return error;
  }
  throw new Error(`erro ${code || 'esperado'} não ocorreu`);
}
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const flipBase64 = (value) => `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;

(async () => {
  const password = 'frase mestra extremamente longa e exclusiva 2026!';
  const vault = KeyronVault.emptyVault();
  KeyronVault.addEntry(vault, {
    name: 'Conta principal',
    username: 'pedro',
    password: 'SEGREDO-ULTRA-SENSIVEL',
    columnId: vault.columns[0].id
  });
  const created = await KeyronCrypto.createBundle(password, vault, {
    ownerAccountId: 'permission-id-user-1',
    deviceId: 'device-a',
    saveReason: 'security-test'
  });

  await test('Bundle atual é v4 e possui selo de integridade', () => {
    assert(created.bundle.formatVersion === 4, 'formato não é v4');
    assert(created.bundle.integrity?.iv && created.bundle.integrity?.data, 'integridade ausente');
    assert(Array.isArray(created.bundle.ancestors) && created.bundle.ancestors.length === 0, 'linhagem inicial inválida');
    KeyronCrypto.assertValidBundle(created.bundle, { allowLegacy: false });
  });

  await test('Bundle cifrado não contém credencial em texto legível', () => {
    const serialized = JSON.stringify(created.bundle);
    assert(!serialized.includes('SEGREDO-ULTRA-SENSIVEL'), 'senha apareceu no bundle');
    assert(!serialized.includes('Conta principal'), 'nome da conta apareceu no bundle');
  });

  await test('Vínculo de conta é estável e separa contas diferentes', async () => {
    const a1 = await KeyronCrypto.hashAccountIdentifier('permission-id-user-1');
    const a2 = await KeyronCrypto.hashAccountIdentifier('permission-id-user-1');
    const b = await KeyronCrypto.hashAccountIdentifier('permission-id-user-2');
    assert(a1 === a2, 'hash da mesma conta variou');
    assert(a1 !== b, 'contas diferentes tiveram o mesmo vínculo');
    assert(created.bundle.ownerBinding === a1, 'bundle não foi vinculado à conta');
  });

  await test('Senha incorreta é recusada', async () => {
    await expectError(() => KeyronCrypto.unlockBundle('senha totalmente errada', created.bundle), 'INVALID_PASSWORD');
  });

  await test('Alteração da revisão é detectada pelo selo', async () => {
    const tampered = clone(created.bundle);
    tampered.revision += 1;
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Alteração do vínculo Google é detectada pelo selo', async () => {
    const tampered = clone(created.bundle);
    tampered.ownerBinding = await KeyronCrypto.hashAccountIdentifier('permission-id-attacker');
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Alteração do identificador da operação é detectada', async () => {
    const tampered = clone(created.bundle);
    tampered.operationId = 'forged-operation-id';
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Alteração da linhagem é detectada', async () => {
    const updated = await KeyronCrypto.updateBundle(created.key, created.bundle, vault, { deviceId: 'device-a', saveReason: 'lineage' });
    const tampered = clone(updated);
    tampered.ancestors[0] = 'forged-ancestor';
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Alteração do ciphertext do cofre é detectada', async () => {
    const tampered = clone(created.bundle);
    tampered.payload.data = flipBase64(tampered.payload.data);
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Alteração do próprio selo é detectada', async () => {
    const tampered = clone(created.bundle);
    tampered.integrity.data = flipBase64(tampered.integrity.data);
    await expectError(() => KeyronCrypto.decryptPayload(created.key, tampered), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('KDF abaixo do mínimo é rejeitado antes da derivação', async () => {
    const tampered = clone(created.bundle);
    tampered.kdf.iterations = 1;
    await expectError(() => Promise.resolve(KeyronCrypto.assertValidBundle(tampered)), 'INVALID_KDF_ITERATIONS');
  });

  await test('KDF acima do limite defensivo é rejeitado', async () => {
    const tampered = clone(created.bundle);
    tampered.kdf.iterations = 999999999;
    await expectError(() => Promise.resolve(KeyronCrypto.assertValidBundle(tampered)), 'INVALID_KDF_ITERATIONS');
  });

  await test('Base64 malformado é rejeitado', async () => {
    const tampered = clone(created.bundle);
    tampered.payload.iv = '@@@não-base64@@@';
    await expectError(() => Promise.resolve(KeyronCrypto.assertValidBundle(tampered)), 'INVALID_PAYLOAD_IV');
  });

  await test('Linhagem registra o ancestral e limita crescimento', async () => {
    let bundle = created.bundle;
    const firstOperation = bundle.operationId;
    for (let i = 0; i < 38; i += 1) {
      bundle = await KeyronCrypto.updateBundle(created.key, bundle, vault, { deviceId: 'device-a', saveReason: `update-${i}` });
    }
    assert(bundle.ancestors.length === 32, `linhagem tem ${bundle.ancestors.length}, esperado 32`);
    assert(bundle.ancestors[0] !== bundle.operationId, 'operação atual entrou nos ancestrais');
    assert(!bundle.ancestors.includes(firstOperation), 'ancestral além da janela não foi descartado');
    await KeyronCrypto.decryptPayload(created.key, bundle);
  });


  await test('Atualização não aceita revisão igual ou regressiva', async () => {
    await expectError(() => KeyronCrypto.updateBundle(created.key, created.bundle, vault, {
      revision: created.bundle.revision,
      deviceId: 'device-a',
      saveReason: 'revision-rollback'
    }), 'INVALID_REVISION');
  });

  await test('Código de recuperação usa alfabeto sem caracteres ambíguos', () => {
    const codes = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const code = KeyronCrypto.generateRecoveryCode();
      assert(/^(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-){5}[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(code), `formato inválido: ${code}`);
      assert(!/[01IO]/.test(code), `caractere ambíguo: ${code}`);
      codes.add(code);
    }
    assert(codes.size === 1000, 'houve colisão inesperada em 1000 códigos');
  });

  await test('Código de recuperação malformado é recusado sem derivação', async () => {
    await expectError(() => KeyronCrypto.unlockWithRecoveryCode('OOOOO-11111-XXXXX', created.bundle), 'INVALID_RECOVERY_CODE');
  });

  await test('Troca de senha invalida o embrulho antigo', async () => {
    const changed = await KeyronCrypto.changePassword(created.key, 'nova frase mestra muito longa e exclusiva 2026!', created.bundle, {
      ownerAccountId: 'permission-id-user-1', deviceId: 'device-a', saveReason: 'password-change'
    });
    await expectError(() => KeyronCrypto.unlockBundle(password, changed), 'INVALID_PASSWORD');
    await KeyronCrypto.unlockBundle('nova frase mestra muito longa e exclusiva 2026!', changed);
  });

  await test('Recolocar embrulho antigo de senha é bloqueado', async () => {
    const changed = await KeyronCrypto.changePassword(created.key, 'outra frase mestra longa e exclusiva 2026!', created.bundle, {
      ownerAccountId: 'permission-id-user-1', deviceId: 'device-a', saveReason: 'password-change-rollback-test'
    });
    const forged = clone(changed);
    forged.kdf = clone(created.bundle.kdf);
    forged.wrappedKey = clone(created.bundle.wrappedKey);
    await expectError(() => KeyronCrypto.unlockBundle(password, forged), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Recolocar embrulho antigo de recuperação é bloqueado', async () => {
    const regenerated = await KeyronCrypto.regenerateRecovery(created.key, created.bundle, {
      ownerAccountId: 'permission-id-user-1', deviceId: 'device-a', saveReason: 'recovery-rollback-test'
    });
    const forged = clone(regenerated.bundle);
    forged.recovery = clone(created.bundle.recovery);
    await expectError(() => KeyronCrypto.unlockWithRecoveryCode(created.recoveryCode, forged), 'INVALID_BUNDLE_INTEGRITY');
  });

  await test('Normalização remove campos desconhecidos e repara IDs duplicados', () => {
    const input = KeyronVault.emptyVault();
    input.injected = '<script>alert(1)</script>';
    input.columns[1].id = input.columns[0].id;
    input.entries = [
      { id: 'same', name: 'A', columnId: input.columns[0].id, evil: 'x' },
      { id: 'same', name: 'B', columnId: input.columns[0].id, evil: 'y' }
    ];
    const normalized = KeyronVault.normalize(input);
    assert(!Object.prototype.hasOwnProperty.call(normalized, 'injected'), 'campo raiz desconhecido permaneceu');
    assert(new Set(normalized.columns.map((item) => item.id)).size === normalized.columns.length, 'IDs de gaveta duplicados permaneceram');
    assert(new Set(normalized.entries.map((item) => item.id)).size === normalized.entries.length, 'IDs de entrada duplicados permaneceram');
    assert(!Object.prototype.hasOwnProperty.call(normalized.entries[0], 'evil'), 'campo desconhecido da entrada permaneceu');
  });

  await test('Preferências fora de faixa são limitadas', () => {
    const input = KeyronVault.emptyVault();
    input.preferences = { autoLockMinutes: 9999, clipboardClearSeconds: -50, boardColumns: '999', breachCheckWeekly: true };
    const normalized = KeyronVault.normalize(input);
    assert(normalized.preferences.autoLockMinutes === 60, 'auto-lock não foi limitado');
    assert(normalized.preferences.clipboardClearSeconds === 5, 'clipboard inválido não foi limitado');
    assert(normalized.preferences.boardColumns === 'auto', 'colunas inválidas não voltaram ao padrão');
  });

  await test('Logos SVG e data URLs inválidos não entram no cofre', () => {
    const input = KeyronVault.emptyVault();
    input.entries = [{
      id: 'logo-test', name: 'Logo', columnId: input.columns[0].id,
      logo: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', type: 'image/svg+xml', bytes: 16 }
    }];
    const normalized = KeyronVault.normalize(input);
    assert(normalized.entries[0].logo === null, 'SVG foi aceito');
  });

  await test('Campos sensíveis têm limites defensivos', () => {
    const input = KeyronVault.emptyVault();
    input.entries = [{
      id: 'long', name: 'N'.repeat(1000), password: 'P'.repeat(2000), notes: 'X'.repeat(10000), columnId: input.columns[0].id
    }];
    const entry = KeyronVault.normalize(input).entries[0];
    assert(entry.name.length === 100, 'nome sem limite');
    assert(entry.password.length === 500, 'senha sem limite');
    assert(entry.notes.length === 4000, 'notas sem limite');
  });

  await test('Gerador usa tamanho e classes esperadas', () => {
    for (let i = 0; i < 100; i += 1) {
      const generated = KeyronGenerator.generate(24);
      assert(generated.length === 24, 'tamanho incorreto');
      assert(/[a-z]/.test(generated) && /[A-Z]/.test(generated) && /[2-9]/.test(generated) && /[^A-Za-z0-9]/.test(generated), 'classe ausente');
    }
  });

  console.log(`\n${passed}/25 testes de segurança dinâmica aprovados.`);
})().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
