const KeyronVault = (() => {
  const DEFAULT_COLUMNS = [
    ['Bancos', '🏦'], ['Streaming', '▶️'], ['Jogos', '🎮'], ['Redes sociais', '🌐'], ['Trabalho', '💼'], ['Outros', '✦']
  ];
  const DEFAULT_CATEGORIES = [
    ['Banco', '#2f8cff'], ['Streaming', '#a678ff'], ['Jogo', '#42c7b8'], ['Rede social', '#ff6f91'], ['E-mail', '#f4b95e'], ['Trabalho', '#7aa7ff'], ['Outro', '#8f9caf']
  ];

  const now = () => new Date().toISOString();
  const id = () => KeyronCrypto.randomId();
  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
  const ACTIVITY_TYPES = new Set(['entry', 'column', 'category', 'security']);
  const ACTIVITY_MAX = 200;
  const UNCATEGORIZED = '__uncategorized__';

  function emptyVault() {
    const columns = DEFAULT_COLUMNS.map(([name, icon], order) => ({ id: id(), name, icon, order, createdAt: now() }));
    const categories = DEFAULT_CATEGORIES.map(([name, color], order) => ({ id: id(), name, color, order }));
    const createdAt = now();
    return {
      id: id(),
      version: 3,
      createdAt,
      updatedAt: createdAt,
      columns,
      categories,
      entries: [],
      activity: [],
      securityAudit: { lastBreachCheckAt: null, results: [] },
      preferences: {
        autoLockMinutes: 5,
        clipboardClearSeconds: 20,
        boardColumns: 'auto',
        breachCheckWeekly: true
      }
    };
  }

  function normalizeActivity(item) {
    return {
      id: item?.id || id(),
      type: ACTIVITY_TYPES.has(item?.type) ? item.type : 'entry',
      label: clean(item?.label, 140) || 'Sem nome',
      at: item?.at || now()
    };
  }

  function addActivity(vault, type, label) {
    const record = normalizeActivity({ type, label });
    vault.activity = [record, ...(Array.isArray(vault.activity) ? vault.activity : [])].slice(0, ACTIVITY_MAX);
    return record;
  }

  function normalizeLogo(logo) {
    if (!logo || typeof logo !== 'object' || typeof logo.dataUrl !== 'string') return null;
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(logo.dataUrl)) return null;
    return {
      dataUrl: logo.dataUrl,
      type: clean(logo.type, 40),
      name: clean(logo.name, 120),
      bytes: Number(logo.bytes) || 0
    };
  }

  function normalizeEntry(entry, defaultColumnId, fallbackOrder = 0) {
    return {
      id: entry?.id || id(),
      name: clean(entry?.name, 100) || 'Sem nome',
      username: clean(entry?.username, 160),
      email: clean(entry?.email, 200),
      password: String(entry?.password ?? '').slice(0, 500),
      url: clean(entry?.url, 500),
      secret: clean(entry?.secret ?? entry?.totp, 500),
      notes: clean(entry?.notes, 4000),
      columnId: entry?.columnId || defaultColumnId,
      categoryId: entry?.categoryId || null,
      order: Number.isFinite(Number(entry?.order)) ? Math.max(0, Number(entry.order)) : fallbackOrder,
      logo: normalizeLogo(entry?.logo),
      favorite: Boolean(entry?.favorite),
      createdAt: entry?.createdAt || now(),
      updatedAt: entry?.updatedAt || now()
    };
  }

  function normalizeOrders(vault, columnId = null) {
    const columnIds = columnId ? [columnId] : vault.columns.map((column) => column.id);
    for (const idValue of columnIds) {
      vault.entries
        .filter((entry) => entry.columnId === idValue)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
        .forEach((entry, index) => { entry.order = index; });
    }
  }

  function normalizeSecurityAudit(value) {
    const results = Array.isArray(value?.results) ? value.results.slice(0, 1000).map((item) => ({
      entryId: clean(item?.entryId, 100),
      count: Math.max(0, Number(item?.count) || 0),
      checkedAt: item?.checkedAt || value?.lastBreachCheckAt || now()
    })).filter((item) => item.entryId) : [];
    return {
      lastBreachCheckAt: value?.lastBreachCheckAt || null,
      results
    };
  }

  function normalize(vault) {
    if (!vault || typeof vault !== 'object') return emptyVault();
    if (Number(vault.version) >= 2 && Array.isArray(vault.columns) && Array.isArray(vault.categories)) {
      const fallback = emptyVault();
      const sourceColumns = vault.columns.length ? vault.columns : fallback.columns;
      const columns = sourceColumns.map((column, index) => ({
        id: column?.id || id(),
        name: clean(column?.name, 50) || `Gaveta ${index + 1}`,
        icon: clean(column?.icon, 8) || '◈',
        order: index,
        createdAt: column?.createdAt || now()
      }));
      const columnIds = new Set(columns.map((column) => column.id));
      const defaultColumnId = columns[columns.length - 1].id;
      const sourceEntries = Array.isArray(vault.entries) ? vault.entries : [];
      const entries = [];

      for (const column of columns) {
        const oldVisualOrder = sourceEntries
          .filter((entry) => (columnIds.has(entry?.columnId) ? entry.columnId : defaultColumnId) === column.id)
          .sort((a, b) => {
            const aHas = Number.isFinite(Number(a?.order));
            const bHas = Number.isFinite(Number(b?.order));
            if (aHas && bHas) return Number(a.order) - Number(b.order);
            if (aHas !== bHas) return aHas ? -1 : 1;
            return Date.parse(b?.updatedAt || 0) - Date.parse(a?.updatedAt || 0);
          });
        oldVisualOrder.forEach((entry, index) => entries.push(normalizeEntry(entry, column.id, index)));
      }

      const normalized = {
        ...fallback,
        ...vault,
        id: vault.id || id(),
        version: 3,
        columns,
        categories: vault.categories.map((category, index) => ({
          id: category?.id || id(),
          name: clean(category?.name, 40) || `Categoria ${index + 1}`,
          color: /^#[0-9a-f]{6}$/i.test(category?.color || '') ? category.color : '#2f8cff',
          order: index
        })),
        entries,
        activity: Array.isArray(vault.activity) ? vault.activity.slice(0, ACTIVITY_MAX).map(normalizeActivity) : [],
        securityAudit: normalizeSecurityAudit(vault.securityAudit),
        preferences: { ...fallback.preferences, ...(vault.preferences || {}) }
      };
      normalizeOrders(normalized);
      return normalized;
    }

    const migrated = emptyVault();
    const otherColumn = migrated.columns.find((column) => column.name === 'Outros') || migrated.columns[0];
    const otherCategory = migrated.categories.find((category) => category.name === 'Outro') || null;
    migrated.entries = Array.isArray(vault.entries)
      ? vault.entries.map((entry, index) => normalizeEntry({ ...entry, columnId: otherColumn.id, categoryId: otherCategory?.id || null, order: index }, otherColumn.id, index))
      : [];
    migrated.createdAt = vault.createdAt || migrated.createdAt;
    migrated.updatedAt = now();
    return migrated;
  }

  function touch(vault) {
    vault.updatedAt = now();
    return vault;
  }

  function addEntry(vault, data) {
    const columnId = vault.columns.some((column) => column.id === data.columnId) ? data.columnId : vault.columns[0]?.id;
    vault.entries.filter((entry) => entry.columnId === columnId).forEach((entry) => { entry.order = Number(entry.order || 0) + 1; });
    const entry = normalizeEntry({ ...data, id: id(), columnId, order: 0, createdAt: now(), updatedAt: now() }, columnId, 0);
    vault.entries.push(entry);
    normalizeOrders(vault, columnId);
    addActivity(vault, 'entry', entry.name);
    touch(vault);
    return entry;
  }

  function updateEntry(vault, entryId, data) {
    const index = vault.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) throw new Error('ENTRY_NOT_FOUND');
    const previous = vault.entries[index];
    const requestedColumnId = vault.columns.some((column) => column.id === data.columnId) ? data.columnId : previous.columnId;
    const changedColumn = requestedColumnId !== previous.columnId;
    if (changedColumn) {
      vault.entries.filter((entry) => entry.columnId === requestedColumnId).forEach((entry) => { entry.order = Number(entry.order || 0) + 1; });
    }
    vault.entries[index] = normalizeEntry({
      ...previous,
      ...data,
      id: previous.id,
      columnId: requestedColumnId,
      order: changedColumn ? 0 : previous.order,
      createdAt: previous.createdAt,
      updatedAt: now()
    }, requestedColumnId, changedColumn ? 0 : previous.order);
    normalizeOrders(vault, previous.columnId);
    if (changedColumn) normalizeOrders(vault, requestedColumnId);
    touch(vault);
    return vault.entries[index];
  }

  function deleteEntry(vault, entryId) {
    const entry = vault.entries.find((item) => item.id === entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    vault.entries = vault.entries.filter((item) => item.id !== entryId);
    normalizeOrders(vault, entry.columnId);
    if (vault.securityAudit?.results) vault.securityAudit.results = vault.securityAudit.results.filter((result) => result.entryId !== entryId);
    touch(vault);
  }

  function reorderEntry(vault, entryId, targetColumnId, targetIndex) {
    if (!vault.columns.some((column) => column.id === targetColumnId)) throw new Error('COLUMN_NOT_FOUND');
    const entry = vault.entries.find((item) => item.id === entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    const sourceColumnId = entry.columnId;
    const targetEntries = vault.entries
      .filter((item) => item.columnId === targetColumnId && item.id !== entryId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const safeIndex = Math.max(0, Math.min(Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : targetEntries.length, targetEntries.length));
    entry.columnId = targetColumnId;
    targetEntries.splice(safeIndex, 0, entry);
    targetEntries.forEach((item, order) => { item.order = order; });
    if (sourceColumnId !== targetColumnId) normalizeOrders(vault, sourceColumnId);
    entry.updatedAt = now();
    touch(vault);
    return entry;
  }

  function moveEntry(vault, entryId, columnId) {
    const targetCount = vault.entries.filter((entry) => entry.columnId === columnId && entry.id !== entryId).length;
    return reorderEntry(vault, entryId, columnId, targetCount);
  }

  function addColumn(vault, name, icon) {
    const normalizedName = clean(name, 50);
    if (!normalizedName) throw new Error('COLUMN_NAME_REQUIRED');
    if (vault.columns.some((column) => column.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('COLUMN_DUPLICATE');
    const column = { id: id(), name: normalizedName, icon: clean(icon, 8) || '◈', order: vault.columns.length, createdAt: now() };
    vault.columns.push(column);
    addActivity(vault, 'column', column.name);
    touch(vault);
    return column;
  }

  function updateColumn(vault, columnId, name, icon) {
    const column = vault.columns.find((item) => item.id === columnId);
    if (!column) throw new Error('COLUMN_NOT_FOUND');
    const normalizedName = clean(name, 50);
    if (!normalizedName) throw new Error('COLUMN_NAME_REQUIRED');
    if (vault.columns.some((item) => item.id !== columnId && item.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('COLUMN_DUPLICATE');
    column.name = normalizedName;
    column.icon = clean(icon, 8) || column.icon;
    touch(vault);
  }

  function deleteColumn(vault, columnId) {
    if (vault.columns.length <= 1) throw new Error('LAST_COLUMN');
    if (vault.entries.some((entry) => entry.columnId === columnId)) throw new Error('COLUMN_NOT_EMPTY');
    vault.columns = vault.columns.filter((column) => column.id !== columnId).map((column, index) => ({ ...column, order: index }));
    touch(vault);
  }

  function moveColumn(vault, columnId, direction) {
    const index = vault.columns.findIndex((column) => column.id === columnId);
    if (index < 0) return;
    const next = Math.max(0, Math.min(vault.columns.length - 1, index + direction));
    if (next === index) return;
    const [column] = vault.columns.splice(index, 1);
    vault.columns.splice(next, 0, column);
    vault.columns.forEach((item, order) => { item.order = order; });
    touch(vault);
  }

  function addCategory(vault, name, color) {
    const normalizedName = clean(name, 40);
    if (!normalizedName) throw new Error('CATEGORY_NAME_REQUIRED');
    if (vault.categories.some((category) => category.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'))) throw new Error('CATEGORY_DUPLICATE');
    const category = { id: id(), name: normalizedName, color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2f8cff', order: vault.categories.length };
    vault.categories.push(category);
    addActivity(vault, 'category', category.name);
    touch(vault);
    return category;
  }

  function deleteCategory(vault, categoryId) {
    vault.categories = vault.categories.filter((category) => category.id !== categoryId).map((category, index) => ({ ...category, order: index }));
    vault.entries.forEach((entry) => { if (entry.categoryId === categoryId) entry.categoryId = null; });
    touch(vault);
  }

  function setSecurityAudit(vault, results, checkedAt = now()) {
    vault.securityAudit = {
      lastBreachCheckAt: checkedAt,
      results: Array.isArray(results) ? results.map((result) => ({
        entryId: clean(result.entryId, 100),
        count: Math.max(0, Number(result.count) || 0),
        checkedAt
      })).filter((result) => result.entryId) : []
    };
    addActivity(vault, 'security', 'Verificação de senhas vazadas');
    touch(vault);
    return vault.securityAudit;
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

  return Object.freeze({
    emptyVault, normalize, normalizeOrders, addEntry, updateEntry, deleteEntry,
    moveEntry, reorderEntry, addColumn, updateColumn, deleteColumn, moveColumn,
    addCategory, deleteCategory, addActivity, setSecurityAudit, matches, UNCATEGORIZED
  });
})();
