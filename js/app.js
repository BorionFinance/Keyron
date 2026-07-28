(() => {
  'use strict';

  const state = {
    bundle: null,
    key: null,
    vault: null,
    googleVerified: false,
    googleUser: null,
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
    syncRetryTimer: null,
    syncRetryCount: 0,
    lastRemoteRevision: 0,
    otherTabWarningAt: 0,
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
    biometricUnlockBtn: $('#biometric-unlock-btn'),
    biometricDivider: $('#biometric-divider'),
    backGoogle: $('#back-google-btn'),
    appScreen: $('#app-screen'),
    search: $('#search-input'),
    syncChip: $('#sync-chip'),
    vaultSummary: $('#vault-summary'),
    vaultLastActivity: $('#vault-last-activity'),
    filterStrip: $('#filter-strip'),
    board: $('#vault-board'),
    emptyVault: $('#empty-vault'),
    addEntry: $('#add-entry-btn'),
    emptyAdd: $('#empty-add-btn'),
    addColumn: $('#add-column-btn'),
    collapseAll: $('#collapse-all-btn'),
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
    activityList: $('#activity-list'),
    activityEmpty: $('#activity-empty'),
    biometricSection: $('#biometric-section'),
    biometricEnableRow: $('#biometric-enable-row'),
    biometricEnableError: $('#biometric-enable-error'),
    biometricConfirmPassword: $('#biometric-confirm-password'),
    biometricEnableBtn: $('#biometric-enable-btn'),
    biometricActiveRow: $('#biometric-active-row'),
    biometricDisableBtn: $('#biometric-disable-btn'),
    autoLock: $('#setting-auto-lock'),
    clipboard: $('#setting-clipboard'),
    exportBtn: $('#export-btn'),
    importBtn: $('#import-btn'),
    importInput: $('#import-input'),
    backupNow: $('#backup-now-btn'),
    signout: $('#signout-btn'),
    storageInfo: $('#storage-info'),
    confirmDialog: $('#confirm-dialog'),
    confirmKicker: $('#confirm-kicker'),
    confirmTitle: $('#confirm-title'),
    confirmMessage: $('#confirm-message'),
    confirmCancel: $('#confirm-cancel'),
    confirmOk: $('#confirm-ok')
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

  const EYE_ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_ICON_CLOSED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.27 21.27 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.27 21.27 0 0 1-3.22 4.53M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function setPasswordVisibility(input, button, visible) {
    input.type = visible ? 'text' : 'password';
    const icon = button.querySelector('.eye-icon');
    if (icon) icon.innerHTML = visible ? EYE_ICON_CLOSED : EYE_ICON_OPEN;
    button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    button.title = visible ? 'Ocultar senha' : 'Mostrar senha';
  }

  function togglePasswordVisibility(input, button) {
    setPasswordVisibility(input, button, input.type === 'password');
  }

  function setSyncStatus(status, label) {
    el.syncChip.className = `sync-chip sync-chip--${status}`;
    $('b', el.syncChip).textContent = label || ({ saving: 'Protegendo', pending: 'Salvo local', syncing: 'Sincronizando', synced: 'Sincronizado', offline: 'Somente local', error: 'Pendente' }[status] || status);
  }

  function askConfirm({ title = 'Confirmar ação', message = 'Deseja continuar?', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', kind = 'danger', kicker = 'CONFIRMAR AÇÃO' } = {}) {
    return new Promise((resolve) => {
      el.confirmKicker.textContent = kicker;
      el.confirmTitle.textContent = title;
      el.confirmMessage.textContent = message;
      el.confirmCancel.textContent = cancelLabel;
      el.confirmOk.textContent = confirmLabel;
      el.confirmOk.className = `btn ${kind === 'danger' ? 'btn--danger' : 'btn--primary'}`;

      const cleanup = (value) => {
        el.confirmCancel.removeEventListener('click', onCancel);
        el.confirmOk.removeEventListener('click', onOk);
        el.confirmDialog.removeEventListener('cancel', onCancel);
        el.confirmDialog.removeEventListener('close', onClose);
        if (el.confirmDialog.open) el.confirmDialog.close();
        resolve(value);
      };
      const onCancel = (event) => { if (event) event.preventDefault(); cleanup(false); };
      const onOk = (event) => { if (event) event.preventDefault(); cleanup(true); };
      const onClose = () => cleanup(false);

      el.confirmCancel.addEventListener('click', onCancel, { once: true });
      el.confirmOk.addEventListener('click', onOk, { once: true });
      el.confirmDialog.addEventListener('cancel', onCancel, { once: true });
      el.confirmDialog.addEventListener('close', onClose, { once: true });
      el.confirmDialog.showModal();
    });
  }

  function configured() {
    const clientId = String(KeyronConfig.GOOGLE_CLIENT_ID || '').trim();
    return /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId);
  }

  function googleErrorMessage(message) {
    const value = String(message || '').toLowerCase();
    if (value.includes('popup_closed') || value.includes('popup closed')) return 'A janela do Google foi fechada antes da confirmação.';
    if (value.includes('popup_failed_to_open') || value.includes('popup failed')) return 'O navegador bloqueou a janela do Google. Libere pop-ups para este site.';
    if (value.includes('access_denied')) return 'O acesso foi recusado pela conta Google.';
    if (value.includes('origin') || value.includes('redirect_uri_mismatch')) return `Este endereço ainda não está autorizado no Google Cloud: ${location.origin}`;
    if (value.includes('invalid_client')) return 'O Client ID do Google não foi aceito. Confira a credencial OAuth do tipo Aplicativo da Web.';
    return message || 'Falha na verificação do Google.';
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
          const friendly = googleErrorMessage(message);
          el.googleBtn.disabled = false;
          el.googleState.textContent = friendly;
          toast(friendly, 'error', 6500);
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

  async function onGoogleVerified(profile) {
    state.googleVerified = true;
    state.googleUser = profile || KeyronDrive.getCurrentUser?.() || null;
    el.googleBtn.disabled = false;
    const accountLabel = state.googleUser?.email ? `Google verificado: ${state.googleUser.email}.` : 'Google verificado.';
    el.googleState.textContent = `${accountLabel} Localizando seu cofre…`;
    setBusy(true, 'Verificando o seu Drive…', 'O Keyron está procurando apenas os arquivos que ele próprio criou.');

    try {
      state.remoteInfo = await KeyronDrive.loadBundle();
      state.bundle = await chooseBundle(state.remoteInfo);
      state.lastRemoteRevision = Number(state.remoteInfo?.bundle?.revision || 0);
      KeyronSaveEngine.initialize(state.bundle);
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
    document.body.dataset.screen = 'access';
    document.body.dataset.accessMode = 'google';
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = false;
    el.masterStep.hidden = true;
  }

  function showMasterStep() {
    document.body.dataset.screen = 'access';
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = true;
    el.masterStep.hidden = false;
    refreshBiometricUnlockUI();
    setTimeout(() => el.masterPassword.focus(), 80);
  }

  async function refreshBiometricUnlockUI() {
    const vaultId = state.bundle?.vaultId;
    const eligible = state.accessMode === 'unlock' && vaultId && (await KeyronBiometric.platformAvailable()) && (await KeyronBiometric.hasRecord(vaultId));
    el.biometricUnlockBtn.hidden = !eligible;
    el.biometricDivider.hidden = !eligible;
  }

  async function tryBiometricUnlock() {
    const vaultId = state.bundle?.vaultId;
    if (!vaultId) return;
    el.biometricUnlockBtn.disabled = true;
    try {
      const password = await KeyronBiometric.unlock(vaultId);
      await unlockVault(password);
    } catch (error) {
      const messages = {
        USER_CANCELLED: 'Verificação biométrica cancelada.',
        NO_RECORD: 'Biometria não ativada neste dispositivo.',
        ASSERTION_FAILED: 'Não foi possível confirmar a biometria. Digite sua senha mestra.',
        UNWRAP_FAILED: 'A biometria não confere mais. Digite sua senha mestra.'
      };
      toast(messages[error.message] || 'Não foi possível usar a biometria agora.', 'error', 4200);
    } finally {
      el.biometricUnlockBtn.disabled = false;
    }
  }

  function configureMasterStep(mode) {
    state.accessMode = mode;
    document.body.dataset.accessMode = mode;
    state.failedAttempts = 0;
    el.masterPassword.value = '';
    el.masterConfirm.value = '';
    el.masterError.textContent = '';
    setPasswordVisibility(el.masterPassword, el.toggleMaster, false);
    el.masterConfirm.type = 'password';
    el.masterPassword.placeholder = mode === 'unlock' ? 'Digite sua senha mestra' : '';

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
      el.masterSubtitle.textContent = 'Digite sua senha mestra';
      el.masterConfirmGroup.hidden = true;
      el.masterStrengthWrap.hidden = true;
      el.masterSubmit.textContent = 'Desbloquear';
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
      KeyronSaveEngine.initialize(state.bundle);
      state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'vault-create');
      state.needsInitialPush = true;

      openApplication();
      setSyncStatus(KeyronDrive.isConnected() ? 'syncing' : 'offline');
      try {
        await KeyronDrive.saveBundle(state.bundle, { automaticSnapshot: false });
        state.lastRemoteRevision = Number(state.bundle.revision || 0);
        await KeyronSaveEngine.confirmRemote(state.bundle);
        state.needsInitialPush = false;
        setSyncStatus('synced');
        toast('Cofre Keyron criado e cifrado no seu Drive.', 'success');
      } catch (driveError) {
        console.error(driveError);
        state.needsInitialPush = true;
        setSyncStatus('error');
        scheduleSyncRetry();
        toast('O cofre foi criado e protegido neste dispositivo. O envio ao Drive será tentado novamente.', 'warning', 5500);
      }
    } catch (error) {
      console.error(error);
      state.key = null;
      state.vault = null;
      el.masterError.textContent = 'Não foi possível criar e proteger o cofre neste dispositivo.';
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
        state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'vault-migration');
        state.needsInitialPush = true;
        toast('Cofre antigo migrado para a estrutura Keyron sem perder credenciais.', 'success', 5000);
      } else {
        state.key = result.key;
        state.vault = normalized;
      }

      KeyronSaveEngine.initialize(state.bundle);
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
    document.body.dataset.screen = 'app';
    document.body.dataset.accessMode = 'app';
    el.accessShell.hidden = true;
    el.appScreen.hidden = false;
    renderAll();
    resetAutoLockTimer();
    setSyncStatus(state.needsInitialPush ? (KeyronDrive.isConnected() ? 'pending' : 'offline') : (KeyronDrive.isConnected() ? 'synced' : 'offline'));
    setTimeout(() => el.search.focus(), 100);
  }

  async function lockVault({ signOut = false } = {}) {
    clearTimeout(state.autoLockTimer);
    clearTimeout(state.clipboardTimer);
    closeAllDialogs();
    await KeyronSaveEngine.flush(1200).catch(() => null);
    if (state.needsInitialPush && KeyronDrive.isConnected()) {
      await Promise.race([syncToDrive(), new Promise((resolve) => setTimeout(resolve, 1400))]).catch(() => null);
    }
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
      state.googleUser = null;
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
      lockVault().catch(() => null);
      toast('O Keyron foi bloqueado por inatividade.', 'info');
    }, minutes * 60 * 1000);
  }

  async function persistVault({ render = true, reason = 'data-change' } = {}) {
    if (!state.key || !state.vault || !state.bundle) throw new Error('VAULT_LOCKED');

    // A interface responde primeiro; a durabilidade local cifrada acontece logo em seguida.
    // O Save Engine consolida rajadas de mudanças e evita cifrar/gravar estados intermediários inúteis.
    const snapshot = structuredClone(state.vault);
    if (render) renderAll();
    setSyncStatus('saving');

    const result = await KeyronSaveEngine.commit({
      key: state.key,
      bundle: state.bundle,
      vault: snapshot,
      reason,
      onLocalSaved: (bundle) => {
        state.bundle = bundle;
        state.needsInitialPush = true;
      }
    });

    state.bundle = result.bundle;
    state.needsInitialPush = true;
    setSyncStatus(KeyronDrive.isConnected() ? 'pending' : 'offline');
    scheduleDriveSync();
    return result;
  }

  function scheduleDriveSync(delay = 160) {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(syncToDrive, Math.max(0, Number(delay) || 0));
  }

  function scheduleSyncRetry() {
    clearTimeout(state.syncRetryTimer);
    state.syncRetryCount += 1;
    const delay = Math.min(60000, 1000 * (2 ** Math.min(state.syncRetryCount - 1, 6)));
    state.syncRetryTimer = setTimeout(() => {
      if (navigator.onLine !== false && state.needsInitialPush) syncToDrive();
    }, delay);
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
        async (profile) => {
          try {
            state.googleVerified = true;
            state.googleUser = profile || KeyronDrive.getCurrentUser?.() || null;
            const remote = await KeyronDrive.loadBundle();
            if (remote?.bundle && parseTime(remote.bundle) > parseTime(state.bundle)) {
              await KeyronStorage.saveRecovery(state.bundle).catch(() => null);
              state.bundle = remote.bundle;
              await KeyronStorage.saveCurrent(state.bundle);
              KeyronSaveEngine.initialize(state.bundle);
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
      setSyncStatus(state.needsInitialPush ? 'offline' : 'synced');
      return;
    }
    if (state.syncInFlight) {
      state.syncRequested = true;
      return;
    }

    state.syncInFlight = true;
    setSyncStatus('syncing');
    try {
      // Garante que o último clique já virou bundle cifrado local antes de escolher o alvo remoto.
      await KeyronSaveEngine.flush(2200);
      const target = state.bundle;
      if (!target) return;

      await KeyronSaveEngine.withDriveLock(async () => {
        await KeyronDrive.saveBundle(target);
      });

      state.lastRemoteRevision = Math.max(state.lastRemoteRevision, Number(target.revision || 0));
      state.syncRetryCount = 0;
      clearTimeout(state.syncRetryTimer);
      await KeyronSaveEngine.confirmRemote(target);

      if (state.bundle === target || state.bundle?.operationId === target.operationId) {
        state.needsInitialPush = false;
        setSyncStatus('synced');
      } else {
        state.syncRequested = true;
      }
    } catch (error) {
      console.error(error);
      state.needsInitialPush = true;
      setSyncStatus('error');
      scheduleSyncRetry();
      if (state.syncRetryCount <= 1) {
        toast('A alteração já está protegida e cifrada neste dispositivo. O Keyron tentará confirmar no Drive novamente.', 'warning', 5200);
      }
    } finally {
      state.syncInFlight = false;
      if (state.syncRequested) {
        state.syncRequested = false;
        scheduleDriveSync(80);
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
    const lastActivity = Array.isArray(state.vault.activity) ? state.vault.activity[0] : null;
    if (lastActivity) {
      el.vaultLastActivity.textContent = `Última adição — ${formatFullDateTime(lastActivity.at)}`;
      el.vaultLastActivity.hidden = false;
    } else {
      el.vaultLastActivity.hidden = true;
    }
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
      section.className = `vault-column${column.collapsed ? ' is-collapsed' : ''}`;
      section.dataset.columnId = column.id;

      const head = document.createElement('div');
      head.className = 'column-head';
      const collapseBtn = columnAction(column.collapsed ? '▸' : '▾', 'column-collapse', column.collapsed ? 'Expandir gaveta' : 'Retrair gaveta');
      collapseBtn.classList.add('column-collapse-btn');
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
      head.append(collapseBtn, icon, title, actions);

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

    if (el.collapseAll) {
      const anyExpanded = state.vault.columns.some((c) => !c.collapsed);
      el.collapseAll.textContent = anyExpanded ? 'Retrair tudo' : 'Expandir tudo';
      el.collapseAll.hidden = state.vault.columns.length < 2;
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
    setPasswordVisibility(el.fPassword, el.togglePassword, false);
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
      await persistVault({ reason: state.editingEntryId ? 'entry-update' : 'entry-create' });
      toast(state.editingEntryId ? 'Credencial atualizada.' : 'Credencial adicionada.', 'success');
    } catch (error) {
      console.error(error);
      toast('Não foi possível salvar a credencial.', 'error');
    }
  }

  async function deleteCurrentEntry() {
    if (!state.editingEntryId) return;
    const entry = state.vault.entries.find((item) => item.id === state.editingEntryId);
    if (!entry) return;
    const confirmed = await askConfirm({ title: 'Excluir credencial', message: `Excluir definitivamente “${entry.name}”?`, confirmLabel: 'Excluir', kind: 'danger', kicker: 'EXCLUSÃO' });
    if (!confirmed) return;
    KeyronVault.deleteEntry(state.vault, entry.id);
    el.entryDialog.close();
    await persistVault({ reason: 'entry-delete' });
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
      await persistVault({ reason: state.editingColumnId ? 'column-update' : 'column-create' });
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
      if (action === 'column-collapse') KeyronVault.toggleColumnCollapsed(state.vault, columnId);
      if (action === 'column-left') KeyronVault.moveColumn(state.vault, columnId, -1);
      if (action === 'column-right') KeyronVault.moveColumn(state.vault, columnId, 1);
      if (action === 'column-delete') {
        const confirmed = await askConfirm({ title: 'Excluir gaveta', message: `Excluir a gaveta “${column.name}”? Ela precisa estar vazia.`, confirmLabel: 'Excluir', kind: 'danger', kicker: 'ORGANIZAÇÃO' });
        if (!confirmed) return;
        KeyronVault.deleteColumn(state.vault, columnId);
      }
      await persistVault({ reason: `column-${action}` });
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
      await persistVault({ render: false, reason: 'category-create' });
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
    const confirmed = await askConfirm({ title: 'Excluir categoria', message: text, confirmLabel: 'Excluir', kind: 'danger', kicker: 'CATEGORIAS' });
    if (!confirmed) return;
    KeyronVault.deleteCategory(state.vault, categoryId);
    if (state.activeCategoryId === categoryId) state.activeCategoryId = '';
    await persistVault({ render: false, reason: 'category-delete' });
    renderAll();
    renderCategoryDialog();
  }

  function renderSettings() {
    if (!state.vault || !state.bundle) return;
    el.autoLock.value = String(state.vault.preferences?.autoLockMinutes || 5);
    el.clipboard.value = String(state.vault.preferences?.clipboardClearSeconds || 20);
    const bytes = new Blob([JSON.stringify(state.bundle)]).size;
    el.storageInfo.textContent = `Cofre cifrado neste dispositivo: ${formatBytes(bytes)}`;
    renderActivity();
    refreshBiometricSettingsUI();
  }

  async function refreshBiometricSettingsUI() {
    const supported = await KeyronBiometric.platformAvailable();
    el.biometricSection.hidden = !supported;
    if (!supported) return;
    const enrolled = await KeyronBiometric.hasRecord(state.vault.id);
    el.biometricEnableRow.hidden = enrolled;
    el.biometricActiveRow.hidden = !enrolled;
    el.biometricEnableError.textContent = '';
    el.biometricConfirmPassword.value = '';
  }

  async function enableBiometric() {
    const typed = el.biometricConfirmPassword.value;
    if (!typed) {
      el.biometricEnableError.textContent = 'Digite sua senha mestra para confirmar.';
      return;
    }
    el.biometricEnableBtn.disabled = true;
    el.biometricEnableError.textContent = '';
    const originalLabel = el.biometricEnableBtn.textContent;
    el.biometricEnableBtn.textContent = 'Confirmando…';
    try {
      await KeyronCrypto.unlockBundle(typed, state.bundle);
    } catch {
      el.biometricEnableError.textContent = 'Senha mestra incorreta.';
      el.biometricEnableBtn.disabled = false;
      el.biometricEnableBtn.textContent = originalLabel;
      return;
    }

    el.biometricEnableBtn.textContent = 'Aguardando biometria…';
    try {
      await KeyronBiometric.enroll(state.vault.id, typed, state.googleUser?.email);
      el.biometricConfirmPassword.value = '';
      await refreshBiometricSettingsUI();
      toast('Biometria ativada neste dispositivo.', 'success');
    } catch (error) {
      const messages = {
        USER_CANCELLED: 'Verificação biométrica cancelada.',
        PLATFORM_UNAVAILABLE: 'Este dispositivo não tem biometria disponível.',
        PRF_NOT_SUPPORTED: 'Este navegador não suporta o modo seguro necessário para biometria.',
        CREATE_FAILED: 'Não foi possível registrar a biometria neste dispositivo.',
        PRF_EVAL_FAILED: 'Não foi possível confirmar a biometria. Tente novamente.'
      };
      el.biometricEnableError.textContent = messages[error.message] || 'Não foi possível ativar a biometria agora.';
    } finally {
      el.biometricEnableBtn.disabled = false;
      el.biometricEnableBtn.textContent = originalLabel;
    }
  }

  async function disableBiometric() {
    const confirmed = await askConfirm({ title: 'Desativar biometria', message: 'A senha mestra guardada localmente para desbloqueio biométrico será apagada deste dispositivo.', confirmLabel: 'Desativar', kind: 'danger', kicker: 'DESBLOQUEIO BIOMÉTRICO' });
    if (!confirmed) return;
    await KeyronBiometric.forget(state.vault.id);
    await refreshBiometricSettingsUI();
    toast('Biometria desativada neste dispositivo.', 'info');
  }

  async function savePreferences() {
    state.vault.preferences = {
      ...state.vault.preferences,
      autoLockMinutes: Number(el.autoLock.value),
      clipboardClearSeconds: Number(el.clipboard.value)
    };
    await persistVault({ render: false, reason: 'preferences-update' });
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
      const confirmed = await askConfirm({ title: 'Importar backup', message: 'O Keyron vai verificar a senha deste backup antes de substituir o cofre atual. Continuar?', confirmLabel: 'Continuar', kind: 'primary', kicker: 'BACKUP CIFRADO' });
      if (!confirmed) return;
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
      KeyronSaveEngine.initialize(bundle);
      state.bundle = await KeyronSaveEngine.stageBundle(bundle, 'vault-import');
      state.needsInitialPush = true;
      openApplication();
      try {
        await KeyronDrive.saveBundle(state.bundle, { automaticSnapshot: false });
        await KeyronSaveEngine.confirmRemote(state.bundle);
        state.needsInitialPush = false;
        setSyncStatus('synced');
        toast('Backup verificado, importado e confirmado no Drive.', 'success', 5000);
      } catch (driveError) {
        console.error(driveError);
        setSyncStatus('error');
        scheduleSyncRetry();
        toast('Backup verificado e importado neste dispositivo. O Drive será atualizado novamente assim que responder.', 'warning', 6000);
      }
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

  function formatFullDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const datePart = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timePart = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} às ${timePart}`;
  }

  const ACTIVITY_LABELS = { entry: 'Nova credencial', column: 'Nova gaveta', category: 'Nova categoria' };

  function renderActivity() {
    if (!el.activityList) return;
    const activity = Array.isArray(state.vault?.activity) ? state.vault.activity : [];
    el.activityList.replaceChildren();
    el.activityEmpty.hidden = activity.length > 0;
    for (const item of activity.slice(0, 25)) {
      const row = document.createElement('div');
      row.className = 'activity-row';
      const kind = document.createElement('span');
      kind.className = `activity-kind activity-kind--${item.type}`;
      kind.textContent = ACTIVITY_LABELS[item.type] || 'Adição';
      const label = document.createElement('b');
      label.textContent = item.label;
      const when = document.createElement('time');
      when.textContent = formatFullDateTime(item.at);
      row.append(kind, label, when);
      el.activityList.appendChild(row);
    }
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
    el.googleBtn.addEventListener('click', () => startGoogleVerification(true));
    el.masterForm.addEventListener('submit', handleMasterSubmit);
    el.masterPassword.addEventListener('input', updateMasterStrength);
    el.toggleMaster.addEventListener('click', () => togglePasswordVisibility(el.masterPassword, el.toggleMaster));
    el.biometricUnlockBtn.addEventListener('click', () => tryBiometricUnlock());
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
      state.googleUser = null;
      showGoogleStep();
    });

    el.addEntry.addEventListener('click', () => openEntryDialog());
    el.emptyAdd.addEventListener('click', () => openEntryDialog());
    el.addColumn.addEventListener('click', () => openColumnDialog());
    el.collapseAll.addEventListener('click', async () => {
      const anyExpanded = state.vault.columns.some((c) => !c.collapsed);
      KeyronVault.setAllColumnsCollapsed(state.vault, anyExpanded);
      await persistVault({ reason: 'column-collapse-all' }).catch(() => renderBoard());
    });
    el.manageCategories.addEventListener('click', () => { renderCategoryDialog(); el.categoryDialog.showModal(); });
    el.settingsBtn.addEventListener('click', () => { renderSettings(); el.settingsDialog.showModal(); });
    el.syncChip.addEventListener('click', reconnectOrSyncDrive);
    el.lockBtn.addEventListener('click', () => lockVault().catch(() => null));
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
      await persistVault({ reason: 'entry-move' });
      toast(`“${entry.name}” foi movida para outra gaveta.`, 'success');
    });

    el.entryForm.addEventListener('submit', handleEntrySubmit);
    el.deleteEntry.addEventListener('click', deleteCurrentEntry);
    el.fName.addEventListener('input', () => { if (!state.pendingLogo) renderLogoPreview(); });
    el.fPassword.addEventListener('input', updatePasswordStrength);
    el.togglePassword.addEventListener('click', () => togglePasswordVisibility(el.fPassword, el.togglePassword));
    el.generatePassword.addEventListener('click', () => {
      el.fPassword.value = KeyronGenerator.generate(24);
      setPasswordVisibility(el.fPassword, el.togglePassword, true);
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
    el.signout.addEventListener('click', () => lockVault({ signOut: true }).catch(() => null));
    el.biometricEnableBtn.addEventListener('click', enableBiometric);
    el.biometricConfirmPassword.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); enableBiometric(); } });
    el.biometricDisableBtn.addEventListener('click', disableBiometric);

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
      if (!document.hidden) return;
      KeyronSaveEngine.flush(900).catch(() => null);
      if (state.needsInitialPush) syncToDrive();
    });

    window.addEventListener('online', () => {
      if (state.needsInitialPush) scheduleDriveSync(50);
    });
    window.addEventListener('offline', () => {
      if (state.needsInitialPush) setSyncStatus('offline');
    });
    window.addEventListener('pagehide', () => {
      KeyronSaveEngine.flush(700).catch(() => null);
    });
  }

  async function init() {
    bindEvents();
    setPasswordVisibility(el.masterPassword, el.toggleMaster, false);
    setPasswordVisibility(el.fPassword, el.togglePassword, false);
    const stored = await KeyronStorage.loadCurrent();
    const pending = await KeyronSaveEngine.loadPendingBundle();
    state.bundle = pending && parseTime(pending) >= parseTime(stored) ? pending : stored;
    if (pending && state.bundle === pending) {
      await KeyronStorage.saveCurrent(pending).catch(() => null);
      state.needsInitialPush = true;
    }
    KeyronSaveEngine.initialize(state.bundle);
    KeyronSaveEngine.onEvent((event) => {
      if (event.type === 'other-tab' && state.key && Date.now() - state.otherTabWarningAt > 10000) {
        state.otherTabWarningAt = Date.now();
        toast('Outra aba do Keyron também está aberta. O salvamento remoto será serializado para reduzir conflitos.', 'warning', 5000);
      }
    });
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
