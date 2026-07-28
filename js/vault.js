const KeyronVault = (() => {
  const DEFAULT_COLUMNS = [
    ['Bancos', '⬡'], ['Streaming', '◈'], ['Jogos', '◇'], ['Redes sociais', '◎'], ['Trabalho', '▣'], ['Outros', '✦']
  ];
  const DEFAULT_CATEGORIES = [
    ['Banco', '#2f8cff'], ['Streaming', '#a678ff'], ['Jogo', '#42c7b8'], ['Rede social', '#ff6f91'], ['E-mail', '#f4b95e'], ['Trabalho', '#7aa7ff'], ['Outro', '#8f9caf']
  ];

  const now = () => new Date().toISOString();
  const id = () => KeyronCrypto.randomId();
  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

  function emptyVault() {
    const columns = DEFAULT_COLUMNS.map(([name, icon], order) => ({ id: id(), name, icon, order, createdAt: now() }));
    const categories = DEFAULT_CATEGORIES.map(([name, color], order) => ({ id: id(), name, color, order }));
    const createdAt = now();
    return {
      id: id(),
      version: 2,
      createdAt,
      updatedAt: createdAt,
      columns,
      categories,
      entries: [],
      activity: [],
      preferences: { autoLockMinutes: 5, clipboardClearSeconds: 20, boardColumns: 'auto' }
    };
  }

  const ACTIVITY_TYPES = new Set(['entry', 'column', 'category']);
  const ACTIVITY_MAX = 200;
  const UNCATEGORIZED = '__uncategorized__';

  function normalizeActivity(item) {
    return {
      id: item.id || id(),
      type: ACTIVITY_TYPES.has(item.type) ? item.type : 'entry',
      label: clean(item.label, 140) || 'Sem nome',
      at: item.at || now()
    };
  }

  function addActivity(vault, type, label) {
    const record = normalizeActivity({ type, label });
    vault.activity = [record, ...(Array.isArray(vault.activity) ? vault.activity : [])].slice(0, ACTIVITY_MAX);
    return record;
  }

  function normalize(vault) {
    if (!vault || typeof vault !== 'object') return emptyVault();
    if (Number(vault.version) >= 2 && Array.isArray(vault.columns) && Array.isArray(vault.categories)) {
      const fallback = emptyVault();
      const columns = vault.columns.length ? vault.columns : fallback.columns;
      const columnIds = new Set(columns.map((c) => c.id));
      const defaultColumnId = columns[columns.length - 1].id;
      return {
        ...fallback,
        ...vault,
        id: vault.id || id(),
        version: 2,
        columns: columns.map((c, index) => ({ id: c.id || id(), name: clean(c.name, 50) || `Gaveta ${index + 1}`, icon: clean(c.icon, 3) || '◈', order: index, createdAt: c.createdAt || now() })),
        categories: vault.categories.map((c, index) => ({ id: c.id || id(), name: clean(c.name, 40) || `Categoria ${index + 1}`, color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#2f8cff', order: index })),
        entries: Array.isArray(vault.entries) ? vault.entries.map((e) => normalizeEntry(e, columnIds.has(e.columnId) ? e.columnId : defaultColumnId)) : [],
        activity: Array.isArray(vault.activity) ? vault.activity.slice(0, ACTIVITY_MAX).map(normalizeActivity) : [],
        preferences: { ...fallback.preferences, ...(vault.preferences || {}) }
      };
    }

    // Migração do cofre v1: mantém todas as credenciais e coloca em "Outros".
    const migrated = emptyVault();
    const otherColumn = migrated.columns.find((c) => c.name === 'Outros') || migrated.columns[0];
    const otherCategory = migrated.categories.find((c) => c.name === 'Outro') || null;
    migrated.entries = Array.isArray(vault.entries)
      ? vault.entries.map((entry) => normalizeEntry({ ...entry, columnId: otherColumn.id, categoryId: otherCategory?.id || null }, otherColumn.id))
      : [];
    migrated.createdAt = vault.createdAt || migrated.createdAt;
    migrated.updatedAt = now();
    return migrated;
  }

  function normalizeEntry(entry, defaultColumnId) {
    return {
      id: entry.id || id(),
      name: clean(entry.name, 100) || 'Sem nome',
      username: clean(entry.username, 160),
      email: clean(entry.email, 200),
      password: String(entry.password ?? '').slice(0, 500),
      url: clean(entry.url, 500),
      secret: clean(entry.secret ?? entry.totp, 500),
      notes: clean(entry.notes, 4000),
      columnId: entry.columnId || defaultColumnId,
      categoryId: entry.categoryId || null,
      logo: normalizeLogo(entry.logo),
      favorite: Boolean(entry.favorite),
      createdAt: entry.createdAt || now(),
      updatedAt: entry.updatedAt || now()
    };
  }

  function normalizeLogo(logo) {
    if (!logo || typeof logo !== 'object' || typeof logo.dataUrl !== 'string') return null;
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(logo.dataUrl)) return null;
    return { dataUrl: logo.dataUrl, type: clean(logo.type, 40), name: clean(logo.name, 120), bytes: Number(logo.bytes) || 0 };
  }

  function touch(vault) {
    vault.updatedAt = now();
    return vault;
  }

  function addEntry(vault, data) {
    const columnId = vault.columns.some((c) => c.id === data.columnId) ? data.columnId : vault.columns[0]?.id;
    const entry = normalizeEntry({ ...data, id: id(), createdAt: now(), updatedAt: now() }, columnId);
    vault.entries.unshift(entry);
    addActivity(vault, 'entry', entry.name);
    touch(vault);
    return entry;
  }

  function updateEntry(vault, entryId, data) {
    const index = vault.entries.findIndex((e) => e.id === entryId);
    if (index < 0) throw new Error('ENTRY_NOT_FOUND');
    const previous = vault.entries[index];
    vault.entries[index] = normalizeEntry({ ...previous, ...data, id: previous.id, createdAt: previous.createdAt, updatedAt: now() }, previous.columnId);
    touch(vault);
    return vault.entries[index];
  }

  function deleteEntry(vault, entryId) {
    const before = vault.entries.length;
    vault.entries = vault.entries.filter((e) => e.id !== entryId);
    if (vault.entries.length === before) throw new Error('ENTRY_NOT_FOUND');
    touch(vault);
  }

  function moveEntry(vault, entryId, columnId) {
    if (!vault.columns.some((c) => c.id === columnId)) throw new Error('COLUMN_NOT_FOUND');
    const entry = vault.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    entry.columnId = columnId;
    entry.updatedAt = now();
    touch(vault);
  }

  function addColumn(vault, name, icon) {
    const normalizedName = clean(name, 50);
    if (!normalizedName) throw new Error('COLUMN_NAME_REQUIRED');
    if (vault.columns.some((c) => c.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('COLUMN_DUPLICATE');
    const column = { id: id(), name: normalizedName, icon: clean(icon, 3) || '◈', order: vault.columns.length, createdAt: now() };
    vault.columns.push(column);
    addActivity(vault, 'column', column.name);
    touch(vault);
    return column;
  }

  function updateColumn(vault, columnId, name, icon) {
    const column = vault.columns.find((c) => c.id === columnId);
    if (!column) throw new Error('COLUMN_NOT_FOUND');
    const normalizedName = clean(name, 50);
    if (!normalizedName) throw new Error('COLUMN_NAME_REQUIRED');
    if (vault.columns.some((c) => c.id !== columnId && c.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('COLUMN_DUPLICATE');
    column.name = normalizedName;
    column.icon = clean(icon, 3) || column.icon;
    touch(vault);
  }

  function deleteColumn(vault, columnId) {
    if (vault.columns.length <= 1) throw new Error('LAST_COLUMN');
    if (vault.entries.some((e) => e.columnId === columnId)) throw new Error('COLUMN_NOT_EMPTY');
    vault.columns = vault.columns.filter((c) => c.id !== columnId).map((c, index) => ({ ...c, order: index }));
    touch(vault);
  }

  function moveColumn(vault, columnId, direction) {
    const index = vault.columns.findIndex((c) => c.id === columnId);
    if (index < 0) return;
    const next = Math.max(0, Math.min(vault.columns.length - 1, index + direction));
    if (next === index) return;
    const [column] = vault.columns.splice(index, 1);
    vault.columns.splice(next, 0, column);
    vault.columns.forEach((c, order) => { c.order = order; });
    touch(vault);
  }

  function addCategory(vault, name, color) {
    const normalizedName = clean(name, 40);
    if (!normalizedName) throw new Error('CATEGORY_NAME_REQUIRED');
    if (vault.categories.some((c) => c.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('CATEGORY_DUPLICATE');
    const category = { id: id(), name: normalizedName, color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2f8cff', order: vault.categories.length };
    vault.categories.push(category);
    addActivity(vault, 'category', category.name);
    touch(vault);
    return category;
  }

  function deleteCategory(vault, categoryId) {
    vault.categories = vault.categories.filter((c) => c.id !== categoryId).map((c, index) => ({ ...c, order: index }));
    vault.entries.forEach((entry) => { if (entry.categoryId === categoryId) entry.categoryId = null; });
    touch(vault);
  }

  function matches(entry, query, categoryId, categoriesById) {
    if (categoryId === UNCATEGORIZED) {
      if (entry.categoryId) return false;
    } else if (categoryId && entry.categoryId !== categoryId) {
      return false;
    }
    const q = clean(query, 200).toLocaleLowerCase('pt-BR');
    if (!q) return true;
    const category = categoriesById.get(entry.categoryId)?.name || '';
    return [entry.name, entry.username, entry.email, entry.url, entry.notes, entry.secret, category].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(q));
  }

  return Object.freeze({ emptyVault, normalize, addEntry, updateEntry, deleteEntry, moveEntry, addColumn, updateColumn, deleteColumn, moveColumn, addCategory, deleteCategory, addActivity, matches, UNCATEGORIZED });
})();
