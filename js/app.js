(() => {
  'use strict';

  const state = {
    bundle: null,
    key: null,
    vault: null,
    googleVerified: false,
    remoteInfo: null,
    needsInitialPush: false,
    accessMode: 'unlock',
    failedAttempts: 0,
    editingEntryId: null,
    editingColumnId: null,
    pendingLogo: null,
    activeCategoryId: '',
    persistQueue: Promise.resolve(),
    syncTimer: null,
    syncInFlight: false,
    syncRequested: false,
    autoLockTimer: null,
    clipboardTimer: null,
    pendingImportBundle: null,
    preImportBundle: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const el = {
    accessShell: $('#access-shell'),
    googleStep: $('#google-step'),
    masterStep: $('#master-step'),
    googleBtn: $('#google-connect-btn'),
    googleState: $('#google-state'),
    masterTitle: $('#master-title'),
    masterSubtitle: $('#master-subtitle'),
    masterForm: $('#master-form'),
    masterPassword: $('#master-password'),
    masterConfirmGroup: $('#master-confirm-group'),
    masterConfirm: $('#master-password-confirm'),
    masterStrengthWrap: $('#master-strength-wrap'),
    masterStrengthBar: $('#master-strength-bar'),
    masterStrengthLabel: $('#master-strength-label'),
    masterError: $('#master-error'),
    masterSubmit: $('#master-submit'),
    toggleMaster: $('#toggle-master'),
    backGoogle: $('#back-google-btn'),
    appScreen: $('#app-screen'),
    search: $('#search-input'),
    syncChip: $('#sync-chip'),
    vaultSummary: $('#vault-summary'),
    filterStrip: $('#filter-strip'),
    board: $('#vault-board'),
    emptyVault: $('#empty-vault'),
    addEntry: $('#add-entry-btn'),
    emptyAdd: $('#empty-add-btn'),
    addColumn: $('#add-column-btn'),
    manageCategories: $('#manage-categories-btn'),
    settingsBtn: $('#settings-btn'),
    lockBtn: $('#lock-btn'),
    toastArea: $('#toast-area'),
    busy: $('#busy-overlay'),
    busyTitle: $('#busy-title'),
    busyDetail: $('#busy-detail'),
    entryDialog: $('#entry-dialog'),
    entryForm: $('#entry-form'),
    entryDialogTitle: $('#entry-dialog-title'),
    logoInput: $('#logo-input'),
    logoPreview: $('#logo-preview'),
    removeLogo: $('#remove-logo-btn'),
    fName: $('#f-name'),
    fColumn: $('#f-column'),
    fCategory: $('#f-category'),
    fUsername: $('#f-username'),
    fEmail: $('#f-email'),
    fPassword: $('#f-password'),
    fUrl: $('#f-url'),
    fSecret: $('#f-secret'),
    fNotes: $('#f-notes'),
    togglePassword: $('#toggle-password-btn'),
    generatePassword: $('#generate-password-btn'),
    passwordStrength: $('#password-strength-bar'),
    quickCategory: $('#quick-category-btn'),
    deleteEntry: $('#delete-entry-btn'),
    columnDialog: $('#column-dialog'),
    columnForm: $('#column-form'),
    columnDialogTitle: $('#column-dialog-title'),
    columnName: $('#column-name'),
    columnIcon: $('#column-icon'),
    categoryDialog: $('#category-dialog'),
    categoryForm: $('#category-form'),
    categoryName: $('#category-name'),
    categoryColor: $('#category-color'),
    categoryList: $('#category-list'),
    settingsDialog: $('#settings-dialog'),
    autoLock: $('#setting-auto-lock'),
    clipboard: $('#setting-clipboard'),
    exportBtn: $('#export-btn'),
    importBtn: $('#import-btn'),
    importInput: $('#import-input'),
    backupNow: $('#backup-now-btn'),
    signout: $('#signout-btn'),
    storageInfo: $('#storage-info')
  };

  function toast(message, kind = 'info', duration = 3400) {
    const node = document.createElement('div');
    node.className = `toast toast--${kind}`;
    node.textContent = message;
    el.toastArea.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    setTimeout(() => {
      node.classList.remove('is-visible');
      setTimeout(() => node.remove(), 250);
    }, duration);
  }

  function setBusy(visible, title = 'Protegendo seus dados…', detail = 'Aguarde um instante.') {
    el.busy.hidden = !visible;
    el.busyTitle.textContent = title;
    el.busyDetail.textContent = detail;
  }

  function setSyncStatus(status, label) {
    el.syncChip.className = `sync-chip sync-chip--${status}`;
    $('b', el.syncChip).textContent = label || ({ syncing: 'Salvando', synced: 'Sincronizado', offline: 'Local', error: 'Falha' }[status] || status);
  }

  function configured() {
    return Boolean(KeyronConfig.GOOGLE_CLIENT_ID) && !KeyronConfig.GOOGLE_CLIENT_ID.startsWith('SEU_CLIENT_ID');
  }

  function parseTime(bundle) {
    const value = Date.parse(bundle?.updatedAt || 0);
    return Number.isFinite(value) ? value : 0;
  }

  async function chooseBundle(remoteInfo) {
    const local = state.bundle;
    const remote = remoteInfo?.bundle || null;
    state.needsInitialPush = false;

    if (!local && !remote) return null;
    if (!local && remote) {
      await KeyronStorage.saveCurrent(remote);
      return remote;
    }
    if (local && !remote) {
      state.needsInitialPush = true;
      return local;
    }

    const localId = local.vaultId || 'legacy';
    const remoteId = remote.vaultId || 'legacy';
    const localIsNewer = parseTime(local) >= parseTime(remote);

    if (localId !== remoteId) {
      const chosen = localIsNewer ? local : remote;
      const recovery = localIsNewer ? remote : local;
      await KeyronStorage.saveRecovery(recovery).catch(() => null);
      toast('Foram encontrados dois cofres diferentes. O mais recente foi aberto e o outro ficou preservado como recuperação local.', 'warning', 6500);
      state.needsInitialPush = localIsNewer;
      await KeyronStorage.saveCurrent(chosen);
      return chosen;
    }

    if (localIsNewer) {
      state.needsInitialPush = parseTime(local) > parseTime(remote);
      return local;
    }

    await KeyronStorage.saveCurrent(remote);
    return remote;
  }

  async function waitForGoogleLibrary(timeoutMs = 8000) {
    const started = Date.now();
    while (!window.google?.accounts?.oauth2) {
      if (Date.now() - started > timeoutMs) throw new Error('GOOGLE_LIBRARY_TIMEOUT');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function startGoogleVerification(forceAccountChoice = false) {
    if (!configured()) {
      el.googleState.textContent = 'Configure o Client ID em js/config.js antes de usar.';
      toast('O Google OAuth ainda não foi configurado. Veja CONFIGURACAO.md.', 'error', 5500);
      return;
    }

    el.googleBtn.disabled = true;
    el.googleState.textContent = 'Abrindo a verificação segura do Google…';
    try {
      await waitForGoogleLibrary();
      KeyronDrive.init(
        KeyronConfig.GOOGLE_CLIENT_ID,
        onGoogleVerified,
        (message) => {
          el.googleBtn.disabled = false;
          el.googleState.textContent = 'A verificação não foi concluída.';
          toast(`Não foi possível verificar com o Google: ${message}`, 'error');
        }
      );
      KeyronDrive.connect(forceAccountChoice);
    } catch (error) {
      console.error(error);
      el.googleBtn.disabled = false;
      el.googleState.textContent = 'A biblioteca do Google não carregou. Confira a internet e tente novamente.';
      toast('A verificação do Google não pôde ser iniciada.', 'error');
    }
  }

  async function onGoogleVerified() {
    state.googleVerified = true;
    el.googleBtn.disabled = false;
    el.googleState.textContent = 'Google verificado. Localizando seu cofre…';
    setBusy(true, 'Verificando o seu Drive…', 'O Keyron está procurando apenas os arquivos que ele próprio criou.');

    try {
      state.remoteInfo = await KeyronDrive.loadBundle();
      state.bundle = await chooseBundle(state.remoteInfo);
      configureMasterStep(state.bundle ? 'unlock' : 'create');
      showMasterStep();
    } catch (error) {
      console.error(error);
      if (state.bundle) {
        toast('O Google foi verificado, mas o Drive não respondeu. O cofre cifrado deste dispositivo ainda pode ser aberto.', 'warning', 5500);
        configureMasterStep('unlock');
        showMasterStep();
      } else {
        state.googleVerified = false;
        el.googleState.textContent = 'Não foi possível acessar a pasta do Keyron no Drive.';
        toast('Sem acesso ao Drive e sem cofre local. Tente verificar novamente.', 'error', 5200);
      }
    } finally {
      setBusy(false);
    }
  }

  function showGoogleStep() {
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = false;
    el.masterStep.hidden = true;
  }

  function showMasterStep() {
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = true;
    el.masterStep.hidden = false;
    setTimeout(() => el.masterPassword.focus(), 80);
  }

  function configureMasterStep(mode) {
    state.accessMode = mode;
    state.failedAttempts = 0;
    el.masterPassword.value = '';
    el.masterConfirm.value = '';
    el.masterError.textContent = '';
    el.masterPassword.type = 'password';
    el.masterConfirm.type = 'password';

    if (mode === 'create') {
      el.masterTitle.textContent = 'Criar senha mestra';
      el.masterSubtitle.textContent = 'Use uma frase longa e exclusiva. Ela será a senha dos arquivos cifrados no Drive e não poderá ser recuperada.';
      el.masterConfirmGroup.hidden = false;
      el.masterStrengthWrap.hidden = false;
      el.masterSubmit.textContent = 'Criar cofre Keyron';
      el.backGoogle.textContent = 'Trocar conta Google';
    } else if (mode === 'import') {
      el.masterTitle.textContent = 'Verificar backup';
      el.masterSubtitle.textContent = 'Digite a senha mestra do arquivo importado antes de substituir o cofre atual.';
      el.masterConfirmGroup.hidden = true;
      el.masterStrengthWrap.hidden = true;
      el.masterSubmit.textContent = 'Verificar e importar';
      el.backGoogle.textContent = 'Cancelar importação';
    } else {
      el.masterTitle.textContent = 'Desbloquear cofre';
      el.masterSubtitle.textContent = 'Digite sua senha mestra. Ela não é enviada ao Google e não é salva pelo Keyron.';
      el.masterConfirmGroup.hidden = true;
      el.masterStrengthWrap.hidden = true;
      el.masterSubmit.textContent = 'Abrir cofre';
      el.backGoogle.textContent = 'Trocar conta Google';
    }
  }

  function updateMasterStrength() {
    const score = KeyronGenerator.strength(el.masterPassword.value);
    el.masterStrengthBar.style.width = `${score}%`;
    el.masterStrengthBar.dataset.level = score >= 72 ? 'strong' : score >= 44 ? 'medium' : 'weak';
    el.masterStrengthLabel.textContent = score >= 72 ? 'Boa força. Guarde esta frase em um lugar seguro.' : score >= 44 ? 'Razoável, mas uma frase mais longa será melhor.' : 'Use pelo menos 12 caracteres, de preferência uma frase longa.';
  }

  async function handleMasterSubmit(event) {
    event.preventDefault();
    const password = el.masterPassword.value;
    if (!password) return;

    if (state.accessMode === 'create') {
      if (password.length < 12) {
        el.masterError.textContent = 'A senha mestra precisa ter pelo menos 12 caracteres.';
        return;
      }
      if (KeyronGenerator.strength(password) < 44) {
        el.masterError.textContent = 'Essa senha ainda está fraca. Use uma frase maior e mais difícil de adivinhar.';
        return;
      }
      if (password !== el.masterConfirm.value) {
        el.masterError.textContent = 'As duas senhas não são iguais.';
        return;
      }
      await createVault(password);
      return;
    }

    if (state.accessMode === 'import') {
      await verifyAndCommitImport(password);
      return;
    }

    await unlockVault(password);
  }

  async function createVault(password) {
    setBusy(true, 'Criando o cofre…', 'Derivando uma chave forte e cifrando a estrutura inicial.');
    try {
      state.vault = KeyronVault.emptyVault();
      const created = await KeyronCrypto.createBundle(password, state.vault);
      state.key = created.key;
      state.bundle = created.bundle;
      await KeyronStorage.saveCurrent(state.bundle);
      setSyncStatus('syncing');
      await KeyronDrive.saveBundle(state.bundle, { automaticSnapshot: false });
      setSyncStatus('synced');
      openApplication();
      toast('Cofre Keyron criado e cifrado no seu Drive.', 'success');
    } catch (error) {
      console.error(error);
      state.key = null;
      state.vault = null;
      el.masterError.textContent = 'Não foi possível criar o cofre. Confira o acesso ao Drive e tente novamente.';
      setSyncStatus('error');
    } finally {
      el.masterPassword.value = '';
      el.masterConfirm.value = '';
      setBusy(false);
    }
  }

  async function unlockVault(password) {
    const delay = state.failedAttempts >= 3 ? Math.min(30000, 1000 * (2 ** (state.failedAttempts - 3))) : 0;
    if (delay) {
      el.masterSubmit.disabled = true;
      el.masterError.textContent = `Muitas tentativas. Aguarde ${Math.ceil(delay / 1000)} segundo(s).`;
      await new Promise((resolve) => setTimeout(resolve, delay));
      el.masterSubmit.disabled = false;
    }

    setBusy(true, 'Abrindo o cofre…', 'A chave está sendo derivada localmente neste dispositivo.');
    try {
      const rawBundle = state.bundle;
      const result = await KeyronCrypto.unlockBundle(password, rawBundle);
      const normalized = KeyronVault.normalize(result.vault);
      const needsMigration = result.legacy || Number(result.vault?.version || 1) < 2 || result.iterations < KeyronCrypto.CURRENT_ITERATIONS;

      if (needsMigration) {
        const migrated = await KeyronCrypto.rekeyBundle(password, normalized, normalized.id);
        state.key = migrated.key;
        state.bundle = migrated.bundle;
        state.vault = normalized;
        await KeyronStorage.saveCurrent(state.bundle);
        state.needsInitialPush = true;
        toast('Cofre antigo migrado para a estrutura Keyron sem perder credenciais.', 'success', 5000);
      } else {
        state.key = result.key;
        state.vault = normalized;
      }

      state.failedAttempts = 0;
      el.masterError.textContent = '';
      openApplication();
      if (state.needsInitialPush) scheduleDriveSync(50);
    } catch (error) {
      console.error(error);
      state.failedAttempts += 1;
      state.key = null;
      state.vault = null;
      el.masterError.textContent = error.message === 'UNSUPPORTED_FORMAT' ? 'Este arquivo usa uma versão de cofre ainda não suportada.' : 'Senha mestra incorreta ou arquivo de cofre inválido.';
    } finally {
      el.masterPassword.value = '';
      setBusy(false);
    }
  }

  function openApplication() {
    el.accessShell.hidden = true;
    el.appScreen.hidden = false;
    renderAll();
    resetAutoLockTimer();
    setSyncStatus(KeyronDrive.isConnected() ? 'synced' : 'offline');
    setTimeout(() => el.search.focus(), 100);
  }

  function lockVault({ signOut = false } = {}) {
    clearTimeout(state.autoLockTimer);
    clearTimeout(state.clipboardTimer);
    closeAllDialogs();
    state.key = null;
    state.vault = null;
    state.editingEntryId = null;
    state.editingColumnId = null;
    state.pendingLogo = null;
    el.board.replaceChildren();
    el.search.value = '';

    if (signOut) {
      KeyronDrive.disconnect();
      state.googleVerified = false;
      showGoogleStep();
      el.googleState.textContent = 'Aguardando verificação do Google.';
    } else if (state.googleVerified && KeyronDrive.isConnected()) {
      configureMasterStep('unlock');
      showMasterStep();
    } else {
      showGoogleStep();
    }
  }

  function resetAutoLockTimer() {
    clearTimeout(state.autoLockTimer);
    if (!state.key || !state.vault) return;
    const minutes = Math.max(1, Number(state.vault.preferences?.autoLockMinutes || 5));
    state.autoLockTimer = setTimeout(() => {
      lockVault();
      toast('O Keyron foi bloqueado por inatividade.', 'info');
    }, minutes * 60 * 1000);
  }

  async function persistVault({ render = true } = {}) {
    if (!state.key || !state.vault || !state.bundle) throw new Error('VAULT_LOCKED');
    const snapshot = structuredClone(state.vault);
    state.persistQueue = state.persistQueue.then(async () => {
      state.bundle = await KeyronCrypto.updateBundle(state.key, state.bundle, snapshot);
      await KeyronStorage.saveCurrent(state.bundle);
      state.needsInitialPush = true;
      scheduleDriveSync();
    });
    await state.persistQueue;
    if (render) renderAll();
  }

  function scheduleDriveSync(delay = 420) {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(syncToDrive, delay);
  }

  async function reconnectOrSyncDrive() {
    if (KeyronDrive.isConnected()) {
      await syncToDrive();
      return;
    }
    if (!configured()) {
      toast('Configure o Google OAuth antes de sincronizar.', 'error');
      return;
    }

    setSyncStatus('syncing', 'Reconectando');
    try {
      await waitForGoogleLibrary();
      KeyronDrive.init(
        KeyronConfig.GOOGLE_CLIENT_ID,
        async () => {
          try {
            state.googleVerified = true;
            const remote = await KeyronDrive.loadBundle();
            if (remote?.bundle && parseTime(remote.bundle) > parseTime(state.bundle)) {
              await KeyronStorage.saveRecovery(state.bundle).catch(() => null);
              state.bundle = remote.bundle;
              await KeyronStorage.saveCurrent(state.bundle);
              state.key = null;
              state.vault = null;
              configureMasterStep('unlock');
              showMasterStep();
              toast('O Drive tinha uma versão mais recente. Ela foi preservada e precisa ser desbloqueada novamente.', 'warning', 6000);
              return;
            }
            await syncToDrive();
            toast('Google Drive reconectado.', 'success');
          } catch (error) {
            console.error(error);
            setSyncStatus('error');
            toast('O Drive foi reconectado, mas não foi possível comparar o cofre remoto.', 'error');
          }
        },
        (message) => {
          setSyncStatus('error');
          toast(`Não foi possível reconectar ao Google: ${message}`, 'error');
        }
      );
      KeyronDrive.connect(false);
    } catch (error) {
      console.error(error);
      setSyncStatus('error');
      toast('A reconexão com o Google não pôde ser iniciada.', 'error');
    }
  }

  async function syncToDrive() {
    if (!state.bundle || !state.googleVerified || !KeyronDrive.isConnected()) {
      setSyncStatus('offline');
      return;
    }
    if (state.syncInFlight) {
      state.syncRequested = true;
      return;
    }

    state.syncInFlight = true;
    const target = state.bundle;
    setSyncStatus('syncing');
    try {
      await KeyronDrive.saveBundle(target);
      if (state.bundle === target) {
        state.needsInitialPush = false;
        setSyncStatus('synced');
      } else {
        state.syncRequested = true;
      }
    } catch (error) {
      console.error(error);
      setSyncStatus('error');
      toast('O cofre ficou salvo e cifrado neste dispositivo, mas o Drive não confirmou a sincronização.', 'error', 5000);
    } finally {
      state.syncInFlight = false;
      if (state.syncRequested) {
        state.syncRequested = false;
        scheduleDriveSync(100);
      }
    }
  }

  function renderAll() {
    if (!state.vault) return;
    renderSummary();
    renderFilters();
    renderBoard();
    renderSettings();
  }

  function renderSummary() {
    const entryCount = state.vault.entries.length;
    const columnCount = state.vault.columns.length;
    el.vaultSummary.textContent = `${entryCount} ${entryCount === 1 ? 'credencial' : 'credenciais'} em ${columnCount} ${columnCount === 1 ? 'gaveta' : 'gavetas'}`;
  }

  function renderFilters() {
    el.filterStrip.replaceChildren();
    const all = document.createElement('button');
    all.className = `filter-chip${state.activeCategoryId ? '' : ' is-active'}`;
    all.type = 'button';
    all.dataset.categoryId = '';
    all.textContent = `Todas (${state.vault.entries.length})`;
    el.filterStrip.appendChild(all);

    for (const category of state.vault.categories) {
      const count = state.vault.entries.filter((entry) => entry.categoryId === category.id).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip${state.activeCategoryId === category.id ? ' is-active' : ''}`;
      button.dataset.categoryId = category.id;
      const dot = document.createElement('i');
      dot.style.setProperty('--chip-color', category.color);
      button.append(dot, document.createTextNode(`${category.name} (${count})`));
      el.filterStrip.appendChild(button);
    }
  }

  function renderBoard() {
    el.board.replaceChildren();
    const hasEntries = state.vault.entries.length > 0;
    el.emptyVault.hidden = hasEntries;
    el.board.hidden = false;

    const categories = new Map(state.vault.categories.map((category) => [category.id, category]));
    const query = el.search.value;

    for (const column of state.vault.columns) {
      const allColumnEntries = state.vault.entries.filter((entry) => entry.columnId === column.id);
      const visibleEntries = allColumnEntries.filter((entry) => KeyronVault.matches(entry, query, state.activeCategoryId, categories));
      const section = document.createElement('section');
      section.className = 'vault-column';
      section.dataset.columnId = column.id;

      const head = document.createElement('div');
      head.className = 'column-head';
      const icon = document.createElement('span');
      icon.className = 'column-icon';
      icon.textContent = column.icon;
      const title = document.createElement('div');
      title.className = 'column-title';
      const strong = document.createElement('strong');
      strong.textContent = column.name;
      const count = document.createElement('span');
      count.textContent = `${allColumnEntries.length} ${allColumnEntries.length === 1 ? 'acesso' : 'acessos'}`;
      title.append(strong, count);

      const actions = document.createElement('div');
      actions.className = 'column-actions';
      actions.append(
        columnAction('←', 'column-left', 'Mover gaveta para a esquerda'),
        columnAction('→', 'column-right', 'Mover gaveta para a direita'),
        columnAction('✎', 'column-edit', 'Editar gaveta'),
        columnAction('×', 'column-delete', 'Excluir gaveta')
      );
      head.append(icon, title, actions);

      const body = document.createElement('div');
      body.className = 'column-body';
      body.dataset.dropColumnId = column.id;
      if (!visibleEntries.length) {
        const empty = document.createElement('div');
        empty.className = 'column-empty';
        empty.textContent = query || state.activeCategoryId ? 'Nenhuma credencial neste filtro.' : 'Arraste uma credencial para esta gaveta.';
        body.appendChild(empty);
      } else {
        visibleEntries
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .forEach((entry) => body.appendChild(createCredentialCard(entry, categories.get(entry.categoryId))));
      }

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'column-add';
      add.dataset.action = 'entry-add-column';
      add.textContent = '+ Adicionar nesta gaveta';
      section.append(head, body, add);
      el.board.appendChild(section);
    }
  }

  function columnAction(label, action, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = title;
    button.textContent = label;
    return button;
  }

  function createCredentialCard(entry, category) {
    const card = document.createElement('article');
    card.className = 'credential-card';
    card.dataset.entryId = entry.id;
    card.draggable = true;

    const main = document.createElement('div');
    main.className = 'card-main';
    const logo = document.createElement('div');
    logo.className = 'card-logo';
    if (entry.logo?.dataUrl) {
      const img = document.createElement('img');
      img.src = entry.logo.dataUrl;
      img.alt = '';
      logo.appendChild(img);
    } else {
      logo.textContent = (entry.name || 'K').slice(0, 1).toLocaleUpperCase('pt-BR');
    }

    const copy = document.createElement('div');
    copy.className = 'card-copy';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const user = document.createElement('span');
    user.textContent = entry.username || entry.email || 'Sem usuário informado';
    copy.append(name, user);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'card-edit';
    edit.dataset.action = 'entry-edit';
    edit.title = 'Editar credencial';
    edit.textContent = '✎';
    main.append(logo, copy, edit);

    const bottom = document.createElement('div');
    bottom.className = 'card-bottom';
    if (category) {
      const badge = document.createElement('span');
      badge.className = 'category-badge';
      badge.style.setProperty('--badge-color', category.color);
      badge.textContent = category.name;
      bottom.appendChild(badge);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (entry.username || entry.email) actions.appendChild(cardAction('Usuário', 'copy-user'));
    actions.appendChild(cardAction('Senha', 'copy-password'));
    if (entry.url) actions.appendChild(cardAction('Abrir', 'open-url'));
    bottom.appendChild(actions);
    card.append(main, bottom);
    return card;
  }

  function cardAction(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  function openEntryDialog(entryId = null, preferredColumnId = null) {
    const entry = entryId ? state.vault.entries.find((item) => item.id === entryId) : null;
    state.editingEntryId = entry?.id || null;
    state.pendingLogo = entry?.logo ? structuredClone(entry.logo) : null;
    el.entryDialogTitle.textContent = entry ? 'Editar credencial' : 'Nova credencial';
    el.deleteEntry.hidden = !entry;
    el.entryForm.reset();
    fillEntrySelects(entry?.columnId || preferredColumnId, entry?.categoryId || '');
    el.fName.value = entry?.name || '';
    el.fUsername.value = entry?.username || '';
    el.fEmail.value = entry?.email || '';
    el.fPassword.value = entry?.password || '';
    el.fUrl.value = entry?.url || '';
    el.fSecret.value = entry?.secret || '';
    el.fNotes.value = entry?.notes || '';
    el.fPassword.type = 'password';
    updatePasswordStrength();
    renderLogoPreview();
    el.entryDialog.showModal();
    setTimeout(() => el.fName.focus(), 60);
  }

  function fillEntrySelects(selectedColumnId, selectedCategoryId) {
    el.fColumn.replaceChildren();
    for (const column of state.vault.columns) {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = `${column.icon} ${column.name}`;
      option.selected = column.id === selectedColumnId;
      el.fColumn.appendChild(option);
    }

    el.fCategory.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Sem categoria';
    el.fCategory.appendChild(none);
    for (const category of state.vault.categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      option.selected = category.id === selectedCategoryId;
      el.fCategory.appendChild(option);
    }
  }

  function renderLogoPreview() {
    el.logoPreview.replaceChildren();
    if (state.pendingLogo?.dataUrl) {
      const img = document.createElement('img');
      img.src = state.pendingLogo.dataUrl;
      img.alt = '';
      el.logoPreview.appendChild(img);
      el.removeLogo.hidden = false;
    } else {
      const span = document.createElement('span');
      span.textContent = (el.fName.value || 'K').slice(0, 1).toLocaleUpperCase('pt-BR');
      el.logoPreview.appendChild(span);
      el.removeLogo.hidden = true;
    }
  }

  async function handleEntrySubmit(event) {
    event.preventDefault();
    const name = el.fName.value.trim();
    if (!name) {
      toast('Informe o nome da credencial.', 'error');
      el.fName.focus();
      return;
    }

    let url = '';
    try { url = normalizeUrl(el.fUrl.value); } catch {
      toast('Use um endereço válido começando com http:// ou https://.', 'error');
      el.fUrl.focus();
      return;
    }

    const data = {
      name,
      columnId: el.fColumn.value,
      categoryId: el.fCategory.value || null,
      username: el.fUsername.value,
      email: el.fEmail.value,
      password: el.fPassword.value,
      url,
      secret: el.fSecret.value,
      notes: el.fNotes.value,
      logo: state.pendingLogo
    };

    try {
      if (state.editingEntryId) KeyronVault.updateEntry(state.vault, state.editingEntryId, data);
      else KeyronVault.addEntry(state.vault, data);
      el.entryDialog.close();
      await persistVault();
      toast(state.editingEntryId ? 'Credencial atualizada.' : 'Credencial adicionada.', 'success');
    } catch (error) {
      console.error(error);
      toast('Não foi possível salvar a credencial.', 'error');
    }
  }

  async function deleteCurrentEntry() {
    if (!state.editingEntryId) return;
    const entry = state.vault.entries.find((item) => item.id === state.editingEntryId);
    if (!entry || !confirm(`Excluir definitivamente “${entry.name}”?`)) return;
    KeyronVault.deleteEntry(state.vault, entry.id);
    el.entryDialog.close();
    await persistVault();
    toast('Credencial excluída.', 'success');
  }

  function openColumnDialog(columnId = null) {
    const column = columnId ? state.vault.columns.find((item) => item.id === columnId) : null;
    state.editingColumnId = column?.id || null;
    el.columnDialogTitle.textContent = column ? 'Editar gaveta' : 'Nova gaveta';
    el.columnName.value = column?.name || '';
    el.columnIcon.value = column?.icon || '◈';
    el.columnDialog.showModal();
    setTimeout(() => el.columnName.focus(), 60);
  }

  async function handleColumnSubmit(event) {
    event.preventDefault();
    try {
      if (state.editingColumnId) KeyronVault.updateColumn(state.vault, state.editingColumnId, el.columnName.value, el.columnIcon.value);
      else KeyronVault.addColumn(state.vault, el.columnName.value, el.columnIcon.value);
      el.columnDialog.close();
      await persistVault();
      toast('Gaveta salva.', 'success');
    } catch (error) {
      const messages = { COLUMN_DUPLICATE: 'Já existe uma gaveta com esse nome.', COLUMN_NAME_REQUIRED: 'Informe o nome da gaveta.' };
      toast(messages[error.message] || 'Não foi possível salvar a gaveta.', 'error');
    }
  }

  async function handleColumnAction(columnId, action) {
    const column = state.vault.columns.find((item) => item.id === columnId);
    if (!column) return;
    try {
      if (action === 'column-edit') return openColumnDialog(columnId);
      if (action === 'column-left') KeyronVault.moveColumn(state.vault, columnId, -1);
      if (action === 'column-right') KeyronVault.moveColumn(state.vault, columnId, 1);
      if (action === 'column-delete') {
        if (!confirm(`Excluir a gaveta “${column.name}”? Ela precisa estar vazia.`)) return;
        KeyronVault.deleteColumn(state.vault, columnId);
      }
      await persistVault();
    } catch (error) {
      const messages = { COLUMN_NOT_EMPTY: 'Mova as credenciais para outra gaveta antes de excluir.', LAST_COLUMN: 'O cofre precisa ter pelo menos uma gaveta.' };
      toast(messages[error.message] || 'Não foi possível alterar a gaveta.', 'error');
    }
  }

  function renderCategoryDialog() {
    el.categoryList.replaceChildren();
    for (const category of state.vault.categories) {
      const row = document.createElement('div');
      row.className = 'category-row';
      row.style.setProperty('--category-color', category.color);
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = category.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.categoryId = category.id;
      remove.textContent = 'Excluir';
      row.append(dot, name, remove);
      el.categoryList.appendChild(row);
    }
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    try {
      const category = KeyronVault.addCategory(state.vault, el.categoryName.value, el.categoryColor.value);
      el.categoryName.value = '';
      await persistVault({ render: false });
      renderAll();
      renderCategoryDialog();
      if (el.entryDialog.open) {
        fillEntrySelects(el.fColumn.value, category.id);
        el.fCategory.value = category.id;
      }
      toast('Categoria adicionada.', 'success');
    } catch (error) {
      toast(error.message === 'CATEGORY_DUPLICATE' ? 'Já existe uma categoria com esse nome.' : 'Informe um nome para a categoria.', 'error');
    }
  }

  async function deleteCategory(categoryId) {
    const category = state.vault.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const used = state.vault.entries.filter((entry) => entry.categoryId === categoryId).length;
    const text = used ? `A categoria “${category.name}” está em ${used} credencial(is). Elas ficarão sem categoria. Continuar?` : `Excluir a categoria “${category.name}”?`;
    if (!confirm(text)) return;
    KeyronVault.deleteCategory(state.vault, categoryId);
    if (state.activeCategoryId === categoryId) state.activeCategoryId = '';
    await persistVault({ render: false });
    renderAll();
    renderCategoryDialog();
  }

  function renderSettings() {
    if (!state.vault || !state.bundle) return;
    el.autoLock.value = String(state.vault.preferences?.autoLockMinutes || 5);
    el.clipboard.value = String(state.vault.preferences?.clipboardClearSeconds || 20);
    const bytes = new Blob([JSON.stringify(state.bundle)]).size;
    el.storageInfo.textContent = `Cofre cifrado neste dispositivo: ${formatBytes(bytes)}`;
  }

  async function savePreferences() {
    state.vault.preferences = {
      ...state.vault.preferences,
      autoLockMinutes: Number(el.autoLock.value),
      clipboardClearSeconds: Number(el.clipboard.value)
    };
    await persistVault({ render: false });
    resetAutoLockTimer();
    renderSettings();
  }

  function exportBundle() {
    if (!state.bundle) return;
    const blob = new Blob([JSON.stringify(state.bundle, null, 2)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keyron-backup-${new Date().toISOString().slice(0, 10)}.keyron`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup cifrado exportado.', 'success');
  }

  async function prepareImport(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const candidate = JSON.parse(text);
      if (!KeyronCrypto.looksLikeEncryptedBundle(candidate)) throw new Error('INVALID_BUNDLE');
      if (!confirm('O Keyron vai verificar a senha deste backup antes de substituir o cofre atual. Continuar?')) return;
      state.pendingImportBundle = candidate;
      state.preImportBundle = state.bundle;
      closeAllDialogs();
      state.key = null;
      state.vault = null;
      configureMasterStep('import');
      showMasterStep();
    } catch (error) {
      console.error(error);
      toast('O arquivo selecionado não é um backup cifrado válido do Keyron.', 'error');
    } finally {
      el.importInput.value = '';
    }
  }

  async function verifyAndCommitImport(password) {
    setBusy(true, 'Verificando o backup…', 'Nada será substituído antes da senha ser confirmada.');
    try {
      const result = await KeyronCrypto.unlockBundle(password, state.pendingImportBundle);
      let vault = KeyronVault.normalize(result.vault);
      let bundle = state.pendingImportBundle;
      let key = result.key;
      if (result.legacy || Number(result.vault?.version || 1) < 2 || result.iterations < KeyronCrypto.CURRENT_ITERATIONS) {
        const migrated = await KeyronCrypto.rekeyBundle(password, vault, vault.id);
        bundle = migrated.bundle;
        key = migrated.key;
      }

      await KeyronStorage.saveRecovery(state.preImportBundle).catch(() => null);
      if (KeyronDrive.isConnected() && state.preImportBundle) await KeyronDrive.createSnapshot(state.preImportBundle).catch(() => null);
      state.bundle = bundle;
      state.key = key;
      state.vault = vault;
      state.pendingImportBundle = null;
      state.preImportBundle = null;
      await KeyronStorage.saveCurrent(bundle);
      await KeyronDrive.saveBundle(bundle, { automaticSnapshot: false });
      openApplication();
      toast('Backup verificado e importado com sucesso.', 'success', 5000);
    } catch (error) {
      console.error(error);
      el.masterError.textContent = 'A senha não abriu este backup. O cofre atual não foi substituído.';
    } finally {
      el.masterPassword.value = '';
      setBusy(false);
    }
  }

  async function createDriveSnapshot() {
    if (!state.bundle || !KeyronDrive.isConnected()) {
      toast('Conecte-se ao Google Drive para criar um snapshot.', 'error');
      return;
    }
    setBusy(true, 'Criando snapshot…', 'O backup enviado já está cifrado.');
    try {
      await KeyronDrive.createSnapshot(state.bundle);
      toast('Snapshot cifrado criado na pasta Backups.', 'success');
    } catch (error) {
      console.error(error);
      toast('Não foi possível criar o snapshot no Drive.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(value, label) {
    if (!value) {
      toast(`${label} não informado.`, 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copiado.`, 'success');
      clearTimeout(state.clipboardTimer);
      const seconds = Math.max(5, Number(state.vault.preferences?.clipboardClearSeconds || 20));
      state.clipboardTimer = setTimeout(async () => {
        try {
          if (!document.hasFocus()) return;
          const current = await navigator.clipboard.readText();
          if (current === value) await navigator.clipboard.writeText('');
        } catch { /* O navegador pode negar leitura da área de transferência. */ }
      }, seconds * 1000);
    } catch {
      toast('O navegador bloqueou o acesso à área de transferência.', 'error');
    }
  }

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('INVALID_PROTOCOL');
    return parsed.toString();
  }

  function openEntryUrl(value) {
    try {
      const url = normalizeUrl(value);
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast('O endereço salvo não é válido.', 'error');
    }
  }

  function updatePasswordStrength() {
    const score = KeyronGenerator.strength(el.fPassword.value);
    el.passwordStrength.style.width = `${score}%`;
    el.passwordStrength.dataset.level = score >= 72 ? 'strong' : score >= 44 ? 'medium' : 'weak';
  }

  async function processLogoFile(file) {
    if (!file) return null;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) throw new Error('UNSUPPORTED_IMAGE');
    if (file.size > Number(KeyronConfig.MAX_LOGO_BYTES || 4194304)) throw new Error('IMAGE_TOO_LARGE');

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await image.decode();
      const max = 512;
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);
      let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
      if (!blob) blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('IMAGE_PROCESS_FAILED');
      const dataUrl = await blobToDataUrl(blob);
      return { dataUrl, type: blob.type, name: file.name.slice(0, 120), bytes: blob.size };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
  }

  function closeAllDialogs() {
    $$('dialog[open]').forEach((dialog) => dialog.close());
  }

  async function handleBoardClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const column = button.closest('.vault-column');
    const card = button.closest('.credential-card');
    const action = button.dataset.action;

    if (action.startsWith('column-')) return handleColumnAction(column?.dataset.columnId, action);
    if (action === 'entry-add-column') return openEntryDialog(null, column?.dataset.columnId);

    const entry = card ? state.vault.entries.find((item) => item.id === card.dataset.entryId) : null;
    if (!entry) return;
    if (action === 'entry-edit') openEntryDialog(entry.id);
    if (action === 'copy-user') copyValue(entry.username || entry.email, 'Usuário');
    if (action === 'copy-password') copyValue(entry.password, 'Senha');
    if (action === 'open-url') openEntryUrl(entry.url);
  }

  function bindEvents() {
    el.googleBtn.addEventListener('click', () => startGoogleVerification(false));
    el.masterForm.addEventListener('submit', handleMasterSubmit);
    el.masterPassword.addEventListener('input', updateMasterStrength);
    el.toggleMaster.addEventListener('click', () => { el.masterPassword.type = el.masterPassword.type === 'password' ? 'text' : 'password'; });
    el.backGoogle.addEventListener('click', () => {
      if (state.accessMode === 'import') {
        state.pendingImportBundle = null;
        state.bundle = state.preImportBundle;
        state.preImportBundle = null;
        configureMasterStep('unlock');
        showMasterStep();
        return;
      }
      KeyronDrive.disconnect();
      state.googleVerified = false;
      showGoogleStep();
    });

    el.addEntry.addEventListener('click', () => openEntryDialog());
    el.emptyAdd.addEventListener('click', () => openEntryDialog());
    el.addColumn.addEventListener('click', () => openColumnDialog());
    el.manageCategories.addEventListener('click', () => { renderCategoryDialog(); el.categoryDialog.showModal(); });
    el.settingsBtn.addEventListener('click', () => { renderSettings(); el.settingsDialog.showModal(); });
    el.syncChip.addEventListener('click', reconnectOrSyncDrive);
    el.lockBtn.addEventListener('click', () => lockVault());
    el.search.addEventListener('input', renderBoard);
    el.filterStrip.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-category-id]');
      if (!button) return;
      state.activeCategoryId = button.dataset.categoryId;
      renderFilters();
      renderBoard();
    });

    el.board.addEventListener('click', handleBoardClick);
    el.board.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.credential-card');
      if (!card) return;
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-keyron-entry', card.dataset.entryId);
      event.dataTransfer.setData('text/plain', card.dataset.entryId);
    });
    el.board.addEventListener('dragend', (event) => {
      event.target.closest('.credential-card')?.classList.remove('is-dragging');
      $$('.vault-column.is-dragover').forEach((node) => node.classList.remove('is-dragover'));
    });
    el.board.addEventListener('dragover', (event) => {
      const column = event.target.closest('.vault-column');
      if (!column) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      $$('.vault-column.is-dragover').forEach((node) => { if (node !== column) node.classList.remove('is-dragover'); });
      column.classList.add('is-dragover');
    });
    el.board.addEventListener('dragleave', (event) => {
      const column = event.target.closest('.vault-column');
      if (column && !column.contains(event.relatedTarget)) column.classList.remove('is-dragover');
    });
    el.board.addEventListener('drop', async (event) => {
      const column = event.target.closest('.vault-column');
      if (!column) return;
      event.preventDefault();
      column.classList.remove('is-dragover');
      const entryId = event.dataTransfer.getData('application/x-keyron-entry') || event.dataTransfer.getData('text/plain');
      const entry = state.vault.entries.find((item) => item.id === entryId);
      if (!entry || entry.columnId === column.dataset.columnId) return;
      KeyronVault.moveEntry(state.vault, entryId, column.dataset.columnId);
      await persistVault();
      toast(`“${entry.name}” foi movida para outra gaveta.`, 'success');
    });

    el.entryForm.addEventListener('submit', handleEntrySubmit);
    el.deleteEntry.addEventListener('click', deleteCurrentEntry);
    el.fName.addEventListener('input', () => { if (!state.pendingLogo) renderLogoPreview(); });
    el.fPassword.addEventListener('input', updatePasswordStrength);
    el.togglePassword.addEventListener('click', () => { el.fPassword.type = el.fPassword.type === 'password' ? 'text' : 'password'; });
    el.generatePassword.addEventListener('click', () => {
      el.fPassword.value = KeyronGenerator.generate(24);
      el.fPassword.type = 'text';
      updatePasswordStrength();
    });
    el.logoInput.addEventListener('change', async () => {
      const file = el.logoInput.files?.[0];
      if (!file) return;
      setBusy(true, 'Preparando a logo…', 'A imagem será reduzida antes de entrar no cofre cifrado.');
      try {
        state.pendingLogo = await processLogoFile(file);
        renderLogoPreview();
        toast(`Logo preparada com ${formatBytes(state.pendingLogo.bytes)}.`, 'success');
      } catch (error) {
        const message = error.message === 'IMAGE_TOO_LARGE' ? 'A imagem pode ter no máximo 4 MB.' : 'Use uma imagem PNG, JPG ou WebP válida.';
        toast(message, 'error');
      } finally {
        el.logoInput.value = '';
        setBusy(false);
      }
    });
    el.removeLogo.addEventListener('click', () => { state.pendingLogo = null; renderLogoPreview(); });
    el.quickCategory.addEventListener('click', () => { renderCategoryDialog(); el.categoryDialog.showModal(); });

    el.columnForm.addEventListener('submit', handleColumnSubmit);
    el.categoryForm.addEventListener('submit', handleCategorySubmit);
    el.categoryList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-category-id]');
      if (button) deleteCategory(button.dataset.categoryId);
    });

    el.autoLock.addEventListener('change', savePreferences);
    el.clipboard.addEventListener('change', savePreferences);
    el.exportBtn.addEventListener('click', exportBundle);
    el.importBtn.addEventListener('click', () => el.importInput.click());
    el.importInput.addEventListener('change', () => prepareImport(el.importInput.files?.[0]));
    el.backupNow.addEventListener('click', createDriveSnapshot);
    el.signout.addEventListener('click', () => lockVault({ signOut: true }));

    $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close()));

    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
      document.addEventListener(eventName, () => { if (state.key) resetAutoLockTimer(); }, { passive: true });
    });

    document.addEventListener('keydown', (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (event.key === '/' && !typing && !el.appScreen.hidden) {
        event.preventDefault();
        el.search.focus();
      }
      if (event.key === 'Escape' && !el.appScreen.hidden) closeAllDialogs();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.needsInitialPush) syncToDrive();
    });
  }

  async function init() {
    bindEvents();
    state.bundle = await KeyronStorage.loadCurrent();
    showGoogleStep();
    if (!configured()) el.googleState.textContent = 'Google OAuth não configurado. Abra CONFIGURACAO.md.';

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch((error) => console.warn('Service Worker:', error));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      console.error(error);
      toast('O Keyron não conseguiu iniciar neste navegador.', 'error', 6000);
    });
  });
})();
