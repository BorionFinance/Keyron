/* Keyron Documents — interface e orquestração do cofre documental. */
const KeyronDocuments = (() => {
  'use strict';

  const RETENTION_DAYS = 30;
  const REAUTH_WINDOW_MS = 5 * 60 * 1000;
  const EXTERNAL_PDF_URL_LIFETIME_MS = 10 * 60 * 1000;
  const state = {
    deps: null,
    active: false,
    filter: 'all',
    sort: 'manual',
    draggingItemId: null,
    dropTarget: null,
    categorySelectId: null,
    pendingFiles: [],
    currentItemId: null,
    currentObjectUrl: null,
    currentPlainBlob: null,
    operation: null,
    lastReauthAt: 0,
    reauthResolve: null,
    printAcknowledged: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  const el = {};
  function bindElements() {
    Object.assign(el, {
      vaultHead: $('#vault-workspace-head'),
      filterStrip: $('#filter-strip'),
      emptyVault: $('#empty-vault'),
      board: $('#vault-board'),
      button: $('#documents-btn'),
      view: $('#documents-view'),
      back: $('#documents-back-btn'),
      add: $('#documents-add-btn'),
      choose: $('#documents-choose-btn'),
      input: $('#documents-input'),
      dropzone: $('#documents-dropzone'),
      filters: $('#documents-filters'),
      sort: $('#documents-sort'),
      viewToggle: $('#documents-view-toggle'),
      summary: $('#documents-summary'),
      list: $('#documents-list'),
      empty: $('#documents-empty'),
      progress: $('#documents-progress'),
      progressTitle: $('#documents-progress-title'),
      progressDetail: $('#documents-progress-detail'),
      progressBar: $('#documents-progress-bar'),
      cancel: $('#documents-cancel-btn'),
      importDialog: $('#document-import-dialog'),
      importForm: $('#document-import-form'),
      importSummary: $('#document-import-summary'),
      importFiles: $('#document-import-files'),
      importCategory: $('#document-import-category'),
      importSensitivity: $('#document-import-sensitivity'),
      importOffline: $('#document-import-offline'),
      importError: $('#document-import-error'),
      importSubmit: $('#document-import-submit'),
      viewerDialog: $('#document-viewer-dialog'),
      viewerTitle: $('#document-viewer-title'),
      viewerType: $('#document-viewer-type'),
      viewerStage: $('#document-viewer-stage'),
      viewerMeta: $('#document-viewer-meta'),
      viewerDownload: $('#document-viewer-download'),
      viewerPrint: $('#document-viewer-print'),
      viewerFavorite: $('#document-viewer-favorite'),
      detailsDialog: $('#document-details-dialog'),
      detailsForm: $('#document-details-form'),
      detailName: $('#document-detail-name'),
      detailCategory: $('#document-detail-category'),
      detailSensitivity: $('#document-detail-sensitivity'),
      detailTags: $('#document-detail-tags'),
      detailNote: $('#document-detail-note'),
      detailTrash: $('#document-detail-trash'),
      detailOffline: $('#document-detail-offline'),
      importCategoryTrigger: $('#document-import-category-trigger'),
      detailCategoryTrigger: $('#document-detail-category-trigger'),
      categoryDialog: $('#document-category-dialog'),
      categoryClose: $('#document-category-close'),
      categoryOptions: $('#document-category-options'),
      categoryForm: $('#document-category-form'),
      categoryName: $('#document-category-name'),
      categoryError: $('#document-category-error'),
      reauthDialog: $('#document-reauth-dialog'),
      reauthForm: $('#document-reauth-form'),
      reauthReason: $('#document-reauth-reason'),
      reauthPassword: $('#document-reauth-password'),
      reauthError: $('#document-reauth-error'),
      reauthBiometric: $('#document-reauth-biometric'),
      search: $('#search-input')
    });
  }

  function vault() {
    return state.deps?.getVault?.() || null;
  }

  function bundle() {
    return state.deps?.getBundle?.() || null;
  }

  function documents() {
    return vault()?.documents || null;
  }

  function itemById(id) {
    return documents()?.items?.find((item) => item.id === id) || null;
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value < 10 * 1024 ** 2 ? 1 : 0)} MB`;
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Data indisponível';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  function sensitivityLabel(value) {
    return ({ normal: 'Normal', sensitive: 'Sensível', 'very-sensitive': 'Muito sensível' })[value] || 'Sensível';
  }

  function typeLabel(item) {
    if (item.previewKind === 'pdf') return 'PDF';
    if (item.previewKind === 'image') return 'Imagem';
    return item.originalExtension ? item.originalExtension.toUpperCase() : 'Arquivo';
  }

  function iconFor(item) {
    if (item.previewKind === 'pdf') return 'PDF';
    if (item.previewKind === 'image') return '▧';
    if (item.originalExtension === 'docx') return 'DOC';
    if (item.originalExtension === 'xlsx') return 'XLS';
    if (item.originalExtension === 'pptx') return 'PPT';
    return '▤';
  }

  function setProgress(visible, title = '', detail = '', percent = 0) {
    if (!el.progress) return;
    el.progress.hidden = !visible;
    el.progressTitle.textContent = title;
    el.progressDetail.textContent = detail;
    el.progressBar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  }

  function progressFromCrypto(fileName, info) {
    const stage = info.stage === 'encrypting' ? 'Cifrando localmente' : 'Processando';
    setProgress(true, fileName, `${stage} · ${info.percent || 0}%`, info.percent || 0);
  }

  function progressFromDrive(fileName, info) {
    const stage = info.stage === 'downloading' ? 'Baixando cópia cifrada' : 'Enviando cópia cifrada';
    setProgress(true, fileName, `${stage} · ${info.percent || 0}%`, info.percent || 0);
  }

  function setActive(active) {
    state.active = Boolean(active);
    el.view.hidden = !state.active;
    el.vaultHead.hidden = state.active;
    el.filterStrip.hidden = state.active;
    el.board.hidden = state.active;
    if (state.active) {
      el.emptyVault.hidden = true;
      el.search.placeholder = 'Buscar documento, categoria, etiqueta ou observação…';
      state.sort = documents()?.preferences?.sort || 'manual';
      render();
      setTimeout(() => el.search.focus(), 80);
    } else {
      el.search.value = '';
      el.search.placeholder = 'Buscar credencial, usuário, site ou categoria…';
      state.deps?.renderVault?.();
    }
  }

  function open() {
    if (!vault()) return;
    setActive(true);
    reconcileDeletionTombstones().catch(() => null);
  }

  function close() {
    cleanupViewer();
    setActive(false);
  }

  function ensureDocumentsRoot() {
    const docs = documents();
    if (!docs) throw new Error('DOCUMENTS_STATE_REQUIRED');
    return KeyronDocumentsCrypto.ensureRootKey(docs);
  }

  function categoryName(categoryId) {
    return documents()?.categories?.find((category) => category.id === categoryId)?.name || 'Sem categoria';
  }

  function makeButton(label, action, className = 'btn btn--ghost btn--small') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    button.draggable = false;
    button.textContent = label;
    return button;
  }

  function renderFilters() {
    el.filters.replaceChildren();
    const docs = documents();
    if (!docs) return;
    const entries = [
      ['all', 'Todos'],
      ['favorites', 'Favoritos'],
      ['offline', 'Offline'],
      ['trash', 'Lixeira']
    ];
    for (const [id, label] of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip${state.filter === id ? ' is-active' : ''}`;
      button.dataset.filter = id;
      button.textContent = label;
      el.filters.appendChild(button);
    }
    for (const category of docs.categories) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip${state.filter === `category:${category.id}` ? ' is-active' : ''}`;
      button.dataset.filter = `category:${category.id}`;
      const marker = document.createElement('i');
      marker.setAttribute('aria-hidden', 'true');
      button.append(marker, document.createTextNode(category.name));
      el.filters.appendChild(button);
    }
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'filter-chip filter-chip--manage';
    manage.dataset.manageDocumentCategories = 'true';
    manage.textContent = '+ Categoria';
    el.filters.appendChild(manage);
  }

  function manualReorderEnabled() {
    return state.filter === 'all' && state.sort === 'manual' && !String(el.search?.value || '').trim();
  }

  function filteredItems() {
    const docs = documents();
    if (!docs) return [];
    const query = String(el.search.value || '').trim().toLocaleLowerCase('pt-BR');
    let items = docs.items.filter((item) => {
      const trashed = Boolean(item.deletedAt);
      if (state.filter === 'trash') {
        if (!trashed) return false;
      } else if (trashed) return false;
      if (state.filter === 'favorites' && !item.favorite) return false;
      if (state.filter === 'offline' && !item.offlineAvailable) return false;
      if (state.filter.startsWith('category:') && item.categoryId !== state.filter.slice(9)) return false;
      if (!query) return true;
      const values = [item.name, item.originalExtension, categoryName(item.categoryId), item.note, ...(item.tags || [])];
      return values.some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
    });
    if (state.sort === 'manual') items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || Date.parse(a.importedAt || a.createdAt) - Date.parse(b.importedAt || b.createdAt));
    else if (state.sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    else if (state.sort === 'size') items.sort((a, b) => b.originalBytes - a.originalBytes);
    else if (state.sort === 'opened') items.sort((a, b) => Date.parse(b.lastOpenedAt || 0) - Date.parse(a.lastOpenedAt || 0));
    else items.sort((a, b) => Date.parse(b.importedAt || b.createdAt) - Date.parse(a.importedAt || a.createdAt));
    return items;
  }

  function renderCard(item) {
    const card = document.createElement('article');
    card.className = 'document-card';
    card.dataset.documentId = item.id;
    card.setAttribute('role', 'listitem');
    const reorderable = manualReorderEnabled() && !item.deletedAt;
    card.draggable = reorderable;
    card.classList.toggle('is-sortable', reorderable);
    if (reorderable) card.title = 'Arraste para escolher a posição deste documento';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'document-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.textContent = '⋮⋮';

    const preview = document.createElement('div');
    preview.className = `document-card-preview document-card-preview--${item.previewKind}`;
    preview.textContent = iconFor(item);

    const copy = document.createElement('div');
    copy.className = 'document-card-copy';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const meta = document.createElement('span');
    meta.textContent = `${typeLabel(item)} · ${formatBytes(item.originalBytes)} · ${categoryName(item.categoryId)}`;
    const badges = document.createElement('div');
    badges.className = 'document-card-badges';
    if (item.favorite) {
      const badge = document.createElement('small');
      badge.textContent = '★ Favorito';
      badges.appendChild(badge);
    }
    if (item.offlineAvailable) {
      const badge = document.createElement('small');
      badge.textContent = 'Offline cifrado';
      badges.appendChild(badge);
    }
    if (item.sensitivity !== 'normal') {
      const badge = document.createElement('small');
      badge.textContent = sensitivityLabel(item.sensitivity);
      badges.appendChild(badge);
    }
    copy.append(name, meta, badges);

    const actions = document.createElement('div');
    actions.className = 'document-card-actions';
    if (item.deletedAt) {
      actions.append(makeButton('Restaurar', 'restore'), makeButton('Excluir', 'destroy', 'btn btn--danger btn--small'));
    } else {
      actions.append(makeButton('Abrir', 'open'), makeButton('Salvar', 'download'), makeButton('•••', 'details'));
    }
    card.append(dragHandle, preview, copy, actions);
    return card;
  }

  function render() {
    if (!state.active || !documents()) return;
    el.vaultHead.hidden = true;
    el.filterStrip.hidden = true;
    el.board.hidden = true;
    el.emptyVault.hidden = true;
    renderFilters();
    const items = filteredItems();
    el.list.replaceChildren(...items.map(renderCard));
    const docs = documents();
    const activeCount = docs.items.filter((item) => !item.deletedAt).length;
    const totalBytes = docs.items.filter((item) => !item.deletedAt).reduce((sum, item) => sum + item.originalBytes, 0);
    el.summary.textContent = `${activeCount} ${activeCount === 1 ? 'documento' : 'documentos'} · ${formatBytes(totalBytes)}`;
    el.empty.hidden = items.length > 0;
    el.list.hidden = items.length === 0;
    const listView = docs.preferences?.view === 'list';
    el.list.classList.toggle('documents-list--rows', listView);
    el.list.classList.toggle('is-reorderable', manualReorderEnabled());
    el.sort.value = state.sort;
    el.viewToggle.textContent = listView ? '▦ Grade' : '☷ Lista';
  }

  function categoryTriggerFor(select) {
    if (select === el.importCategory) return el.importCategoryTrigger;
    if (select === el.detailCategory) return el.detailCategoryTrigger;
    return null;
  }

  function updateCategoryTrigger(select) {
    const trigger = categoryTriggerFor(select);
    if (!trigger) return;
    const label = trigger.querySelector('span');
    if (label) label.textContent = select.selectedOptions?.[0]?.textContent || 'Sem categoria';
  }

  function fillCategorySelect(select, selected = '') {
    const nextValue = String(selected || '');
    select.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Sem categoria';
    select.appendChild(none);
    for (const category of documents()?.categories || []) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    }
    select.value = [...select.options].some((option) => option.value === nextValue) ? nextValue : '';
    updateCategoryTrigger(select);
  }

  function refreshCategoryControls() {
    const importValue = el.importCategory?.value || '';
    const detailValue = el.detailCategory?.value || '';
    fillCategorySelect(el.importCategory, importValue);
    fillCategorySelect(el.detailCategory, detailValue);
  }

  function activeCategoryChoice() {
    if (state.categorySelectId) return document.getElementById(state.categorySelectId)?.value || '';
    return state.filter.startsWith('category:') ? state.filter.slice(9) : '';
  }

  function renderCategoryOptions() {
    el.categoryOptions.replaceChildren();
    const selected = activeCategoryChoice();
    const addRow = (id, name, removable = false) => {
      const row = document.createElement('div');
      row.className = `document-category-option${selected === id ? ' is-selected' : ''}`;
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'document-category-choice';
      choose.dataset.categoryChoice = id;
      choose.setAttribute('role', 'option');
      choose.setAttribute('aria-selected', String(selected === id));
      const marker = document.createElement('i');
      marker.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = name;
      const check = document.createElement('b');
      check.setAttribute('aria-hidden', 'true');
      check.textContent = selected === id ? '✓' : '';
      choose.append(marker, label, check);
      row.appendChild(choose);
      if (removable) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'document-category-remove';
        remove.dataset.categoryDelete = id;
        remove.title = `Excluir a categoria ${name}`;
        remove.setAttribute('aria-label', `Excluir a categoria ${name}`);
        remove.textContent = '×';
        row.appendChild(remove);
      }
      el.categoryOptions.appendChild(row);
    };
    addRow('', 'Sem categoria');
    for (const category of documents()?.categories || []) addRow(category.id, category.name, true);
  }

  function openCategoryPicker(selectId = null) {
    state.categorySelectId = selectId;
    el.categoryName.value = '';
    el.categoryError.textContent = '';
    renderCategoryOptions();
    if (!el.categoryDialog.open) el.categoryDialog.showModal();
  }

  function chooseCategory(categoryId) {
    if (state.categorySelectId) {
      const select = document.getElementById(state.categorySelectId);
      if (select) {
        select.value = categoryId || '';
        updateCategoryTrigger(select);
      }
    } else {
      state.filter = categoryId ? `category:${categoryId}` : 'all';
      render();
    }
    if (el.categoryDialog.open) el.categoryDialog.close();
  }

  async function createDocumentCategory(event) {
    event.preventDefault();
    const docs = documents();
    const name = String(el.categoryName.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    el.categoryError.textContent = '';
    if (!name) { el.categoryError.textContent = 'Digite um nome para a categoria.'; return; }
    if (docs.categories.length >= 200) { el.categoryError.textContent = 'O limite de categorias foi atingido.'; return; }
    if (docs.categories.some((category) => category.name.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0)) {
      el.categoryError.textContent = 'Essa categoria já existe.';
      return;
    }
    const category = { id: KeyronCrypto.randomId(), name, icon: '◈', order: docs.categories.length };
    const previousUpdatedAt = docs.updatedAt;
    const previousActivity = Array.isArray(vault().activity) ? vault().activity.slice() : [];
    docs.categories.push(category);
    docs.updatedAt = new Date().toISOString();
    KeyronVault.addActivity(vault(), 'document', `Categoria criada: ${name}`);
    try {
      await state.deps.persistVault({ render: false, reason: 'document-category-create' });
    } catch (error) {
      docs.categories = docs.categories.filter((entry) => entry.id !== category.id);
      docs.updatedAt = previousUpdatedAt;
      vault().activity = previousActivity;
      refreshCategoryControls();
      throw error;
    }
    refreshCategoryControls();
    chooseCategory(category.id);
    state.deps.toast?.(`Categoria “${name}” adicionada.`, 'success');
    render();
  }

  async function deleteDocumentCategory(categoryId) {
    const docs = documents();
    const category = docs?.categories?.find((entry) => entry.id === categoryId);
    if (!category) return;
    const assigned = docs.items.filter((item) => item.categoryId === categoryId).length;
    const pickerTarget = state.categorySelectId;
    if (el.categoryDialog.open) el.categoryDialog.close();
    const accepted = await state.deps.askConfirm({
      kicker: 'ORGANIZAÇÃO',
      title: `Excluir “${category.name}”?`,
      message: assigned
        ? `${assigned} ${assigned === 1 ? 'documento ficará' : 'documentos ficarão'} sem categoria. Os arquivos e a criptografia não serão alterados.`
        : 'A categoria será removida. Nenhum documento ou arquivo cifrado será apagado.',
      confirmLabel: 'Excluir categoria'
    });
    if (!accepted) { openCategoryPicker(pickerTarget); return; }
    const previousCategories = docs.categories.map((entry) => ({ ...entry }));
    const previousAssignments = new Map(docs.items.map((item) => [item.id, item.categoryId]));
    const previousFilter = state.filter;
    const previousImportCategory = el.importCategory.value;
    const previousDetailCategory = el.detailCategory.value;
    const previousUpdatedAt = docs.updatedAt;
    const previousActivity = Array.isArray(vault().activity) ? vault().activity.slice() : [];
    docs.categories = docs.categories.filter((entry) => entry.id !== categoryId);
    docs.categories.forEach((entry, index) => { entry.order = index; });
    for (const item of docs.items) if (item.categoryId === categoryId) item.categoryId = null;
    if (state.filter === `category:${categoryId}`) state.filter = 'all';
    if (el.importCategory.value === categoryId) el.importCategory.value = '';
    if (el.detailCategory.value === categoryId) el.detailCategory.value = '';
    docs.updatedAt = new Date().toISOString();
    KeyronVault.addActivity(vault(), 'document', `Categoria excluída: ${category.name}`);
    try {
      await state.deps.persistVault({ render: false, reason: 'document-category-delete' });
    } catch {
      docs.categories = previousCategories;
      for (const item of docs.items) item.categoryId = previousAssignments.get(item.id) || null;
      state.filter = previousFilter;
      docs.updatedAt = previousUpdatedAt;
      vault().activity = previousActivity;
      fillCategorySelect(el.importCategory, previousImportCategory);
      fillCategorySelect(el.detailCategory, previousDetailCategory);
      render();
      state.deps.toast?.('Não foi possível excluir a categoria. Nenhuma organização foi alterada.', 'error');
      openCategoryPicker(pickerTarget);
      return;
    }
    refreshCategoryControls();
    render();
    state.deps.toast?.(`Categoria “${category.name}” excluída.`, 'success');
    openCategoryPicker(pickerTarget);
  }

  async function prepareImport(fileList) {
    const files = Array.from(fileList || []).filter((file) => file instanceof File).slice(0, 50);
    if (!files.length) return;
    if (!state.deps?.isDriveConnected?.()) {
      state.deps?.toast?.('Verifique o Google Drive antes de adicionar documentos. O conteúdo nunca será enviado aberto.', 'error', 5200);
      return;
    }
    const accepted = [];
    const rejected = [];
    for (const file of files) {
      try {
        const inspection = await KeyronDocumentsCrypto.inspectFile(file);
        accepted.push({ file, inspection });
      } catch (error) {
        rejected.push({ file, code: error.message });
      }
    }
    if (!accepted.length) {
      state.deps?.toast?.('Nenhum arquivo pôde ser aceito com segurança.', 'error');
      return;
    }
    state.pendingFiles = accepted;
    el.importFiles.replaceChildren();
    for (const entry of accepted) {
      const row = document.createElement('div');
      row.className = 'document-import-file';
      const name = document.createElement('strong');
      name.textContent = entry.inspection.name;
      const meta = document.createElement('span');
      meta.textContent = `${typeLabel({ previewKind: entry.inspection.previewKind, originalExtension: entry.inspection.extension })} · ${formatBytes(entry.file.size)}`;
      row.append(name, meta);
      el.importFiles.appendChild(row);
    }
    el.importSummary.textContent = `${accepted.length} ${accepted.length === 1 ? 'arquivo pronto' : 'arquivos prontos'}${rejected.length ? ` · ${rejected.length} recusado(s)` : ''}.`;
    fillCategorySelect(el.importCategory);
    el.importSensitivity.value = 'sensitive';
    el.importOffline.checked = false;
    el.importError.textContent = '';
    el.importDialog.showModal();
  }

  function newDocumentItem(result, remoteFile, entry, options) {
    const now = new Date().toISOString();
    return {
      id: options.documentId,
      objectId: remoteFile.id,
      objectVersion: String(remoteFile.version || ''),
      operationId: options.operationId,
      formatVersion: result.formatVersion,
      wrappedKey: result.wrappedKey,
      name: entry.inspection.name,
      detectedMime: entry.inspection.detectedMime,
      originalExtension: entry.inspection.extension,
      originalBytes: entry.file.size,
      cipherBytes: result.cipherBytes,
      categoryId: options.categoryId || null,
      order: (documents()?.items || []).reduce((max, item) => Math.max(max, Number(item.order) || 0), -1) + 1,
      tags: [],
      note: '',
      favorite: false,
      sensitivity: options.sensitivity,
      status: 'ready',
      integrity: result.integrity,
      previewKind: entry.inspection.previewKind,
      offlineAvailable: Boolean(options.offline),
      createdAt: now,
      updatedAt: now,
      importedAt: now,
      lastOpenedAt: null,
      deletedAt: null,
      retentionUntil: null
    };
  }

  async function verifyRemoteDocumentObject(remoteFile, result, documentId, operationId) {
    if (!remoteFile?.id) throw new Error('DOCUMENT_REMOTE_OBJECT_MISSING');
    const metadata = await KeyronDrive.getDocumentObjectMetadata(remoteFile.id);
    const properties = metadata?.appProperties || {};
    const valid = metadata?.id === remoteFile.id &&
      metadata?.trashed !== true &&
      String(metadata?.name || '').endsWith('.kdoc') &&
      Number(metadata?.size) === Number(result.container.size) &&
      properties.keyronRole === 'document-object' &&
      properties.keyronVersion === '1' &&
      properties.keyronDocument === documentId &&
      properties.keyronOperation === operationId;
    if (!valid) throw new Error('DOCUMENT_REMOTE_VERIFICATION_FAILED');
    return metadata;
  }

  async function runImport(event) {
    event.preventDefault();
    if (!state.pendingFiles.length || state.operation) return;
    const docs = documents();
    if (!docs) return;
    el.importError.textContent = '';
    el.importDialog.close();
    state.operation = new AbortController();
    const rootCreated = ensureDocumentsRoot();
    if (rootCreated) {
      try {
        await state.deps.persistVault({ render: false, reason: 'document-root-key-init' });
      } catch (error) {
        state.operation = null;
        setProgress(false);
        state.deps.toast?.('Não foi possível proteger a chave documental no cofre.', 'error');
        return;
      }
    }

    const options = {
      categoryId: el.importCategory.value || null,
      sensitivity: el.importSensitivity.value,
      offline: el.importOffline.checked
    };
    const queue = state.pendingFiles.slice();
    state.pendingFiles = [];
    let completed = 0;
    try {
      for (const entry of queue) {
        const documentId = KeyronCrypto.randomId();
        const operationId = KeyronCrypto.randomId();
        let remoteFile = null;
        try {
          setProgress(true, entry.inspection.name, 'Preparando cifragem local…', 0);
          const result = await KeyronDocumentsCrypto.encryptFile(entry.file, {
            vaultId: vault().id,
            documentId,
            rootKey: docs.rootKey,
            signal: state.operation.signal,
            onProgress: (info) => progressFromCrypto(entry.inspection.name, info)
          });
          remoteFile = await KeyronDrive.uploadDocumentObject(result.container, {
            documentId,
            operationId,
            signal: state.operation.signal,
            onProgress: (info) => progressFromDrive(entry.inspection.name, info)
          });
          setProgress(true, entry.inspection.name, 'Verificando o objeto cifrado no Drive…', 99);
          remoteFile = await verifyRemoteDocumentObject(remoteFile, result, documentId, operationId);
          if (options.offline) await KeyronDocumentsCache.put(vault().id, documentId, 1, result.container);
          const item = newDocumentItem(result, remoteFile, entry, { ...options, documentId, operationId });
          docs.items.push(item);
          docs.updatedAt = new Date().toISOString();
          KeyronVault.addActivity(vault(), 'document', item.name);
          await state.deps.persistVault({ render: false, reason: 'document-import' });
          completed += 1;
          render();
        } catch (error) {
          docs.items = docs.items.filter((item) => item.id !== documentId);
          await KeyronDocumentsCache.remove(vault().id, documentId, 1).catch(() => null);
          if (remoteFile?.id && !docs.items.some((item) => item.objectId === remoteFile.id)) {
            await KeyronDrive.deleteDocumentObject(remoteFile.id).catch(() => null);
          }
          if (error.message === 'DOCUMENT_OPERATION_ABORTED') throw error;
          state.deps.toast?.(`“${entry.inspection.name}” não foi concluído.`, 'error', 5000);
        }
      }
      state.deps.toast?.(`${completed} ${completed === 1 ? 'documento foi protegido' : 'documentos foram protegidos'} e sincronizado(s).`, completed ? 'success' : 'error', 5200);
    } catch (error) {
      if (error.message === 'DOCUMENT_OPERATION_ABORTED') state.deps.toast?.('Importação cancelada. Nenhum conteúdo aberto foi mantido.', 'info');
      else state.deps.toast?.('A importação foi interrompida com segurança.', 'error');
    } finally {
      state.operation = null;
      setProgress(false);
      el.input.value = '';
      render();
    }
  }

  async function loadEncryptedContainer(item, onProgress = null) {
    if (item.offlineAvailable) {
      const cached = await KeyronDocumentsCache.get(vault().id, item.id, item.formatVersion).catch(() => null);
      if (cached) return cached;
    }
    if (!state.deps?.isDriveConnected?.()) throw new Error('DOCUMENT_OFFLINE_UNAVAILABLE');
    return KeyronDrive.downloadDocumentObject(item.objectId, { signal: state.operation?.signal, onProgress });
  }

  function cleanupViewer() {
    document.body.classList.remove('document-viewer-open');
    if (state.currentObjectUrl) URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = null;
    state.currentPlainBlob = null;
    state.currentItemId = null;
    el.viewerStage?.replaceChildren();
    el.viewerMeta?.replaceChildren();
  }

  function requiresExternalPdfViewer() {
    const ua = String(navigator.userAgent || '');
    const mobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    const compactScreen = Math.min(Number(screen?.width || 9999), Number(screen?.height || 9999)) <= 1024;
    return mobileBrowser || (coarsePointer && compactScreen);
  }

  function reservePdfViewerWindow(item) {
    let popup = null;
    try { popup = window.open('about:blank', '_blank'); } catch { popup = null; }
    if (!popup) return null;
    try {
      popup.document.title = 'Keyron — abrindo PDF';
      popup.document.documentElement.lang = 'pt-BR';
      popup.document.body.replaceChildren();
      popup.document.body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#070b12;color:#edf5ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;box-sizing:border-box;text-align:center';
      const wrap = popup.document.createElement('main');
      const brand = popup.document.createElement('strong');
      brand.textContent = 'KEYRON';
      brand.style.cssText = 'display:block;letter-spacing:.18em;font-size:20px;margin-bottom:14px';
      const title = popup.document.createElement('p');
      title.textContent = `Abrindo “${item.name}” com segurança…`;
      title.style.cssText = 'margin:0;color:#9fb0c4;font-size:14px;line-height:1.6';
      wrap.append(brand, title);
      popup.document.body.appendChild(wrap);
      popup.opener = null;
    } catch {
      // A janela já foi reservada pelo gesto do usuário; a navegação ainda pode prosseguir.
    }
    return popup;
  }

  function closeReservedPdfWindow(popup) {
    if (!popup) return;
    try { if (!popup.closed) popup.close(); } catch { /* sem ação */ }
  }

  function scheduleExternalPdfUrlCleanup(url) {
    window.setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* sem ação */ }
    }, EXTERNAL_PDF_URL_LIFETIME_MS);
  }

  function openPdfInDeviceViewer(url, reservedWindow = null, { allowSameWindowFallback = false } = {}) {
    if (!url) return false;
    if (reservedWindow) {
      try {
        if (!reservedWindow.closed) {
          reservedWindow.location.replace(url);
          return true;
        }
      } catch { /* tenta abrir uma nova janela abaixo */ }
    }
    let popup = null;
    try { popup = window.open(url, '_blank'); } catch { popup = null; }
    if (popup) {
      try { popup.opener = null; } catch { /* sem ação */ }
      return true;
    }
    if (allowSameWindowFallback) {
      try {
        window.location.assign(url);
        return true;
      } catch { /* sem ação */ }
    }
    return false;
  }

  function renderMobilePdfFallback(item) {
    const message = document.createElement('div');
    message.className = 'document-viewer-mobile-pdf';
    const icon = document.createElement('span');
    icon.textContent = 'PDF';
    const title = document.createElement('strong');
    title.textContent = 'Abrir no visualizador do aparelho';
    const detail = document.createElement('p');
    detail.textContent = 'Este navegador móvel bloqueia PDFs dentro da janela do aplicativo. O arquivo continuará vindo da memória local do Keyron, sem usar uma URL pública do Drive.';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn btn--primary';
    openButton.textContent = 'Abrir PDF';
    openButton.addEventListener('click', () => {
      const url = state.currentObjectUrl;
      if (!url) return;
      const opened = openPdfInDeviceViewer(url, null, { allowSameWindowFallback: true });
      if (!opened) {
        state.deps.toast?.('O navegador não conseguiu abrir o visualizador de PDF.', 'error');
        return;
      }
      state.currentObjectUrl = null;
      scheduleExternalPdfUrlCleanup(url);
      if (el.viewerDialog.open) el.viewerDialog.close();
    });
    const security = document.createElement('small');
    security.textContent = 'Ao terminar, feche a aba do PDF para remover a visualização aberta da tela do aparelho.';
    message.append(icon, title, detail, openButton, security);
    el.viewerStage.appendChild(message);
  }

  function recordDocumentOpened(item) {
    item.lastOpenedAt = new Date().toISOString();
    item.updatedAt = item.lastOpenedAt;
    state.deps.persistVault({ render: false, reason: 'document-open' }).catch(() => null);
    render();
  }

  async function validatePdfPreview(blob) {
    if (!(blob instanceof Blob) || blob.size < 5) {
      throw new Error('DOCUMENT_PREVIEW_TYPE_MISMATCH');
    }
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const valid = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d;
    head.fill(0);
    if (!valid) throw new Error('DOCUMENT_PREVIEW_TYPE_MISMATCH');
  }

  function requestReauthentication(reason) {
    return new Promise((resolve) => {
      state.reauthResolve?.(false);
      state.reauthResolve = resolve;
      el.reauthReason.textContent = reason;
      el.reauthPassword.value = '';
      el.reauthError.textContent = '';
      const vaultId = vault()?.id;
      Promise.all([
        KeyronBiometric.platformAvailable().catch(() => false),
        vaultId ? KeyronBiometric.hasRecord(vaultId).catch(() => false) : Promise.resolve(false)
      ]).then(([available, enrolled]) => { el.reauthBiometric.hidden = !(available && enrolled); });
      el.reauthDialog.showModal();
      setTimeout(() => el.reauthPassword.focus(), 60);
    });
  }

  async function verifyReauthPassword(password) {
    if (!password || !bundle()) return false;
    try {
      await KeyronCrypto.unlockBundle(password, bundle());
      return true;
    } catch {
      return false;
    }
  }

  async function finishReauth(success) {
    if (success) state.lastReauthAt = Date.now();
    const resolve = state.reauthResolve;
    state.reauthResolve = null;
    el.reauthPassword.value = '';
    if (el.reauthDialog.open) el.reauthDialog.close();
    resolve?.(Boolean(success));
  }

  async function ensureSensitiveAccess(item, action) {
    if (!item || item.sensitivity === 'normal') return true;
    if (item.sensitivity === 'sensitive' && Date.now() - state.lastReauthAt < REAUTH_WINDOW_MS) return true;
    const reason = item.sensitivity === 'very-sensitive'
      ? `“${item.name}” está marcado como muito sensível. Confirme sua identidade para ${action}.`
      : `Confirme sua identidade para ${action} “${item.name}”.`;
    return requestReauthentication(reason);
  }

  async function openItem(item, { reservedPdfWindow = null } = {}) {
    if (!(await ensureSensitiveAccess(item, 'abrir'))) {
      closeReservedPdfWindow(reservedPdfWindow);
      return;
    }
    if (state.operation) {
      closeReservedPdfWindow(reservedPdfWindow);
      return;
    }
    state.operation = new AbortController();
    cleanupViewer();
    setProgress(true, item.name, 'Buscando a cópia cifrada…', 0);
    try {
      const container = await loadEncryptedContainer(item, (info) => progressFromDrive(item.name, info));
      setProgress(true, item.name, 'Descriptografando somente neste dispositivo…', 25);
      let plain = await KeyronDocumentsCrypto.decryptToBlob(container, item, {
        vaultId: vault().id,
        rootKey: documents().rootKey,
        signal: state.operation.signal,
        onProgress: (info) => setProgress(true, item.name, `Abrindo localmente · ${info.percent || 0}%`, info.percent || 0)
      });
      if (item.previewKind === 'pdf') {
        await validatePdfPreview(plain);
        if (plain.type !== 'application/pdf') plain = new Blob([plain], { type: 'application/pdf' });
      }

      const objectUrl = URL.createObjectURL(plain);
      if (item.previewKind === 'pdf' && requiresExternalPdfViewer()) {
        const openedExternally = openPdfInDeviceViewer(objectUrl, reservedPdfWindow);
        if (openedExternally) {
          reservedPdfWindow = null;
          scheduleExternalPdfUrlCleanup(objectUrl);
          plain = null;
          recordDocumentOpened(item);
          state.deps.toast?.('PDF aberto no visualizador seguro do aparelho.', 'success', 3600);
          return;
        }
      }

      closeReservedPdfWindow(reservedPdfWindow);
      reservedPdfWindow = null;
      state.currentPlainBlob = plain;
      state.currentObjectUrl = objectUrl;
      state.currentItemId = item.id;
      el.viewerTitle.textContent = item.name;
      el.viewerType.textContent = `${typeLabel(item)} · ${sensitivityLabel(item.sensitivity)}`;
      el.viewerFavorite.textContent = item.favorite ? '★' : '☆';
      el.viewerPrint.hidden = !['pdf', 'image'].includes(item.previewKind) || (item.previewKind === 'pdf' && requiresExternalPdfViewer());
      el.viewerStage.replaceChildren();
      if (item.previewKind === 'image') {
        const image = document.createElement('img');
        image.src = state.currentObjectUrl;
        image.alt = item.name;
        image.className = 'document-viewer-image';
        el.viewerStage.appendChild(image);
      } else if (item.previewKind === 'pdf' && requiresExternalPdfViewer()) {
        renderMobilePdfFallback(item);
      } else if (item.previewKind === 'pdf') {
        const frame = document.createElement('iframe');
        // No desktop, o Blob local pode usar o visualizador nativo. Em navegadores
        // móveis, o PDF é aberto como navegação de nível superior para evitar o
        // bloqueio do Chrome sem liberar URLs externas nem enfraquecer a CSP.
        frame.src = `${state.currentObjectUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
        frame.title = item.name;
        frame.className = 'document-viewer-frame';
        frame.referrerPolicy = 'no-referrer';
        el.viewerStage.appendChild(frame);
      } else {
        const message = document.createElement('div');
        message.className = 'document-viewer-generic';
        const icon = document.createElement('span');
        icon.textContent = iconFor(item);
        const title = document.createElement('strong');
        title.textContent = 'Visualização não executada';
        const detail = document.createElement('p');
        detail.textContent = 'Este formato permanece cifrado e pode ser salvo no dispositivo. O Keyron não executa conteúdo ativo.';
        message.append(icon, title, detail);
        el.viewerStage.appendChild(message);
      }
      const meta = document.createElement('p');
      meta.textContent = `${formatBytes(item.originalBytes)} · ${categoryName(item.categoryId)} · importado em ${formatDate(item.importedAt)}`;
      el.viewerMeta.appendChild(meta);
      recordDocumentOpened(item);
      document.body.classList.add('document-viewer-open');
      el.viewerDialog.showModal();
    } catch (error) {
      closeReservedPdfWindow(reservedPdfWindow);
      const messages = {
        DOCUMENT_OFFLINE_UNAVAILABLE: 'Este documento não está disponível offline. Reconecte o Google Drive.',
        DOCUMENT_AUTH_FAILED: 'A integridade do documento não pôde ser confirmada. Ele não foi aberto.',
        INVALID_DOCUMENT_CONTAINER: 'O objeto cifrado está incompleto ou corrompido.',
        DOCUMENT_PREVIEW_TYPE_MISMATCH: 'O conteúdo aberto não corresponde a um PDF válido e não foi exibido.',
        DOCUMENT_OPERATION_ABORTED: 'A abertura foi cancelada.'
      };
      state.deps.toast?.(messages[error.message] || 'Não foi possível abrir este documento com segurança.', 'error', 5500);
      cleanupViewer();
    } finally {
      state.operation = null;
      setProgress(false);
    }
  }

  async function saveItem(item) {
    if (!(await ensureSensitiveAccess(item, 'exportar'))) return;
    if (state.operation) return;
    state.operation = new AbortController();
    setProgress(true, item.name, 'Preparando exportação segura…', 0);
    try {
      const container = await loadEncryptedContainer(item, (info) => progressFromDrive(item.name, info));
      const suggestedName = KeyronDocumentsCrypto.sanitizeFilename(item.name);
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({ suggestedName });
        const writable = await handle.createWritable();
        await KeyronDocumentsCrypto.decryptToWritable(container, item, writable, {
          vaultId: vault().id,
          rootKey: documents().rootKey,
          signal: state.operation.signal,
          onProgress: (info) => setProgress(true, item.name, `Gravando cópia aberta · ${info.percent || 0}%`, info.percent || 0)
        });
      } else {
        const plain = state.currentItemId === item.id && state.currentPlainBlob
          ? state.currentPlainBlob
          : await KeyronDocumentsCrypto.decryptToBlob(container, item, {
              vaultId: vault().id,
              rootKey: documents().rootKey,
              signal: state.operation.signal,
              onProgress: (info) => setProgress(true, item.name, `Preparando download · ${info.percent || 0}%`, info.percent || 0)
            });
        const url = URL.createObjectURL(plain);
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      state.deps.toast?.('A cópia foi exportada. Fora do Keyron, ela não permanece cifrada.', 'success', 5200);
    } catch (error) {
      if (error?.name !== 'AbortError' && error.message !== 'DOCUMENT_OPERATION_ABORTED') {
        state.deps.toast?.('Não foi possível concluir a exportação.', 'error');
      }
    } finally {
      state.operation = null;
      setProgress(false);
    }
  }

  async function printCurrent() {
    const item = itemById(state.currentItemId);
    if (!item || !state.currentObjectUrl) return;
    if (!(await ensureSensitiveAccess(item, 'imprimir'))) return;
    if (!state.printAcknowledged) {
      const accepted = await state.deps.askConfirm({
        kicker: 'SAÍDA DO COFRE',
        title: 'Imprimir este documento?',
        message: 'A impressão entrega uma cópia aberta ao sistema operacional, ao driver e à impressora. Continue somente em um dispositivo confiável.',
        confirmLabel: 'Imprimir',
        kind: 'primary'
      });
      if (!accepted) return;
      state.printAcknowledged = true;
    }
    const frame = item.previewKind === 'pdf' ? $('iframe', el.viewerStage) : null;
    if (frame?.contentWindow) {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    }
    if (item.previewKind === 'image') {
      const printFrame = document.createElement('iframe');
      printFrame.className = 'document-print-frame';
      printFrame.src = state.currentObjectUrl;
      document.body.appendChild(printFrame);
      printFrame.addEventListener('load', () => {
        try { printFrame.contentWindow?.print(); } finally { setTimeout(() => printFrame.remove(), 30000); }
      }, { once: true });
    }
  }

  function openDetails(item) {
    state.currentItemId = item.id;
    fillCategorySelect(el.detailCategory, item.categoryId);
    el.detailName.value = item.name;
    el.detailSensitivity.value = item.sensitivity;
    el.detailTags.value = (item.tags || []).join(', ');
    el.detailNote.value = item.note || '';
    el.detailTrash.textContent = item.deletedAt ? 'Excluir permanentemente' : 'Mover para lixeira';
    el.detailOffline.hidden = Boolean(item.deletedAt);
    el.detailOffline.textContent = item.offlineAvailable ? 'Remover do offline' : 'Disponibilizar offline';
    el.detailsDialog.showModal();
  }

  async function saveDetails(event) {
    event.preventDefault();
    const item = itemById(state.currentItemId);
    if (!item) return;
    const nextSensitivity = el.detailSensitivity.value;
    if (item.sensitivity === 'very-sensitive' && nextSensitivity !== 'very-sensitive' && !(await ensureSensitiveAccess(item, 'reduzir a proteção de'))) return;
    item.name = KeyronDocumentsCrypto.sanitizeFilename(el.detailName.value, item.name);
    item.categoryId = el.detailCategory.value || null;
    item.sensitivity = nextSensitivity;
    item.tags = [...new Set(String(el.detailTags.value || '').split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
    item.note = String(el.detailNote.value || '').trim().slice(0, 2000);
    item.updatedAt = new Date().toISOString();
    documents().updatedAt = item.updatedAt;
    await state.deps.persistVault({ render: false, reason: 'document-metadata' });
    el.detailsDialog.close();
    render();
    state.deps.toast?.('Detalhes atualizados dentro do cofre cifrado.', 'success');
  }

  async function trashItem(item) {
    if (!item.deletedAt) {
      const accepted = await state.deps.askConfirm({ title: 'Mover para a lixeira?', message: `“${item.name}” ficará recuperável por ${RETENTION_DAYS} dias.`, confirmLabel: 'Mover' });
      if (!accepted) return;
      const now = new Date();
      item.deletedAt = now.toISOString();
      item.retentionUntil = new Date(now.getTime() + RETENTION_DAYS * 86400000).toISOString();
      item.updatedAt = now.toISOString();
      await state.deps.persistVault({ render: false, reason: 'document-trash' });
      el.detailsDialog.open && el.detailsDialog.close();
      render();
      return;
    }
    await destroyItem(item);
  }

  async function restoreItem(item) {
    item.deletedAt = null;
    item.retentionUntil = null;
    item.updatedAt = new Date().toISOString();
    await state.deps.persistVault({ render: false, reason: 'document-restore' });
    render();
    state.deps.toast?.('Documento restaurado.', 'success');
  }

  async function destroyItem(item) {
    if (!(await ensureSensitiveAccess(item, 'excluir permanentemente'))) return;
    const accepted = await state.deps.askConfirm({
      kicker: 'EXCLUSÃO PERMANENTE',
      title: 'Destruir este documento?',
      message: `“${item.name}” terá a chave retirada do cofre e o objeto cifrado será removido do Drive. Backups antigos ainda podem conter uma versão recuperável.`,
      confirmLabel: 'Excluir permanentemente'
    });
    if (!accepted) return;

    const docs = documents();
    const previousItems = docs.items.slice();
    const previousTombstones = Array.isArray(docs.tombstones) ? docs.tombstones.slice() : [];
    const previousUpdatedAt = docs.updatedAt;
    const deletedAt = new Date();
    const tombstone = {
      id: item.id,
      objectId: item.objectId,
      operationId: item.operationId || '',
      deletedAt: deletedAt.toISOString(),
      retainUntil: new Date(deletedAt.getTime() + 180 * 86400000).toISOString(),
      remoteDeleted: false
    };
    docs.tombstones = Array.isArray(docs.tombstones) ? docs.tombstones : [];
    docs.tombstones = [tombstone, ...docs.tombstones.filter((entry) => entry.id !== item.id)].slice(0, 20000);
    docs.items = docs.items.filter((candidate) => candidate.id !== item.id);
    docs.updatedAt = tombstone.deletedAt;

    try {
      // O tombstone e a retirada da chave são confirmados localmente antes da
      // limpeza remota. Assim uma falha de rede não ressuscita o documento.
      await state.deps.persistVault({ render: false, reason: 'document-delete-cryptographic' });
    } catch {
      docs.items = previousItems;
      docs.tombstones = previousTombstones;
      docs.updatedAt = previousUpdatedAt;
      state.deps.toast?.('Não foi possível confirmar a destruição da chave no cofre. Nada foi removido do Drive.', 'error', 5500);
      return;
    }

    await KeyronDocumentsCache.remove(vault().id, item.id, item.formatVersion).catch(() => null);
    el.detailsDialog.open && el.detailsDialog.close();
    render();

    if (!state.deps.isDriveConnected()) {
      state.deps.toast?.('A chave foi retirada do cofre. A limpeza do objeto cifrado no Drive ficou pendente até a reconexão.', 'warning', 6500);
      return;
    }
    try {
      await KeyronDrive.deleteDocumentObject(tombstone.objectId);
      tombstone.remoteDeleted = true;
      await state.deps.persistVault({ render: false, reason: 'document-delete-remote-confirmed' });
      state.deps.toast?.('Documento removido do cofre e objeto cifrado apagado do Drive.', 'success');
    } catch {
      state.deps.toast?.('A chave foi destruída no cofre. A limpeza remota continuará pendente e será tentada novamente.', 'warning', 6500);
    }
  }

  async function reconcileDeletionTombstones() {
    const docs = documents();
    if (!docs || !state.deps?.isDriveConnected?.()) return;
    const pending = (Array.isArray(docs.tombstones) ? docs.tombstones : [])
      .filter((entry) => !entry.remoteDeleted && entry.objectId)
      .slice(0, 10);
    if (!pending.length) return;
    let changed = false;
    for (const tombstone of pending) {
      try {
        await KeyronDrive.deleteDocumentObject(tombstone.objectId);
        tombstone.remoteDeleted = true;
        changed = true;
      } catch {
        // Mantém o tombstone cifrado para outra tentativa; nunca restaura a chave.
      }
    }
    if (changed) await state.deps.persistVault({ render: false, reason: 'document-delete-reconcile' });
  }

  async function toggleOffline(item) {
    if (item.offlineAvailable) {
      await KeyronDocumentsCache.remove(vault().id, item.id, item.formatVersion).catch(() => null);
      item.offlineAvailable = false;
      item.updatedAt = new Date().toISOString();
      await state.deps.persistVault({ render: false, reason: 'document-offline-remove' });
      render();
      state.deps.toast?.('Cópia cifrada removida deste dispositivo.', 'success');
      return;
    }
    if (!state.deps.isDriveConnected()) {
      state.deps.toast?.('Reconecte o Drive para baixar a cópia cifrada.', 'error');
      return;
    }
    state.operation = new AbortController();
    try {
      const container = await loadEncryptedContainer(item, (info) => progressFromDrive(item.name, info));
      await KeyronDocumentsCache.put(vault().id, item.id, item.formatVersion, container);
      item.offlineAvailable = true;
      item.updatedAt = new Date().toISOString();
      await state.deps.persistVault({ render: false, reason: 'document-offline-add' });
      render();
      state.deps.toast?.('Somente a cópia cifrada ficou disponível offline.', 'success');
    } finally {
      state.operation = null;
      setProgress(false);
    }
  }

  function clearDocumentDragVisuals() {
    state.draggingItemId = null;
    state.dropTarget = null;
    el.list?.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after').forEach((node) => {
      node.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
    });
    document.body.classList.remove('keyron-document-dragging');
  }

  function dropBeforeForEvent(event, card) {
    const rect = card.getBoundingClientRect();
    const nearSameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.34;
    return nearSameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
  }

  async function reorderDocument(draggedId, targetId, before) {
    if (!manualReorderEnabled() || !draggedId || !targetId || draggedId === targetId) return;
    const docs = documents();
    const active = docs.items.filter((item) => !item.deletedAt)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const draggedIndex = active.findIndex((item) => item.id === draggedId);
    if (draggedIndex < 0) return;
    const [dragged] = active.splice(draggedIndex, 1);
    let targetIndex = active.findIndex((item) => item.id === targetId);
    if (targetIndex < 0) return;
    if (!before) targetIndex += 1;
    active.splice(targetIndex, 0, dragged);
    const previousOrders = new Map(docs.items.map((item) => [item.id, item.order]));
    const previousDraggedUpdatedAt = dragged.updatedAt;
    const previousDocumentsUpdatedAt = docs.updatedAt;
    active.forEach((item, index) => { item.order = index; });
    dragged.updatedAt = new Date().toISOString();
    docs.updatedAt = dragged.updatedAt;
    try {
      await state.deps.persistVault({ render: false, reason: 'document-reorder' });
    } catch (error) {
      for (const item of docs.items) item.order = previousOrders.get(item.id);
      dragged.updatedAt = previousDraggedUpdatedAt;
      docs.updatedAt = previousDocumentsUpdatedAt;
      throw error;
    }
    render();
    state.deps.toast?.(`“${dragged.name}” foi reordenado.`, 'success');
  }

  async function handleListClick(event) {
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('[data-document-id]');
    if (!button || !card) return;
    const item = itemById(card.dataset.documentId);
    if (!item) return;
    const action = button.dataset.action;
    if (action === 'open') {
      const reservedPdfWindow = item.previewKind === 'pdf' && item.sensitivity === 'normal' && requiresExternalPdfViewer()
        ? reservePdfViewerWindow(item)
        : null;
      await openItem(item, { reservedPdfWindow });
    } else if (action === 'download') await saveItem(item);
    else if (action === 'details') openDetails(item);
    else if (action === 'restore') await restoreItem(item);
    else if (action === 'destroy') await destroyItem(item);
  }

  function cancelOperation() {
    state.operation?.abort();
    KeyronDocumentsCrypto.terminateAll();
  }

  function bindEvents() {
    el.button.addEventListener('click', open);
    el.back.addEventListener('click', close);
    el.add.addEventListener('click', () => el.input.click());
    el.choose.addEventListener('click', () => el.input.click());
    el.input.addEventListener('change', () => prepareImport(el.input.files));
    el.cancel.addEventListener('click', cancelOperation);
    el.importForm.addEventListener('submit', runImport);
    el.list.addEventListener('click', (event) => handleListClick(event).catch(() => null));
    el.list.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.document-card[data-document-id]');
      if (!card || !manualReorderEnabled() || event.target.closest('button')) { event.preventDefault(); return; }
      state.draggingItemId = card.dataset.documentId;
      state.dropTarget = null;
      card.classList.add('is-dragging');
      document.body.classList.add('keyron-document-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-keyron-document', state.draggingItemId);
      event.dataTransfer.setData('text/plain', state.draggingItemId);
    });
    el.list.addEventListener('dragover', (event) => {
      if (!state.draggingItemId || !manualReorderEnabled()) return;
      const card = event.target.closest('.document-card[data-document-id]');
      if (!card || card.dataset.documentId === state.draggingItemId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const before = dropBeforeForEvent(event, card);
      state.dropTarget = { id: card.dataset.documentId, before };
      el.list.querySelectorAll('.is-drop-before, .is-drop-after').forEach((node) => node.classList.remove('is-drop-before', 'is-drop-after'));
      card.classList.add(before ? 'is-drop-before' : 'is-drop-after');
    });
    el.list.addEventListener('drop', (event) => {
      if (!state.draggingItemId || !state.dropTarget) return;
      event.preventDefault();
      const draggedId = state.draggingItemId;
      const target = { ...state.dropTarget };
      clearDocumentDragVisuals();
      reorderDocument(draggedId, target.id, target.before).catch(() => {
        state.deps.toast?.('Não foi possível salvar a nova ordem.', 'error');
        render();
      });
    });
    el.list.addEventListener('dragend', clearDocumentDragVisuals);
    el.filters.addEventListener('click', (event) => {
      const manage = event.target.closest('button[data-manage-document-categories]');
      if (manage) { openCategoryPicker(null); return; }
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      render();
    });
    el.sort.addEventListener('change', async () => {
      const docs = documents();
      const previousSort = state.sort;
      state.sort = el.sort.value;
      docs.preferences.sort = state.sort;
      try {
        await state.deps.persistVault({ render: false, reason: 'document-sort-preference' });
      } catch {
        state.sort = previousSort;
        docs.preferences.sort = previousSort;
        state.deps.toast?.('Não foi possível salvar a ordenação escolhida.', 'error');
      }
      render();
    });
    el.viewToggle.addEventListener('click', async () => {
      const docs = documents();
      docs.preferences.view = docs.preferences.view === 'list' ? 'grid' : 'list';
      await state.deps.persistVault({ render: false, reason: 'document-view-preference' });
      render();
    });
    el.search.addEventListener('input', () => { if (state.active) render(); });
    el.dropzone.addEventListener('dragenter', (event) => { event.preventDefault(); el.dropzone.classList.add('is-dragover'); });
    el.dropzone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    el.dropzone.addEventListener('dragleave', (event) => { if (!el.dropzone.contains(event.relatedTarget)) el.dropzone.classList.remove('is-dragover'); });
    el.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('is-dragover');
      prepareImport(event.dataTransfer.files).catch(() => null);
    });
    el.dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.input.click(); } });
    el.viewerDialog.addEventListener('close', cleanupViewer);
    el.viewerDownload.addEventListener('click', () => { const item = itemById(state.currentItemId); if (item) saveItem(item); });
    el.viewerPrint.addEventListener('click', () => printCurrent().catch(() => null));
    el.viewerFavorite.addEventListener('click', async () => {
      const item = itemById(state.currentItemId);
      if (!item) return;
      item.favorite = !item.favorite;
      item.updatedAt = new Date().toISOString();
      await state.deps.persistVault({ render: false, reason: 'document-favorite' });
      el.viewerFavorite.textContent = item.favorite ? '★' : '☆';
      render();
    });
    el.detailsForm.addEventListener('submit', saveDetails);
    el.detailTrash.addEventListener('click', () => { const item = itemById(state.currentItemId); if (item) trashItem(item).catch(() => null); });
    el.detailOffline.addEventListener('click', async () => {
      const item = itemById(state.currentItemId);
      if (!item) return;
      await toggleOffline(item);
      if (el.detailsDialog.open) el.detailOffline.textContent = item.offlineAvailable ? 'Remover do offline' : 'Disponibilizar offline';
    });
    [el.importCategoryTrigger, el.detailCategoryTrigger].forEach((trigger) => {
      trigger.addEventListener('click', () => openCategoryPicker(trigger.dataset.documentCategorySelect));
    });
    el.categoryClose.addEventListener('click', () => el.categoryDialog.close());
    el.categoryOptions.addEventListener('click', (event) => {
      const remove = event.target.closest('button[data-category-delete]');
      if (remove) { deleteDocumentCategory(remove.dataset.categoryDelete).catch(() => null); return; }
      const choice = event.target.closest('button[data-category-choice]');
      if (choice) chooseCategory(choice.dataset.categoryChoice);
    });
    el.categoryForm.addEventListener('submit', (event) => createDocumentCategory(event).catch(() => {
      el.categoryError.textContent = 'Não foi possível salvar a categoria.';
    }));
    el.categoryDialog.addEventListener('close', () => { el.categoryError.textContent = ''; });
    el.reauthForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ok = await verifyReauthPassword(el.reauthPassword.value);
      if (!ok) { el.reauthError.textContent = 'Senha mestra incorreta.'; return; }
      await finishReauth(true);
    });
    el.reauthBiometric.addEventListener('click', async () => {
      el.reauthError.textContent = '';
      try {
        const password = await KeyronBiometric.unlock(vault().id);
        const ok = await verifyReauthPassword(password);
        await finishReauth(ok);
        if (!ok) state.deps.toast?.('A biometria não confirmou este cofre.', 'error');
      } catch {
        el.reauthError.textContent = 'Não foi possível confirmar a biometria.';
      }
    });
    el.reauthDialog.addEventListener('close', () => {
      if (state.reauthResolve) finishReauth(false);
    });
  }

  function init(deps) {
    state.deps = deps;
    bindElements();
    bindEvents();
    return true;
  }

  function scrub() {
    cancelOperation();
    cleanupViewer();
    state.pendingFiles = [];
    state.draggingItemId = null;
    state.dropTarget = null;
    state.categorySelectId = null;
    state.active = false;
    state.lastReauthAt = 0;
    state.printAcknowledged = false;
    if (el.view) el.view.hidden = true;
    if (el.vaultHead) el.vaultHead.hidden = false;
    if (el.filterStrip) el.filterStrip.hidden = false;
    if (el.board) el.board.hidden = false;
    if (el.search) { el.search.value = ''; el.search.placeholder = 'Buscar credencial, usuário, site ou categoria…'; }
    el.list?.replaceChildren();
    el.filters?.replaceChildren();
    el.importFiles?.replaceChildren();
    el.categoryOptions?.replaceChildren();
    document.body.classList.remove('document-viewer-open', 'keyron-document-dragging');
    setProgress(false);
  }

  function lock() {
    scrub();
    [el.importDialog, el.viewerDialog, el.detailsDialog, el.categoryDialog, el.reauthDialog].forEach((dialog) => { if (dialog?.open) dialog.close(); });
  }

  function closeDialogs() {
    [el.importDialog, el.viewerDialog, el.detailsDialog, el.categoryDialog, el.reauthDialog].forEach((dialog) => { if (dialog?.open) dialog.close(); });
  }

  function isActive() {
    return state.active;
  }

  return Object.freeze({ init, open, close, render, lock, scrub, closeDialogs, isActive });
})();
