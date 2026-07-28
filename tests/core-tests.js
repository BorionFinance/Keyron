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

  console.log(`\n${passed}/10 testes de núcleo aprovados.`);
})().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
