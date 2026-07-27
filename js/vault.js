// vault.js — Estrutura de dados do cofre e operações sobre as entradas.
// Este módulo só conhece dados em texto puro EM MEMÓRIA — nunca decide
// sozinho gravar nada em disco ou na rede. Isso é papel do app.js.

const BorionVault = (() => {
  function emptyVault() {
    return { version: 1, entries: [] };
  }

  function newEntry(data) {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      name: (data.name || '').trim() || 'Sem nome',
      username: (data.username || '').trim(),
      email: (data.email || '').trim(),
      password: data.password || '',
      url: (data.url || '').trim(),
      notes: (data.notes || '').trim(),
      totp: (data.totp || '').trim(),
      createdAt: now,
      updatedAt: now
    };
  }

  function addEntry(vault, data) {
    vault.entries.push(newEntry(data));
    return vault;
  }

  function updateEntry(vault, id, data) {
    const idx = vault.entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Entrada não encontrada no cofre');
    const prev = vault.entries[idx];
    vault.entries[idx] = {
      ...prev,
      name: (data.name || '').trim() || prev.name,
      username: (data.username || '').trim(),
      email: (data.email || '').trim(),
      password: data.password !== undefined ? data.password : prev.password,
      url: (data.url || '').trim(),
      notes: (data.notes || '').trim(),
      totp: (data.totp || '').trim(),
      updatedAt: new Date().toISOString()
    };
    return vault;
  }

  function deleteEntry(vault, id) {
    const before = vault.entries.length;
    vault.entries = vault.entries.filter((e) => e.id !== id);
    if (vault.entries.length === before) throw new Error('Entrada não encontrada no cofre');
    return vault;
  }

  function searchEntries(vault, query) {
    if (!query || !query.trim()) {
      return [...vault.entries].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const q = query.trim().toLowerCase();
    return vault.entries
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  return { emptyVault, newEntry, addEntry, updateEntry, deleteEntry, searchEntries };
})();

if (typeof module !== 'undefined') module.exports = BorionVault;
