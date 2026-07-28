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
const KeyronBreachCheck = load(`${base}/breach-check.js`, 'KeyronBreachCheck');

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

(async () => {
  await test('Novo cofre usa schema v3 e preferência semanal', () => {
    const vault = KeyronVault.emptyVault();
    assert(vault.version === 3, 'schema não é v3');
    assert(vault.preferences.breachCheckWeekly === true, 'preferência semanal ausente');
  });

  await test('Nova credencial entra no topo da gaveta', () => {
    const vault = KeyronVault.emptyVault();
    const columnId = vault.columns[0].id;
    const a = KeyronVault.addEntry(vault, { name: 'A', password: 'a', columnId });
    const b = KeyronVault.addEntry(vault, { name: 'B', password: 'b', columnId });
    const order = vault.entries.filter((e) => e.columnId === columnId).sort((x,y) => x.order-y.order);
    assert(order[0].id === b.id && order[1].id === a.id, 'inclusão no topo falhou');
  });

  await test('Reordena para cima e para baixo na mesma gaveta', () => {
    const vault = KeyronVault.emptyVault();
    const columnId = vault.columns[0].id;
    const a = KeyronVault.addEntry(vault, { name: 'A', columnId });
    const b = KeyronVault.addEntry(vault, { name: 'B', columnId });
    const c = KeyronVault.addEntry(vault, { name: 'C', columnId });
    KeyronVault.reorderEntry(vault, a.id, columnId, 0);
    let names = vault.entries.filter(e => e.columnId === columnId).sort((x,y)=>x.order-y.order).map(e=>e.name);
    assert(names.join(',') === 'A,C,B', `ordem inesperada: ${names}`);
    KeyronVault.reorderEntry(vault, a.id, columnId, 2);
    names = vault.entries.filter(e => e.columnId === columnId).sort((x,y)=>x.order-y.order).map(e=>e.name);
    assert(names.join(',') === 'C,B,A', `ordem para baixo inesperada: ${names}`);
  });

  await test('Move entre gavetas na posição escolhida', () => {
    const vault = KeyronVault.emptyVault();
    const source = vault.columns[0].id;
    const target = vault.columns[1].id;
    const first = KeyronVault.addEntry(vault, { name: 'Primeiro', columnId: target });
    const moving = KeyronVault.addEntry(vault, { name: 'Mover', columnId: source });
    KeyronVault.reorderEntry(vault, moving.id, target, 0);
    const ordered = vault.entries.filter(e => e.columnId === target).sort((a,b)=>a.order-b.order);
    assert(ordered[0].id === moving.id && ordered[1].id === first.id, 'posição entre gavetas falhou');
  });

  await test('Editar não altera a ordem manual', () => {
    const vault = KeyronVault.emptyVault();
    const columnId = vault.columns[0].id;
    const a = KeyronVault.addEntry(vault, { name: 'A', columnId });
    KeyronVault.addEntry(vault, { name: 'B', columnId });
    const before = a.order;
    KeyronVault.updateEntry(vault, a.id, { name: 'A editado', columnId });
    assert(vault.entries.find(e => e.id === a.id).order === before, 'edição mudou a ordem');
  });

  await test('Migra cofre v2 preservando a ordem visual antiga', () => {
    const baseVault = KeyronVault.emptyVault();
    const column = baseVault.columns[0];
    const old = {
      ...baseVault,
      version: 2,
      entries: [
        { id: 'old', name: 'Antiga', columnId: column.id, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'new', name: 'Nova', columnId: column.id, updatedAt: '2026-02-01T00:00:00.000Z' }
      ]
    };
    const migrated = KeyronVault.normalize(old);
    const ordered = migrated.entries.filter(e=>e.columnId===column.id).sort((a,b)=>a.order-b.order);
    assert(migrated.version === 3, 'não migrou para v3');
    assert(ordered.map(e=>e.id).join(',') === 'new,old', 'ordem visual antiga não foi preservada');
  });

  await test('Excluir reindexa e remove auditoria órfã', () => {
    const vault = KeyronVault.emptyVault();
    const columnId = vault.columns[0].id;
    const a = KeyronVault.addEntry(vault, { name: 'A', columnId });
    const b = KeyronVault.addEntry(vault, { name: 'B', columnId });
    KeyronVault.setSecurityAudit(vault, [{ entryId: a.id, count: 10 }, { entryId: b.id, count: 0 }]);
    KeyronVault.deleteEntry(vault, a.id);
    assert(!vault.securityAudit.results.some(r=>r.entryId===a.id), 'auditoria órfã permaneceu');
    assert(vault.entries.find(e=>e.id===b.id).order === 0, 'reindexação falhou');
  });

  await test('Criptografia segue AES-256-GCM e PBKDF2 600 mil', async () => {
    const secret = 'SEGREDO-NAO-PODE-APARECER';
    const vault = KeyronVault.emptyVault();
    KeyronVault.addEntry(vault, { name: 'Teste', password: secret, columnId: vault.columns[0].id });
    const { bundle } = await KeyronCrypto.createBundle('frase mestra extremamente longa 123!', vault);
    assert(bundle.cipher.name === 'AES-GCM' && bundle.cipher.length === 256, 'AES-GCM alterado');
    assert(bundle.kdf.name === 'PBKDF2' && bundle.kdf.hash === 'SHA-256' && bundle.kdf.iterations === 600000, 'PBKDF2 alterado');
    assert(!JSON.stringify(bundle).includes(secret), 'segredo apareceu no bundle cifrado');
    const unlocked = await KeyronCrypto.unlockBundle('frase mestra extremamente longa 123!', bundle);
    assert(unlocked.vault.entries[0].password === secret, 'não descriptografou corretamente');
    let rejected = false;
    try { await KeyronCrypto.unlockBundle('senha errada', bundle); } catch { rejected = true; }
    assert(rejected, 'senha errada foi aceita');
  });

  await test('SHA-1 local e parser k-anonymity', async () => {
    const hash = await KeyronBreachCheck.sha1('password');
    assert(hash === '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8', 'SHA-1 conhecido divergente');
    const parsed = KeyronBreachCheck.parseRange('1B7EE68FD8:3\n6CF8331B7EE68FD8ABCDEF123456789ABCD:42');
    assert(parsed.get('6CF8331B7EE68FD8ABCDEF123456789ABCD') === 42, 'parser de faixa falhou');
  });

  await test('Regra semanal respeita janela de sete dias', () => {
    const now = Date.parse('2026-07-28T12:00:00.000Z');
    assert(KeyronBreachCheck.isWeeklyDue(null, now), 'primeira verificação não ficou devida');
    assert(!KeyronBreachCheck.isWeeklyDue('2026-07-25T12:00:00.000Z', now), 'verificação recente ficou devida');
    assert(KeyronBreachCheck.isWeeklyDue('2026-07-20T11:59:59.000Z', now), 'verificação antiga não ficou devida');
  });

  await test('Cofre novo gera chave de recuperação própria e independente da senha', async () => {
    const vault = KeyronVault.emptyVault();
    const created = await KeyronCrypto.createBundle('senha mestra bem longa e exclusiva 1', vault);
    assert(created.bundle.formatVersion === 3, 'formatVersion não é 3');
    assert(Boolean(created.bundle.wrappedKey), 'sem wrappedKey (senha)');
    assert(Boolean(created.bundle.recovery?.wrappedKey), 'sem wrappedKey (recuperação)');
    assert(typeof created.recoveryCode === 'string' && created.recoveryCode.length > 20, 'chave de recuperação muito curta');

    const dekViaRecovery = await KeyronCrypto.unlockWithRecoveryCode(created.recoveryCode, created.bundle);
    const vaultViaRecovery = await KeyronCrypto.decryptPayload(dekViaRecovery, created.bundle);
    assert(vaultViaRecovery.id === vault.id, 'chave de recuperação não abriu o mesmo cofre');

    let rejected = false;
    try { await KeyronCrypto.unlockWithRecoveryCode('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ', created.bundle); } catch { rejected = true; }
    assert(rejected, 'chave de recuperação inválida foi aceita');
  });

  await test('Trocar a senha mestra preserva a mesma DEK e a chave de recuperação continua válida', async () => {
    const vault = KeyronVault.emptyVault();
    const created = await KeyronCrypto.createBundle('senha antiga bem longa e exclusiva 2', vault);
    const rawOldKey = Buffer.from(await webcrypto.subtle.exportKey('raw', created.key));

    const rewrapped = await KeyronCrypto.changePassword(created.key, 'senha nova bem longa e exclusiva 3', created.bundle);

    let oldPasswordRejected = false;
    try { await KeyronCrypto.unlockBundle('senha antiga bem longa e exclusiva 2', rewrapped); } catch { oldPasswordRejected = true; }
    assert(oldPasswordRejected, 'senha antiga ainda funcionou depois da troca');

    const unlockedNew = await KeyronCrypto.unlockBundle('senha nova bem longa e exclusiva 3', rewrapped);
    const rawNewKey = Buffer.from(await webcrypto.subtle.exportKey('raw', unlockedNew.key));
    assert(rawOldKey.equals(rawNewKey), 'a DEK mudou ao trocar a senha (deveria ser reaproveitada)');

    const dekViaRecovery = await KeyronCrypto.unlockWithRecoveryCode(created.recoveryCode, rewrapped);
    await KeyronCrypto.decryptPayload(dekViaRecovery, rewrapped);
  });

  await test('Gerar nova chave de recuperação invalida a anterior sem afetar a senha mestra', async () => {
    const vault = KeyronVault.emptyVault();
    const created = await KeyronCrypto.createBundle('senha estavel bem longa e exclusiva 4', vault);
    const regenerated = await KeyronCrypto.regenerateRecovery(created.key, created.bundle);

    let oldRecoveryRejected = false;
    try { await KeyronCrypto.unlockWithRecoveryCode(created.recoveryCode, regenerated.bundle); } catch { oldRecoveryRejected = true; }
    assert(oldRecoveryRejected, 'chave de recuperação antiga ainda funcionou depois de regenerar');

    const dekViaNewRecovery = await KeyronCrypto.unlockWithRecoveryCode(regenerated.recoveryCode, regenerated.bundle);
    await KeyronCrypto.decryptPayload(dekViaNewRecovery, regenerated.bundle);
    await KeyronCrypto.unlockBundle('senha estavel bem longa e exclusiva 4', regenerated.bundle);
  });

  await test('Cofre antigo sem DEK própria (v2) ainda destrava e migra gerando recuperação', async () => {
    const vault = KeyronVault.emptyVault();
    const legacyLike = await (async () => {
      // Monta um bundle no formato v2 (sem wrappedKey/recovery), como os cofres já publicados.
      const salt = webcrypto.getRandomValues(new Uint8Array(16));
      const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('senha legado bem longa e exclusiva 5'), 'PBKDF2', false, ['deriveKey']);
      const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const enc = async (obj, ctx) => {
        const iv = webcrypto.getRandomValues(new Uint8Array(12));
        const aad = new TextEncoder().encode(`KEYRON|${ctx}|2`);
        const plain = new TextEncoder().encode(JSON.stringify(obj));
        const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, plain);
        const b64 = (bytes) => Buffer.from(bytes).toString('base64');
        return { iv: b64(iv), data: b64(new Uint8Array(cipher)) };
      };
      return {
        format: 'keyron-vault',
        formatVersion: 2,
        vaultId: vault.id,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: Buffer.from(salt).toString('base64') },
        cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
        check: await enc({ marker: 'KEYRON_OK', vaultId: vault.id }, `check:${vault.id}`),
        payload: await enc(vault, `payload:${vault.id}`),
        revision: 1,
        updatedAt: new Date().toISOString()
      };
    })();

    const unlocked = await KeyronCrypto.unlockBundle('senha legado bem longa e exclusiva 5', legacyLike);
    assert(unlocked.vault.id === vault.id, 'cofre v2 não destravou corretamente');

    const migrated = await KeyronCrypto.rekeyBundle('senha legado bem longa e exclusiva 5', unlocked.vault, unlocked.vault.id);
    assert(migrated.bundle.vaultId === vault.id, 'migração não preservou o vaultId');
    assert(Boolean(migrated.bundle.wrappedKey), 'migração não gerou wrappedKey');
    assert(Boolean(migrated.recoveryCode), 'migração não gerou chave de recuperação');
  });

  await test('Reordena gaveta por arraste para qualquer posição', () => {
    const vault = KeyronVault.emptyVault();
    const names = () => vault.columns.map((c) => c.name);
    const original = names();
    const dragged = vault.columns[0];
    KeyronVault.reorderColumn(vault, dragged.id, 3);
    const after = names();
    assert(after[3] === original[0], `gaveta não caiu na posição solta: ${after}`);
    assert(vault.columns.every((c, index) => c.order === index), 'order não foi reindexado após o arraste');
  });

  console.log(`\n${passed}/15 testes de núcleo aprovados.`);
})().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
