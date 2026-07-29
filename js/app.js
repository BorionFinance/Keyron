(() => {
  'use strict';
  if (window.__KEYRON_FRAME_BLOCKED__) return;

  const state = {
    bundle: null,
    key: null,
    vault: null,
    googleVerified: false,
    googleUser: null,
    offlineAuthorized: false,
    offlineAuthorization: null,
    offlineEntryReason: null,
    remoteInfo: null,
    needsInitialPush: false,
    accessMode: 'unlock',
    failedAttempts: 0,
    editingEntryId: null,
    editingColumnId: null,
    pendingLogo: null,
    activeCategoryId: '',
    collapsedColumns: new Set(),
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
    clipboardValue: null,
    hiddenLockTimer: null,
    hiddenAt: 0,
    pendingImportBundle: null,
    preImportBundle: null,
    pendingCsvImport: null,
    forceAccountChoiceNext: false,
    entryDialogScroll: null,
    draggingEntryId: null,
    draggingColumnId: null,
    dragDropTarget: null,
    dragScrollFrame: null,
    dragScrollVelocity: { x: 0, y: 0 },
    biometricAutoAttempted: false,
    breachScanInFlight: false,
    pendingRecoveryReveal: null,
    recoveryStage: 'code',
    pendingRecoveryDek: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const el = {
    accessShell: $('#access-shell'),
    googleStep: $('#google-step'),
    masterStep: $('#master-step'),
    googleBtn: $('#google-connect-btn'),
    googleLoading: $('#google-loading'),
    googleState: $('#google-state'),
    masterTitle: $('#master-title'),
    masterSubtitle: $('#master-subtitle'),
    offlineAccessBanner: $('#offline-access-banner'),
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
    forgotMasterBtn: $('#forgot-master-btn'),
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
    settingsNav: $('#settings-nav'),
    settingsContent: $('#settings-content'),
    breachWeekly: $('#setting-breach-weekly'),
    breachCheckBtn: $('#breach-check-btn'),
    breachLastCheck: $('#breach-last-check'),
    breachStatus: $('#breach-status'),
    breachResults: $('#breach-results'),
    activityList: $('#activity-list'),
    activityEmpty: $('#activity-empty'),
    cpForm: $('#change-password-form'),
    cpCurrent: $('#cp-current'),
    cpToggleCurrent: $('#cp-toggle-current'),
    cpNew: $('#cp-new'),
    cpToggleNew: $('#cp-toggle-new'),
    cpConfirm: $('#cp-confirm'),
    cpToggleConfirm: $('#cp-toggle-confirm'),
    cpStrengthBar: $('#cp-strength-bar'),
    cpStrengthLabel: $('#cp-strength-label'),
    cpError: $('#cp-error'),
    cpSubmit: $('#cp-submit'),
    biometricSection: $('#biometric-section'),
    biometricEnableRow: $('#biometric-enable-row'),
    biometricEnableError: $('#biometric-enable-error'),
    biometricConfirmPassword: $('#biometric-confirm-password'),
    biometricEnableBtn: $('#biometric-enable-btn'),
    biometricActiveRow: $('#biometric-active-row'),
    biometricDisableBtn: $('#biometric-disable-btn'),
    offlineAccessSection: $('#offline-access-section'),
    offlineAccessEnableRow: $('#offline-access-enable-row'),
    offlineDeviceLabel: $('#offline-device-label'),
    offlineConfirmPassword: $('#offline-confirm-password'),
    offlineAccessEnableBtn: $('#offline-access-enable-btn'),
    offlineAccessError: $('#offline-access-error'),
    offlineAccessUnavailable: $('#offline-access-unavailable'),
    offlineAccessActiveRow: $('#offline-access-active-row'),
    offlineAccessStatusText: $('#offline-access-status-text'),
    offlineAccessDetails: $('#offline-access-details'),
    offlineAccessRefreshBtn: $('#offline-access-refresh-btn'),
    offlineAccessDisableBtn: $('#offline-access-disable-btn'),
    autoLock: $('#setting-auto-lock'),
    clipboard: $('#setting-clipboard'),
    boardColumns: $('#setting-board-columns'),
    exportBtn: $('#export-btn'),
    importBtn: $('#import-btn'),
    importInput: $('#import-input'),
    csvImportColumn: $('#csv-import-column'),
    csvImportCategory: $('#csv-import-category'),
    csvImportBtn: $('#csv-import-btn'),
    csvImportInput: $('#csv-import-input'),
    importReviewDialog: $('#import-review-dialog'),
    importSummary: $('#import-summary'),
    importConflicts: $('#import-conflicts'),
    importConflictsBulk: $('#import-conflicts-bulk'),
    importApplyBtn: $('#import-apply-btn'),
    backupNow: $('#backup-now-btn'),
    signout: $('#signout-btn'),
    storageInfo: $('#storage-info'),
    confirmDialog: $('#confirm-dialog'),
    confirmKicker: $('#confirm-kicker'),
    confirmTitle: $('#confirm-title'),
    confirmMessage: $('#confirm-message'),
    confirmCancel: $('#confirm-cancel'),
    confirmOk: $('#confirm-ok'),
    recoveryStep: $('#recovery-step'),
    recoveryForm: $('#recovery-form'),
    recoveryCodeInput: $('#recovery-code-input'),
    recoveryNewpassGroup: $('#recovery-newpass-group'),
    recoveryNewPassword: $('#recovery-new-password'),
    recoveryToggleNew: $('#recovery-toggle-new'),
    recoveryStrengthBar: $('#recovery-strength-bar'),
    recoveryStrengthLabel: $('#recovery-strength-label'),
    recoveryNewPasswordConfirm: $('#recovery-new-password-confirm'),
    recoveryError: $('#recovery-error'),
    recoverySubmit: $('#recovery-submit'),
    recoveryBackBtn: $('#recovery-back-btn'),
    recoveryRevealDialog: $('#recovery-reveal-dialog'),
    recoveryCodeValue: $('#recovery-code-value'),
    recoveryCodeCopy: $('#recovery-code-copy'),
    recoveryRevealAck: $('#recovery-reveal-ack'),
    recoveryRevealClose: $('#recovery-reveal-close'),
    recoveryStatusBadge: $('#recovery-status-badge'),
    recoveryCreatedAt: $('#recovery-created-at'),
    recoveryRegenerateBtn: $('#recovery-regenerate-btn')
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
    const text = label || ({ saving: 'Protegendo', pending: 'Salvo local', syncing: 'Sincronizando', synced: 'Sincronizado', offline: 'Somente local', trusted: 'Offline autorizado', error: 'Erro no Drive' }[status] || status);
    $('b', el.syncChip).textContent = text;
    el.syncChip.title = ({
      saving: 'Cifrando e salvando neste dispositivo.',
      pending: 'Salvo e cifrado localmente; aguardando confirmação do Drive.',
      syncing: 'Comparando e enviando o cofre cifrado ao Google Drive.',
      synced: 'Cofre cifrado confirmado no Google Drive.',
      offline: 'Sem conexão com o Drive. Os dados permanecem cifrados neste dispositivo.',
      trusted: 'Sessão offline autorizada. O Drive só será usado após verificar o Google.',
      error: 'O Drive não confirmou a última alteração. Clique para tentar novamente.'
    }[status] || 'Status da sincronização');
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


  function googleAccountIdentifier() {
    return String(state.googleUser?.id || state.googleUser?.email || '').trim();
  }

  async function currentAccountBinding() {
    const identifier = googleAccountIdentifier();
    return identifier ? KeyronCrypto.hashAccountIdentifier(identifier) : null;
  }

  async function belongsToCurrentGoogleAccount(bundle) {
    if (!bundle?.ownerBinding) return true; // cofre anterior à vinculação: será vinculado após o primeiro desbloqueio.
    const binding = await currentAccountBinding();
    return Boolean(binding && binding === bundle.ownerBinding);
  }

  function clearOfflineSession() {
    state.offlineAuthorized = false;
    state.offlineAuthorization = null;
    state.offlineEntryReason = null;
    if (el.offlineAccessBanner) el.offlineAccessBanner.hidden = true;
  }

  function defaultDeviceLabel() {
    const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    const platform = String(navigator.userAgentData?.platform || navigator.platform || '').trim();
    const base = mobile ? 'Meu celular' : 'Meu computador';
    return platform ? `${base} — ${platform}`.slice(0, 80) : base;
  }

  function canAttemptTrustedOffline() {
    return Boolean(
      KeyronConfig.ALLOW_TRUSTED_OFFLINE_ACCESS !== false &&
      globalThis.KeyronOfflineAccess?.supported?.() &&
      safeEncryptedBundle(state.bundle)?.ownerBinding
    );
  }

  async function authorizeOfflineSession(reason = 'offline') {
    if (!canAttemptTrustedOffline()) return false;
    try {
      const authorization = await KeyronOfflineAccess.verify(state.bundle, KeyronSaveEngine.deviceId);
      state.offlineAuthorized = true;
      state.offlineAuthorization = authorization;
      state.offlineEntryReason = reason;
      state.googleVerified = false;
      state.googleUser = null;
      configureMasterStep('unlock');
      showMasterStep();
      return true;
    } catch (error) {
      clearOfflineSession();
      console.warn('[Keyron] acesso offline não autorizado', error?.message);
      return false;
    }
  }

  async function bundleAuthorizedForUnlock(bundle) {
    if (state.googleVerified) return belongsToCurrentGoogleAccount(bundle);
    if (!state.offlineAuthorized || !state.offlineAuthorization) return false;
    if (bundle?.vaultId !== state.offlineAuthorization.vaultId || bundle?.ownerBinding !== state.offlineAuthorization.ownerBinding) return false;
    if (KeyronSaveEngine.deviceId !== state.offlineAuthorization.deviceId) return false;
    try {
      state.offlineAuthorization = await KeyronOfflineAccess.verify(bundle, KeyronSaveEngine.deviceId);
      return true;
    } catch {
      clearOfflineSession();
      return false;
    }
  }


  function safeEncryptedBundle(value) {
    if (!value) return null;
    try {
      KeyronCrypto.assertValidBundle(value);
      return value;
    } catch (error) {
      console.warn('[Keyron] bundle cifrado inválido ignorado', error?.message);
      return null;
    }
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
    if (value.includes('google_account_id_unavailable')) return 'O Google não forneceu um identificador verificável para esta conta. Tente entrar novamente.';
    return message || 'Falha na verificação do Google.';
  }

  function parseTime(bundle) {
    const value = Date.parse(bundle?.updatedAt || 0);
    return Number.isFinite(value) ? value : 0;
  }

  async function chooseBundle(remoteInfo) {
    let local = safeEncryptedBundle(state.bundle);
    let remote = safeEncryptedBundle(remoteInfo?.bundle || null);
    state.needsInitialPush = false;

    if (remote && !(await belongsToCurrentGoogleAccount(remote))) {
      await KeyronStorage.saveRecovery(remote).catch(() => null);
      throw new Error('REMOTE_ACCOUNT_MISMATCH');
    }
    if (local && !(await belongsToCurrentGoogleAccount(local))) {
      await KeyronStorage.saveRecovery(local).catch(() => null);
      local = null;
      if (!remote) throw new Error('LOCAL_ACCOUNT_MISMATCH');
      toast('O cofre local pertence a outra conta Google e foi preservado sem ser enviado para esta conta.', 'warning', 6500);
    }

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
    if (localId !== remoteId) {
      await KeyronStorage.saveRecovery(local).catch(() => null);
      await KeyronStorage.saveCurrent(remote);
      toast('Foram encontrados dois cofres diferentes. O Drive foi mantido como fonte principal e o cofre local ficou preservado para recuperação, sem sobrescrita automática.', 'warning', 8000);
      return remote;
    }

    const localVersion = Number(local.formatVersion || 0);
    const remoteVersion = Number(remote.formatVersion || 0);
    const localOperation = String(local.operationId || '');
    const remoteOperation = String(remote.operationId || '');

    if (localVersion >= 4 && remoteVersion >= 4 && localOperation && remoteOperation) {
      if (localOperation === remoteOperation) {
        await KeyronStorage.saveCurrent(remote);
        return remote;
      }

      const localDescendsRemote = Array.isArray(local.ancestors) && local.ancestors.includes(remoteOperation);
      const remoteDescendsLocal = Array.isArray(remote.ancestors) && remote.ancestors.includes(localOperation);
      if (localDescendsRemote && !remoteDescendsLocal) {
        state.needsInitialPush = true;
        return local;
      }
      if (remoteDescendsLocal && !localDescendsRemote) {
        await KeyronStorage.saveCurrent(remote);
        return remote;
      }

      // As duas versões são válidas, mas não pertencem à mesma cadeia de operações.
      // O Drive permanece canônico; a cópia local é guardada para recuperação manual.
      await KeyronStorage.saveRecovery(local).catch(() => null);
      await KeyronStorage.saveCurrent(remote);
      toast('Alterações paralelas foram detectadas. O Keyron bloqueou a sobrescrita, manteve o Drive como versão atual e preservou a cópia local para recuperação.', 'warning', 8500);
      return remote;
    }

    // Migração de versões antigas: uma versão com metadados autenticados sempre vence
    // outra sem essa proteção. Entre duas versões antigas, usa revisão e horário apenas
    // uma vez; após o desbloqueio, o cofre será atualizado para o formato atual.
    if (localVersion >= 4 && remoteVersion < 4) {
      state.needsInitialPush = true;
      return local;
    }
    if (remoteVersion >= 4 && localVersion < 4) {
      await KeyronStorage.saveRecovery(local).catch(() => null);
      await KeyronStorage.saveCurrent(remote);
      return remote;
    }

    const localRevision = Number(local.revision || 0);
    const remoteRevision = Number(remote.revision || 0);
    const localIsNewer = localRevision !== remoteRevision ? localRevision > remoteRevision : parseTime(local) > parseTime(remote);
    if (localIsNewer) {
      state.needsInitialPush = true;
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

  function setGoogleLoading(loading) {
    el.googleBtn.hidden = loading;
    el.googleBtn.disabled = loading;
    el.googleLoading.hidden = !loading;
  }

  async function startGoogleVerification(forceAccountChoice = false) {
    if (!configured()) {
      el.googleState.textContent = 'Configure o Client ID em js/config.js antes de usar.';
      toast('O Google OAuth ainda não foi configurado. Veja CONFIGURACAO.md.', 'error', 5500);
      return;
    }

    setGoogleLoading(true);
    el.googleState.textContent = 'Abrindo a verificação segura do Google…';
    try {
      await waitForGoogleLibrary();
      KeyronDrive.init(
        KeyronConfig.GOOGLE_CLIENT_ID,
        onGoogleVerified,
        (message) => {
          const friendly = googleErrorMessage(message);
          setGoogleLoading(false);
          el.googleState.textContent = friendly;
          toast(friendly, 'error', 6500);
        }
      );
      KeyronDrive.connect(forceAccountChoice);
    } catch (error) {
      console.error(error);
      setGoogleLoading(false);
      const enteredOffline = await authorizeOfflineSession('google-unavailable');
      if (enteredOffline) {
        toast('Google indisponível. O Keyron liberou somente a cópia cifrada deste dispositivo.', 'warning', 5600);
        return;
      }
      el.googleState.textContent = 'A biblioteca do Google não carregou. Confira a internet e tente novamente.';
      toast('A verificação do Google não pôde ser iniciada e este aparelho não tem autorização offline válida.', 'error', 6000);
    }
  }

  async function onGoogleVerified(profile) {
    clearOfflineSession();
    state.googleVerified = true;
    state.forceAccountChoiceNext = false;
    state.googleUser = profile || KeyronDrive.getCurrentUser?.() || null;
    // O indicador de carregamento continua no lugar do botão Enter até a tela de
    // senha mestra aparecer (ou até dar erro) — reabilitar o botão aqui permitiria
    // um segundo clique nesse meio-tempo, reabrindo o seletor de conta do Google.
    const accountLabel = state.googleUser?.email ? `Google verificado: ${state.googleUser.email}.` : 'Google verificado.';
    el.googleState.textContent = `${accountLabel} Localizando seu cofre…`;
    try {
      state.remoteInfo = await KeyronDrive.loadBundle();
      state.bundle = await chooseBundle(state.remoteInfo);
      state.lastRemoteRevision = Number(state.remoteInfo?.bundle?.revision || 0);
      KeyronSaveEngine.initialize(state.bundle);
      configureMasterStep(state.bundle ? 'unlock' : 'create');
      showMasterStep();
    } catch (error) {
      console.error(error);
      if (['LOCAL_ACCOUNT_MISMATCH', 'REMOTE_ACCOUNT_MISMATCH'].includes(error?.message)) {
        KeyronDrive.disconnect();
        state.googleVerified = false;
        state.googleUser = null;
        state.forceAccountChoiceNext = true;
        showGoogleStep();
        el.googleState.textContent = 'Este cofre pertence a outra conta Google. Selecione a conta correta.';
        toast('Conta Google diferente da vinculada ao cofre. Nenhum arquivo foi enviado ou aberto.', 'error', 7000);
      } else if (safeEncryptedBundle(state.bundle)) {
        toast('O Google foi verificado, mas o Drive não respondeu. O cofre cifrado deste dispositivo ainda pode ser aberto.', 'warning', 5500);
        configureMasterStep('unlock');
        showMasterStep();
      } else {
        state.googleVerified = false;
        setGoogleLoading(false);
        el.googleState.textContent = 'Não foi possível acessar a pasta do Keyron no Drive.';
        toast('Sem acesso ao Drive e sem cofre local. Tente verificar novamente.', 'error', 5200);
      }
    }
  }

  function showGoogleStep() {
    document.body.dataset.screen = 'access';
    document.body.dataset.accessMode = 'google';
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = false;
    el.masterStep.hidden = true;
    el.recoveryStep.hidden = true;
    setGoogleLoading(false);
  }

  function prefersBiometricFirst() {
    return window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  }

  function showMasterStep() {
    document.body.dataset.screen = 'access';
    el.appScreen.hidden = true;
    el.accessShell.hidden = false;
    el.googleStep.hidden = true;
    el.masterStep.hidden = false;
    el.recoveryStep.hidden = true;
    if (el.offlineAccessBanner) el.offlineAccessBanner.hidden = !state.offlineAuthorized;
    el.forgotMasterBtn.hidden = state.offlineAuthorized;
    if (state.offlineAuthorized) {
      el.backGoogle.textContent = navigator.onLine === false ? 'Tentar Google quando voltar a internet' : 'Verificar Google agora';
    }
    refreshBiometricUnlockUI({ autoAttempt: true }).catch(() => {
      document.body.classList.remove('biometric-first');
      setTimeout(() => el.masterPassword.focus(), 80);
    });
  }

  function showRecoveryStep() {
    if (!state.googleVerified) {
      toast('A recuperação exige uma nova verificação Google.', 'warning', 4800);
      return;
    }
    document.body.dataset.screen = 'access';
    el.accessShell.hidden = false;
    el.googleStep.hidden = true;
    el.masterStep.hidden = true;
    el.recoveryStep.hidden = false;
    state.recoveryStage = 'code';
    state.pendingRecoveryDek = null;
    el.recoveryForm.reset();
    el.recoveryError.textContent = '';
    el.recoveryCodeInput.disabled = false;
    el.recoveryNewpassGroup.hidden = true;
    el.recoverySubmit.textContent = 'Verificar chave';
    setTimeout(() => el.recoveryCodeInput.focus(), 70);
  }

  function backToMasterFromRecovery() {
    state.pendingRecoveryDek = null;
    showMasterStep();
  }

  function updateRecoveryStrength() {
    const score = KeyronGenerator.strength(el.recoveryNewPassword.value);
    el.recoveryStrengthBar.style.width = `${score}%`;
    el.recoveryStrengthBar.dataset.level = score >= 72 ? 'strong' : score >= 44 ? 'medium' : 'weak';
    el.recoveryStrengthLabel.textContent = score >= 72 ? 'Boa força. Guarde esta frase em um lugar seguro.' : score >= 44 ? 'Razoável, mas uma frase mais longa será melhor.' : 'Use pelo menos 12 caracteres, de preferência uma frase longa.';
  }

  async function handleRecoverySubmit(event) {
    event.preventDefault();
    el.recoveryError.textContent = '';

    if (state.recoveryStage === 'code') {
      const code = el.recoveryCodeInput.value.trim();
      if (!code) return;
      el.recoverySubmit.disabled = true;
      try {
        if (!(await belongsToCurrentGoogleAccount(state.bundle))) throw new Error('ACCOUNT_MISMATCH');
        const dek = await KeyronCrypto.unlockWithRecoveryCode(code, state.bundle);
        state.pendingRecoveryDek = dek;
        state.recoveryStage = 'newpass';
        el.recoveryCodeInput.disabled = true;
        el.recoveryNewpassGroup.hidden = false;
        el.recoverySubmit.textContent = 'Definir nova senha e desbloquear';
        setTimeout(() => el.recoveryNewPassword.focus(), 70);
      } catch (error) {
        el.recoveryError.textContent = error?.message === 'ACCOUNT_MISMATCH'
          ? 'Este cofre está vinculado a outra conta Google. Troque para a conta correta.'
          : 'Chave de recuperação inválida.';
      } finally {
        el.recoverySubmit.disabled = false;
      }
      return;
    }

    const next = el.recoveryNewPassword.value;
    const confirmValue = el.recoveryNewPasswordConfirm.value;
    if (next.length < 12) {
      el.recoveryError.textContent = 'A nova senha mestra precisa ter pelo menos 12 caracteres.';
      return;
    }
    if (KeyronGenerator.strength(next) < 44) {
      el.recoveryError.textContent = 'Essa nova senha ainda está fraca. Use uma frase maior e mais difícil de adivinhar.';
      return;
    }
    if (next !== confirmValue) {
      el.recoveryError.textContent = 'As duas senhas novas não são iguais.';
      return;
    }

    el.recoverySubmit.disabled = true;
    setBusy(true, 'Restaurando o acesso…', 'Validando a chave de recuperação e definindo a nova senha mestra.');
    try {
      const dek = state.pendingRecoveryDek;
      const decryptedVault = await KeyronCrypto.decryptPayload(dek, state.bundle);
      const normalized = KeyronVault.normalize(decryptedVault);
      const rewrapped = await KeyronCrypto.changePassword(dek, next, state.bundle, {
        ownerAccountId: googleAccountIdentifier(),
        deviceId: KeyronSaveEngine.deviceId,
        saveReason: 'password-recovery'
      });

      const hadBiometric = await KeyronBiometric.hasRecord(normalized.id);
      if (hadBiometric) await KeyronBiometric.forget(normalized.id);
      await KeyronOfflineAccess.revoke(normalized.id).catch(() => null);
      clearOfflineSession();

      state.key = dek;
      state.bundle = rewrapped;
      state.vault = normalized;
      KeyronSaveEngine.initialize(state.bundle);
      state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'password-recovery');
      state.needsInitialPush = true;
      state.failedAttempts = 0;
      state.pendingRecoveryDek = null;

      openApplication();
      scheduleDriveSync(50);
      toast('Acesso restaurado com a chave de recuperação. Uma nova senha mestra foi definida.', 'success', 6000);
    } catch (error) {
      console.error(error);
      el.recoveryError.textContent = 'Não foi possível concluir a recuperação agora. Tente novamente.';
    } finally {
      el.recoverySubmit.disabled = false;
      setBusy(false);
    }
  }

  function showRecoveryCodeReveal(code) {
    el.recoveryCodeValue.textContent = code;
    el.recoveryRevealAck.checked = false;
    el.recoveryRevealClose.disabled = true;
    el.recoveryRevealDialog.showModal();
  }

  async function handleRecoveryRegenerate() {
    if (!state.googleVerified || !KeyronDrive.isConnected()) {
      toast('Verifique o Google antes de gerar uma nova chave de recuperação. Essa mudança precisa ser confirmada no Drive.', 'warning', 5600);
      return;
    }
    const confirmed = await askConfirm({
      title: 'Gerar nova chave de recuperação',
      message: 'A chave atual deixará de abrir o cofre principal. Backups antigos continuam protegidos pela chave vigente quando foram criados. Você verá a nova chave uma única vez — guarde-a antes de fechar.',
      confirmLabel: 'Gerar nova chave',
      kind: 'danger',
      kicker: 'RECUPERAÇÃO'
    });
    if (!confirmed) return;

    el.recoveryRegenerateBtn.disabled = true;
    try {
      const result = await KeyronCrypto.regenerateRecovery(state.key, state.bundle, {
        ownerAccountId: googleAccountIdentifier(),
        deviceId: KeyronSaveEngine.deviceId,
        saveReason: 'recovery-regenerate'
      });
      state.bundle = result.bundle;
      state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'recovery-regenerate');
      renderRecoveryStatus();
      try {
        await KeyronDrive.saveBundle(state.bundle, { automaticSnapshot: false });
        await KeyronSaveEngine.confirmRemote(state.bundle);
        toast('Nova chave de recuperação gerada e sincronizada.', 'success');
      } catch (driveError) {
        console.error(driveError);
        if (driveError?.code === 'DRIVE_CONFLICT' && await handleDriveConflict(state.bundle)) return;
        scheduleSyncRetry();
        toast('Nova chave de recuperação gerada. O Drive será atualizado assim que possível.', 'warning');
      }
      showRecoveryCodeReveal(result.recoveryCode);
    } catch (error) {
      console.error(error);
      toast('Não foi possível gerar uma nova chave agora.', 'error');
    } finally {
      el.recoveryRegenerateBtn.disabled = false;
    }
  }

  function renderRecoveryStatus() {
    if (!el.recoveryCreatedAt) return;
    const recovery = state.bundle?.recovery;
    if (recovery?.createdAt) {
      el.recoveryStatusBadge.textContent = 'ATIVA';
      el.recoveryCreatedAt.textContent = `Chave de recuperação ativa desde ${formatFullDateTime(recovery.createdAt)}.`;
    } else {
      el.recoveryStatusBadge.textContent = 'INDISPONÍVEL';
      el.recoveryCreatedAt.textContent = 'Uma chave de recuperação será criada na próxima sincronização.';
    }
  }

  async function refreshBiometricUnlockUI({ autoAttempt = false } = {}) {
    const vaultId = state.bundle?.vaultId;
    const eligible = Boolean(state.accessMode === 'unlock' && vaultId && (await KeyronBiometric.platformAvailable()) && (await KeyronBiometric.hasRecord(vaultId)));
    el.biometricUnlockBtn.hidden = !eligible;
    el.biometricDivider.hidden = !eligible;
    const biometricFirst = eligible && prefersBiometricFirst();
    document.body.classList.toggle('biometric-first', biometricFirst);

    if (!eligible || !biometricFirst) {
      setTimeout(() => el.masterPassword.focus(), 80);
      return eligible;
    }

    if (autoAttempt && !state.biometricAutoAttempted) {
      state.biometricAutoAttempted = true;
      setTimeout(() => tryBiometricUnlock(true), 130);
    }
    return eligible;
  }

  function showPasswordFallback() {
    document.body.classList.remove('biometric-first');
    el.biometricDivider.hidden = false;
    setTimeout(() => el.masterPassword.focus(), 70);
  }

  async function tryBiometricUnlock(automatic = false) {
    const vaultId = state.bundle?.vaultId;
    if (!vaultId || el.biometricUnlockBtn.disabled) return false;
    el.biometricUnlockBtn.disabled = true;
    try {
      const password = await KeyronBiometric.unlock(vaultId);
      await unlockVault(password);
      return Boolean(state.key);
    } catch (error) {
      const messages = {
        USER_CANCELLED: 'Biometria cancelada. Digite sua senha mestra.',
        NO_RECORD: 'Biometria não ativada neste dispositivo.',
        ASSERTION_FAILED: 'Não foi possível confirmar a biometria. Digite sua senha mestra.',
        UNWRAP_FAILED: 'A biometria não confere mais. Digite sua senha mestra.'
      };
      showPasswordFallback();
      if (!automatic || error.message !== 'USER_CANCELLED') toast(messages[error.message] || 'Não foi possível usar a biometria agora.', 'error', 4200);
      return false;
    } finally {
      el.biometricUnlockBtn.disabled = false;
    }
  }

  function configureMasterStep(mode) {
    state.accessMode = mode;
    state.biometricAutoAttempted = false;
    document.body.classList.remove('biometric-first');
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
      el.backGoogle.textContent = state.offlineAuthorized ? (navigator.onLine === false ? 'Tentar Google quando voltar a internet' : 'Verificar Google agora') : 'Trocar conta Google';
    }
  }

  function updateMasterStrength() {
    const score = KeyronGenerator.strength(el.masterPassword.value);
    el.masterStrengthBar.style.width = `${score}%`;
    el.masterStrengthBar.dataset.level = score >= 72 ? 'strong' : score >= 44 ? 'medium' : 'weak';
    el.masterStrengthLabel.textContent = score >= 72 ? 'Boa força. Guarde esta frase em um lugar seguro.' : score >= 44 ? 'Razoável, mas uma frase mais longa será melhor.' : 'Use pelo menos 12 caracteres, de preferência uma frase longa.';
  }

  function updateChangePasswordStrength() {
    const score = KeyronGenerator.strength(el.cpNew.value);
    el.cpStrengthBar.style.width = `${score}%`;
    el.cpStrengthBar.dataset.level = score >= 72 ? 'strong' : score >= 44 ? 'medium' : 'weak';
    el.cpStrengthLabel.textContent = score >= 72 ? 'Boa força. Guarde esta frase em um lugar seguro.' : score >= 44 ? 'Razoável, mas uma frase mais longa será melhor.' : 'Use pelo menos 12 caracteres, de preferência uma frase longa.';
  }

  async function handleChangePasswordSubmit(event) {
    event.preventDefault();
    const current = el.cpCurrent.value;
    const next = el.cpNew.value;
    const confirmValue = el.cpConfirm.value;
    el.cpError.textContent = '';

    if (!state.googleVerified || !KeyronDrive.isConnected()) {
      el.cpError.textContent = 'Verifique o Google antes de trocar a senha mestra. Essa mudança precisa ser confirmada no Drive.';
      return;
    }

    if (!current || !next) {
      el.cpError.textContent = 'Preencha a senha atual e a nova senha.';
      return;
    }
    if (next.length < 12) {
      el.cpError.textContent = 'A nova senha mestra precisa ter pelo menos 12 caracteres.';
      return;
    }
    if (KeyronGenerator.strength(next) < 44) {
      el.cpError.textContent = 'Essa nova senha ainda está fraca. Use uma frase maior e mais difícil de adivinhar.';
      return;
    }
    if (next !== confirmValue) {
      el.cpError.textContent = 'As duas senhas novas não são iguais.';
      return;
    }
    if (next === current) {
      el.cpError.textContent = 'A nova senha precisa ser diferente da atual.';
      return;
    }

    el.cpSubmit.disabled = true;
    try {
      await KeyronCrypto.unlockBundle(current, state.bundle);
    } catch {
      el.cpError.textContent = 'Senha mestra atual incorreta.';
      el.cpSubmit.disabled = false;
      return;
    }

    await changeMasterPassword(next);
    el.cpSubmit.disabled = false;
  }

  async function changeMasterPassword(newPassword) {
    setBusy(true, 'Trocando a senha mestra…', 'Protegendo o cofre com a nova senha.');
    try {
      const hasKeyManagement = Boolean(state.bundle.wrappedKey);
      if (hasKeyManagement) {
        state.bundle = await KeyronCrypto.changePassword(state.key, newPassword, state.bundle, {
          ownerAccountId: googleAccountIdentifier(),
          deviceId: KeyronSaveEngine.deviceId,
          saveReason: 'password-change'
        });
      } else {
        const migrated = await KeyronCrypto.rekeyBundle(newPassword, state.vault, state.vault.id, {
          ownerAccountId: googleAccountIdentifier(),
          deviceId: KeyronSaveEngine.deviceId,
          saveReason: 'password-change-migration'
        });
        state.key = migrated.key;
        state.bundle = migrated.bundle;
        if (migrated.recoveryCode) state.pendingRecoveryReveal = migrated.recoveryCode;
      }
      KeyronSaveEngine.initialize(state.bundle);
      state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'password-change');
      state.needsInitialPush = true;

      const hadBiometric = await KeyronBiometric.hasRecord(state.vault.id);
      if (hadBiometric) await KeyronBiometric.forget(state.vault.id);
      await KeyronOfflineAccess.revoke(state.vault.id).catch(() => null);
      clearOfflineSession();

      el.cpForm.reset();
      el.cpStrengthBar.style.width = '0%';
      renderSettings();

      if (state.pendingRecoveryReveal) {
        const freshCode = state.pendingRecoveryReveal;
        state.pendingRecoveryReveal = null;
        showRecoveryCodeReveal(freshCode);
      }

      try {
        await KeyronDrive.saveBundle(state.bundle, { automaticSnapshot: false });
        await KeyronSaveEngine.confirmRemote(state.bundle);
        state.needsInitialPush = false;
        setSyncStatus('synced');
        toast(hadBiometric ? 'Senha mestra trocada e sincronizada. A biometria foi desativada — reative se quiser.' : 'Senha mestra trocada e sincronizada no Drive.', 'success', 6000);
      } catch (driveError) {
        console.error(driveError);
        if (driveError?.code === 'DRIVE_CONFLICT' && await handleDriveConflict(state.bundle)) return;
        setSyncStatus('error');
        scheduleSyncRetry();
        toast('Senha trocada neste dispositivo. O Drive será atualizado assim que a conexão responder — use a senha nova a partir de agora.', 'warning', 7000);
      }
    } catch (error) {
      console.error(error);
      el.cpError.textContent = 'Não foi possível trocar a senha mestra agora. Tente novamente.';
    } finally {
      setBusy(false);
    }
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
      const created = await KeyronCrypto.createBundle(password, state.vault, {
        ownerAccountId: googleAccountIdentifier(),
        deviceId: KeyronSaveEngine.deviceId,
        saveReason: 'vault-create'
      });
      state.key = created.key;
      state.bundle = created.bundle;
      state.pendingRecoveryReveal = created.recoveryCode;
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
        if (driveError?.code === 'DRIVE_CONFLICT' && await handleDriveConflict(state.bundle)) return;
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
      const rawBundle = safeEncryptedBundle(state.bundle);
      if (!rawBundle) throw new Error('INVALID_BUNDLE');
      const offlineAttempt = state.offlineAuthorized;
      if (!(await bundleAuthorizedForUnlock(rawBundle))) throw new Error(offlineAttempt ? 'OFFLINE_AUTHORIZATION_INVALID' : 'ACCOUNT_MISMATCH');

      const result = await KeyronCrypto.unlockBundle(password, rawBundle);
      const normalized = KeyronVault.normalize(result.vault);
      const ownerAccountId = state.googleVerified ? googleAccountIdentifier() : '';
      const expectedBinding = ownerAccountId ? await KeyronCrypto.hashAccountIdentifier(ownerAccountId) : rawBundle.ownerBinding;
      const needsRekey = result.legacy || !rawBundle.wrappedKey;
      if (needsRekey && !state.googleVerified) throw new Error('OFFLINE_LEGACY_UNSUPPORTED');
      const needsUpgrade = Number(rawBundle.formatVersion || 0) < KeyronCrypto.FORMAT_VERSION ||
        !result.metadataProtected ||
        result.iterations < KeyronCrypto.CURRENT_ITERATIONS ||
        !rawBundle.ownerBinding ||
        (state.googleVerified && rawBundle.ownerBinding !== expectedBinding);

      if (needsRekey) {
        const migrated = await KeyronCrypto.rekeyBundle(password, normalized, normalized.id, {
          ownerAccountId,
          deviceId: KeyronSaveEngine.deviceId,
          saveReason: 'vault-security-migration'
        });
        state.key = migrated.key;
        state.bundle = migrated.bundle;
        state.vault = normalized;
        state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'vault-security-migration');
        state.needsInitialPush = true;
        if (migrated.recoveryCode) state.pendingRecoveryReveal = migrated.recoveryCode;
        toast('Cofre antigo migrado para a proteção atual sem perder credenciais.', 'success', 5000);
      } else if (needsUpgrade) {
        const upgraded = result.iterations < KeyronCrypto.CURRENT_ITERATIONS
          ? await KeyronCrypto.changePassword(result.key, password, rawBundle, {
              ownerAccountId,
              deviceId: KeyronSaveEngine.deviceId,
              saveReason: 'vault-security-upgrade'
            })
          : await KeyronCrypto.updateBundle(result.key, rawBundle, normalized, {
              ownerAccountId,
              deviceId: KeyronSaveEngine.deviceId,
              saveReason: 'vault-security-upgrade'
            });
        state.key = result.key;
        state.bundle = upgraded;
        state.vault = normalized;
        state.bundle = await KeyronSaveEngine.stageBundle(state.bundle, 'vault-security-upgrade');
        state.needsInitialPush = true;
        toast('Proteções de integridade e vínculo com a conta Google foram atualizadas.', 'success', 5000);
      } else {
        state.key = result.key;
        state.vault = normalized;
      }

      KeyronSaveEngine.initialize(state.bundle);
      state.failedAttempts = 0;
      el.masterError.textContent = '';
      openApplication();
      if (state.needsInitialPush && state.googleVerified) scheduleDriveSync(50);
    } catch (error) {
      console.error(error);
      state.failedAttempts += 1;
      state.key = null;
      state.vault = null;
      if (error.message === 'UNSUPPORTED_FORMAT') {
        el.masterError.textContent = 'Este arquivo usa uma versão de cofre ainda não suportada.';
      } else if (error.message === 'ACCOUNT_MISMATCH') {
        el.masterError.textContent = 'Este cofre está vinculado a outra conta Google. Troque para a conta correta.';
      } else if (error.message === 'OFFLINE_AUTHORIZATION_INVALID') {
        el.masterError.textContent = 'A autorização offline deste aparelho expirou, foi removida ou não confere mais. Verifique o Google novamente.';
      } else if (error.message === 'OFFLINE_LEGACY_UNSUPPORTED') {
        el.masterError.textContent = 'Este cofre precisa de uma atualização de segurança online antes do primeiro acesso offline.';
      } else if (error.message === 'INVALID_BUNDLE_INTEGRITY') {
        el.masterError.textContent = 'O arquivo cifrado foi alterado ou corrompido. O Keyron bloqueou a abertura.';
      } else {
        el.masterError.textContent = 'Senha mestra incorreta ou arquivo de cofre inválido.';
      }
    } finally {
      el.masterPassword.value = '';
      setBusy(false);
    }
  }

  function openApplication() {
    document.body.dataset.screen = 'app';
    document.body.dataset.accessMode = 'app';
    document.body.classList.remove('biometric-first');
    document.body.classList.add('vault-entering');
    el.accessShell.hidden = true;
    el.appScreen.hidden = false;
    state.collapsedColumns = new Set(state.vault.columns.map((c) => c.id));
    renderAll();
    resetAutoLockTimer();
    setSyncStatus(state.offlineAuthorized ? 'trusted' : (state.needsInitialPush ? (KeyronDrive.isConnected() ? 'pending' : 'offline') : (KeyronDrive.isConnected() ? 'synced' : 'offline')));
    setTimeout(() => document.body.classList.remove('vault-entering'), 760);
    setTimeout(() => el.search.focus(), 180);
    setTimeout(() => scheduleWeeklyBreachCheck(), 1200);

    setTimeout(() => {
      const glyph = $('.lock-glyph', el.lockBtn);
      glyph?.classList.add('is-unlocking');
      setTimeout(() => glyph?.classList.remove('is-unlocking'), 700);
    }, 120);

    if (state.pendingRecoveryReveal) {
      const code = state.pendingRecoveryReveal;
      state.pendingRecoveryReveal = null;
      setTimeout(() => showRecoveryCodeReveal(code), 820);
    }
  }

  function handleLockClick() {
    const glyph = $('.lock-glyph', el.lockBtn);
    glyph?.classList.remove('is-unlocking');
    glyph?.classList.add('is-locking');
    setTimeout(() => glyph?.classList.remove('is-locking'), 420);
    setTimeout(() => { lockVault().catch(() => null); }, 160);
  }

  async function clearOwnedClipboard() {
    const owned = state.clipboardValue;
    state.clipboardValue = null;
    if (!owned || !navigator.clipboard) return;
    try {
      const current = await navigator.clipboard.readText();
      if (current === owned) await navigator.clipboard.writeText('');
    } catch { /* permissões de leitura podem ser negadas; o temporizador continua best-effort */ }
  }

  function scrubSensitiveUi() {
    [
      el.masterPassword, el.masterConfirm, el.recoveryCodeInput, el.recoveryNewPassword,
      el.recoveryNewPasswordConfirm, el.cpCurrent, el.cpNew, el.cpConfirm,
      el.biometricConfirmPassword, el.fName, el.fUsername, el.fEmail, el.fPassword,
      el.fUrl, el.fSecret, el.fNotes, el.search
    ].forEach((input) => { if (input) input.value = ''; });
    if (el.recoveryCodeValue) el.recoveryCodeValue.textContent = '';
    [el.board, el.filterStrip, el.activityList, el.categoryList, el.importConflicts, el.logoPreview].forEach((node) => node?.replaceChildren());
    if (el.vaultSummary) el.vaultSummary.textContent = '';
    if (el.vaultLastActivity) el.vaultLastActivity.textContent = '';
    state.pendingRecoveryDek = null;
    state.pendingRecoveryReveal = null;
    state.pendingImportBundle = null;
    state.preImportBundle = null;
    state.pendingCsvImport = null;
    state.pendingLogo = null;
  }

  async function lockVault({ signOut = false } = {}) {
    clearTimeout(state.autoLockTimer);
    clearTimeout(state.clipboardTimer);
    clearTimeout(state.hiddenLockTimer);
    state.hiddenAt = 0;
    const clipboardClear = clearOwnedClipboard();
    closeAllDialogs();

    // Bloqueio visual e descarte das referências legíveis acontecem antes de qualquer
    // espera de rede/IndexedDB. A persistência continua somente com bundles cifrados.
    state.key = null;
    state.vault = null;
    state.editingEntryId = null;
    state.editingColumnId = null;
    state.pendingLogo = null;
    scrubSensitiveUi();

    await clipboardClear;
    await KeyronSaveEngine.flush(1200).catch(() => null);
    if (state.needsInitialPush && KeyronDrive.isConnected()) {
      await Promise.race([syncToDrive(), new Promise((resolve) => setTimeout(resolve, 1400))]).catch(() => null);
    }

    if (signOut) {
      KeyronDrive.disconnect();
      state.googleVerified = false;
      state.googleUser = null;
      state.forceAccountChoiceNext = true;
      showGoogleStep();
      el.googleState.textContent = 'Aguardando verificação do Google.';
    } else if (state.googleVerified && KeyronDrive.isConnected()) {
      configureMasterStep('unlock');
      showMasterStep();
    } else if (state.offlineAuthorized && await authorizeOfflineSession('lock')) {
      // authorizeOfflineSession já exibiu a etapa de senha mestra.
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
        KeyronOfflineAccess.advance(bundle, KeyronSaveEngine.deviceId)
          .then((authorization) => { state.offlineAuthorization = authorization; })
          .catch(() => null);
      }
    });

    state.bundle = result.bundle;
    state.needsInitialPush = true;
    setSyncStatus(state.offlineAuthorized ? 'trusted' : (KeyronDrive.isConnected() ? 'pending' : 'offline'));
    if (state.googleVerified) scheduleDriveSync();
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
            clearOfflineSession();
            state.googleVerified = true;
            state.googleUser = profile || KeyronDrive.getCurrentUser?.() || null;
            if (state.bundle && !(await belongsToCurrentGoogleAccount(state.bundle))) {
              KeyronDrive.disconnect();
              state.googleVerified = false;
              state.googleUser = null;
              await lockVault({ signOut: true });
              toast('A reconexão abriu outra conta Google. O Keyron bloqueou a sincronização.', 'error', 7000);
              return;
            }
            const remote = await KeyronDrive.loadBundle();
            if (remote?.bundle && !(await belongsToCurrentGoogleAccount(remote.bundle))) throw new Error('REMOTE_ACCOUNT_MISMATCH');
            const previousOperation = String(state.bundle?.operationId || '');
            const chosen = await chooseBundle(remote);
            state.bundle = chosen;
            KeyronSaveEngine.initialize(chosen);
            const chosenOperation = String(chosen?.operationId || '');
            if (chosen && chosenOperation !== previousOperation) {
              state.key = null;
              state.vault = null;
              configureMasterStep('unlock');
              showMasterStep();
              toast('A reconexão encontrou outra versão válida do cofre. A sobrescrita automática foi bloqueada e a versão escolhida precisa ser desbloqueada novamente.', 'warning', 7000);
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

  async function handleDriveConflict(localBundle) {
    try {
      await KeyronStorage.saveRecovery(localBundle).catch(() => null);
      await KeyronDrive.createSnapshot(localBundle, { conflict: true }).catch(() => null);
      const remoteInfo = await KeyronDrive.reloadBundle();
      const remote = safeEncryptedBundle(remoteInfo?.bundle);
      if (!remote) throw new Error('DRIVE_CONFLICT_REMOTE_MISSING');
      if (!(await belongsToCurrentGoogleAccount(remote))) throw new Error('REMOTE_ACCOUNT_MISMATCH');

      await KeyronSaveEngine.discardPending();
      await KeyronStorage.saveCurrent(remote);
      state.bundle = remote;
      state.key = null;
      state.vault = null;
      state.needsInitialPush = false;
      state.lastRemoteRevision = Number(remote.revision || 0);
      KeyronSaveEngine.initialize(remote);
      configureMasterStep('unlock');
      showMasterStep();
      setSyncStatus('synced');
      toast('Conflito entre dispositivos bloqueado. A versão local foi preservada em Backups e a versão atual do Drive precisa ser desbloqueada novamente.', 'warning', 8500);
      return true;
    } catch (error) {
      console.error('[Keyron] falha ao tratar conflito', error);
      return false;
    }
  }

  async function syncToDrive() {
    if (!state.bundle || !state.googleVerified || !KeyronDrive.isConnected()) {
      setSyncStatus(state.offlineAuthorized ? 'trusted' : (state.needsInitialPush ? 'offline' : 'synced'));
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
      if (error?.code === 'DRIVE_CONFLICT') {
        const handled = await handleDriveConflict(state.bundle);
        state.needsInitialPush = !handled;
        if (!handled) {
          setSyncStatus('error');
          scheduleSyncRetry();
        }
      } else {
        state.needsInitialPush = true;
        setSyncStatus('error');
        scheduleSyncRetry();
        if (state.syncRetryCount <= 1) {
          toast('A alteração já está protegida e cifrada neste dispositivo. O Keyron tentará confirmar no Drive novamente.', 'warning', 5200);
        }
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

    const uncategorizedCount = state.vault.entries.filter((entry) => !entry.categoryId).length;
    if (uncategorizedCount > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip filter-chip--uncategorized${state.activeCategoryId === KeyronVault.UNCATEGORIZED ? ' is-active' : ''}`;
      button.dataset.categoryId = KeyronVault.UNCATEGORIZED;
      button.textContent = `Sem categoria (${uncategorizedCount})`;
      el.filterStrip.appendChild(button);
    }
  }

  function computeBoardTrackCount() {
    const columnCount = state.vault.columns.length;
    const pref = state.vault.preferences?.boardColumns || 'auto';
    if (pref !== 'auto') return Math.max(1, Math.min(Number(pref), columnCount));
    const width = el.board.clientWidth || window.innerWidth;
    const minTrackWidth = 260;
    const gap = 14;
    const estimate = Math.floor((width + gap) / (minTrackWidth + gap));
    return Math.max(1, Math.min(estimate, columnCount));
  }

  function buildColumnSection(column, categories, query) {
    const allColumnEntries = state.vault.entries.filter((entry) => entry.columnId === column.id);
    const visibleEntries = allColumnEntries.filter((entry) => KeyronVault.matches(entry, query, state.activeCategoryId, categories));
    const filterActive = Boolean(query || state.activeCategoryId);
    const isCollapsed = !filterActive && state.collapsedColumns.has(column.id);
    const section = document.createElement('section');
    section.className = `vault-column${isCollapsed ? ' is-collapsed' : ''}`;
    section.dataset.columnId = column.id;

    const head = document.createElement('div');
    head.className = 'column-head';
    head.draggable = true;
    head.title = 'Arraste para reorganizar a gaveta';
    const collapseBtn = columnAction('', 'column-collapse', isCollapsed ? 'Expandir gaveta' : 'Retrair gaveta');
    collapseBtn.classList.add('column-collapse-btn');
    collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
    collapseBtn.innerHTML = '<svg class="column-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>';
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
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .forEach((entry) => body.appendChild(createCredentialCard(entry, categories.get(entry.categoryId))));
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'column-add';
    add.dataset.action = 'entry-add-column';
    add.textContent = '+ Adicionar nesta gaveta';
    section.append(head, body, add);
    return section;
  }

  function renderBoard() {
    el.board.replaceChildren();
    const hasEntries = state.vault.entries.length > 0;
    el.emptyVault.hidden = hasEntries;
    el.board.hidden = false;

    const categories = new Map(state.vault.categories.map((category) => [category.id, category]));
    const query = el.search.value;
    const sections = state.vault.columns.map((column) => buildColumnSection(column, categories, query));

    const isMobileLayout = window.matchMedia('(max-width: 720px)').matches;
    if (isMobileLayout) {
      sections.forEach((section) => el.board.appendChild(section));
    } else {
      const trackCount = computeBoardTrackCount();
      const tracks = Array.from({ length: trackCount }, () => {
        const track = document.createElement('div');
        track.className = 'board-track';
        return track;
      });
      sections.forEach((section, index) => tracks[index % trackCount].appendChild(section));
      tracks.forEach((track) => el.board.appendChild(track));
    }

    if (el.collapseAll) {
      const anyExpanded = state.vault.columns.some((c) => !state.collapsedColumns.has(c.id));
      el.collapseAll.classList.toggle('is-all-collapsed', !anyExpanded);
      el.collapseAll.setAttribute('aria-expanded', String(anyExpanded));
      el.collapseAll.querySelector('.btn-label').textContent = anyExpanded ? 'Retrair tudo' : 'Expandir tudo';
      el.collapseAll.hidden = state.vault.columns.length < 2;
    }
  }

  function columnAction(label, action, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = title;
    button.textContent = label;
    button.draggable = false;
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

  function captureEntryDialogScroll(entry) {
    state.entryDialogScroll = entry ? {
      x: window.scrollX,
      y: window.scrollY,
      boardLeft: el.board.scrollLeft
    } : null;
  }

  function restoreEntryDialogScroll() {
    const saved = state.entryDialogScroll;
    if (!saved) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ left: saved.x, top: saved.y, behavior: 'auto' });
      el.board.scrollLeft = saved.boardLeft;
    }));
  }

  function openEntryDialog(entryId = null, preferredColumnId = null) {
    const entry = entryId ? state.vault.entries.find((item) => item.id === entryId) : null;
    captureEntryDialogScroll(entry);
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
      restoreEntryDialogScroll();
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
    restoreEntryDialogScroll();
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
    if (action === 'column-collapse') {
      if (state.collapsedColumns.has(columnId)) state.collapsedColumns.delete(columnId);
      else state.collapsedColumns.add(columnId);
      renderBoard();
      return;
    }
    try {
      if (action === 'column-edit') return openColumnDialog(columnId);
      if (action === 'column-delete') {
        const confirmed = await askConfirm({ title: 'Excluir gaveta', message: `Excluir a gaveta “${column.name}”? Ela precisa estar vazia.`, confirmLabel: 'Excluir', kind: 'danger', kicker: 'ORGANIZAÇÃO' });
        if (!confirmed) return;
        KeyronVault.deleteColumn(state.vault, columnId);
        state.collapsedColumns.delete(columnId);
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

  function activateSettingsSection(name, { scroll = true } = {}) {
    const target = name || 'security';
    $$('[data-settings-section]', el.settingsNav).forEach((button) => button.classList.toggle('is-active', button.dataset.settingsSection === target));
    $$('[data-settings-panel]', el.settingsContent).forEach((panel) => panel.classList.toggle('is-active', panel.dataset.settingsPanel === target));
    if (scroll) el.settingsContent.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderBreachResults() {
    if (!el.breachResults || !state.vault) return;
    const audit = state.vault.securityAudit || { results: [] };
    const byId = new Map(state.vault.entries.map((entry) => [entry.id, entry]));
    const exposed = (audit.results || []).filter((result) => Number(result.count) > 0 && byId.has(result.entryId)).sort((a, b) => b.count - a.count);
    el.breachResults.replaceChildren();
    if (!audit.lastBreachCheckAt) {
      el.breachLastCheck.textContent = 'Ainda não verificado.';
      return;
    }
    el.breachLastCheck.textContent = `Última verificação: ${formatFullDateTime(audit.lastBreachCheckAt)}.`;
    if (!exposed.length) {
      const safe = document.createElement('div');
      safe.className = 'breach-safe';
      safe.textContent = '✓ Nenhuma senha do cofre foi encontrada na base consultada.';
      el.breachResults.appendChild(safe);
      return;
    }
    for (const result of exposed) {
      const entry = byId.get(result.entryId);
      const row = document.createElement('div');
      row.className = 'breach-result';
      const info = document.createElement('div');
      info.className = 'breach-result-info';
      const name = document.createElement('b');
      name.textContent = entry.name;
      const count = document.createElement('span');
      count.textContent = `${Number(result.count).toLocaleString('pt-BR')} ocorrência(s) conhecida(s)`;
      info.append(name, count);
      const fixBtn = document.createElement('button');
      fixBtn.type = 'button';
      fixBtn.className = 'btn btn--ghost breach-fix-btn';
      fixBtn.textContent = 'Alterar agora';
      fixBtn.addEventListener('click', () => openBreachFix(entry.id));
      row.append(info, fixBtn);
      el.breachResults.appendChild(row);
    }
  }

  function openBreachFix(entryId) {
    el.settingsDialog.close();
    openEntryDialog(entryId);
    toast('Essa é a senha exposta. Gere uma nova ou edite antes de salvar.', 'info', 5000);
    setTimeout(() => {
      setPasswordVisibility(el.fPassword, el.togglePassword, true);
      el.fPassword.focus();
      el.fPassword.select();
    }, 90);
  }

  function renderSettings() {
    if (!state.vault || !state.bundle) return;
    el.autoLock.value = String(state.vault.preferences?.autoLockMinutes || 5);
    el.clipboard.value = String(state.vault.preferences?.clipboardClearSeconds || 20);
    el.boardColumns.value = String(state.vault.preferences?.boardColumns || 'auto');
    el.breachWeekly.checked = state.vault.preferences?.breachCheckWeekly !== false;
    const bytes = new Blob([JSON.stringify(state.bundle)]).size;
    el.storageInfo.textContent = `Cofre cifrado neste dispositivo: ${formatBytes(bytes)}`;
    renderActivity();
    renderBreachResults();
    renderRecoveryStatus();
    refreshBiometricSettingsUI();
    refreshOfflineAccessSettingsUI();
    populateCsvImportColumn();
    el.cpError.textContent = '';
  }

  async function runBreachCheck({ automatic = false } = {}) {
    if (state.breachScanInFlight || !state.vault) return;
    const passwordEntries = state.vault.entries.filter((entry) => entry.password);
    if (!passwordEntries.length) {
      if (!automatic) toast('Não há senhas salvas para verificar.', 'info');
      return;
    }
    if (navigator.onLine === false) {
      if (!automatic) toast('Conecte-se à internet para consultar a base de vazamentos.', 'warning');
      return;
    }

    state.breachScanInFlight = true;
    if (el.breachCheckBtn) {
      el.breachCheckBtn.disabled = true;
      el.breachCheckBtn.textContent = 'Verificando…';
    }
    if (el.breachStatus) el.breachStatus.textContent = `Preparando ${passwordEntries.length} senha(s) localmente…`;
    try {
      const results = await KeyronBreachCheck.checkEntries(passwordEntries, ({ completed, total }) => {
        if (el.breachStatus) el.breachStatus.textContent = `Consultando blocos anônimos: ${completed}/${total}…`;
      });
      const checkedAt = new Date().toISOString();
      KeyronVault.setSecurityAudit(state.vault, results, checkedAt);
      await persistVault({ render: false, reason: 'security-breach-check' });
      renderSettings();
      const exposed = results.filter((result) => result.count > 0).length;
      if (el.breachStatus) el.breachStatus.textContent = exposed ? `${exposed} credencial(is) precisam de atenção.` : 'Verificação concluída sem ocorrências conhecidas.';
      if (!automatic) toast(exposed ? 'Há senhas encontradas em vazamentos. Troque-as o quanto antes.' : 'Nenhuma senha foi encontrada na base consultada.', exposed ? 'warning' : 'success', 5200);
    } catch (error) {
      console.error(error);
      if (el.breachStatus) el.breachStatus.textContent = 'A base de vazamentos não respondeu. Nenhuma senha completa foi enviada.';
      if (!automatic) toast('Não foi possível concluir a verificação agora.', 'error');
    } finally {
      state.breachScanInFlight = false;
      if (el.breachCheckBtn) {
        el.breachCheckBtn.disabled = false;
        el.breachCheckBtn.textContent = 'Verificar agora';
      }
    }
  }

  function scheduleWeeklyBreachCheck() {
    if (!state.vault?.preferences?.breachCheckWeekly) return;
    if (!KeyronBreachCheck.isWeeklyDue(state.vault.securityAudit?.lastBreachCheckAt)) return;
    runBreachCheck({ automatic: true });
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

  function formatOfflineExpiry(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'data indisponível';
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function refreshOfflineAccessSettingsUI() {
    if (!el.offlineAccessSection) return;
    // A opção nunca some silenciosamente: em navegadores incompatíveis o usuário
    // vê a explicação em vez de concluir que o recurso não foi implementado.
    el.offlineAccessSection.hidden = false;
    const available = Boolean(KeyronConfig.ALLOW_TRUSTED_OFFLINE_ACCESS !== false && globalThis.KeyronOfflineAccess?.supported?.());
    if (el.offlineAccessUnavailable) el.offlineAccessUnavailable.hidden = available;
    if (!available || !state.bundle) {
      el.offlineAccessEnableRow.hidden = true;
      el.offlineAccessActiveRow.hidden = true;
      return;
    }
    if (!el.offlineDeviceLabel.value) el.offlineDeviceLabel.value = defaultDeviceLabel();
    const status = await KeyronOfflineAccess.status(state.bundle, KeyronSaveEngine.deviceId);
    const active = Boolean(status.authorized);
    el.offlineAccessEnableRow.hidden = active;
    el.offlineAccessActiveRow.hidden = !active;
    el.offlineAccessError.textContent = '';
    el.offlineConfirmPassword.value = '';
    if (active) {
      el.offlineAccessStatusText.textContent = `${status.deviceLabel} autorizado`;
      el.offlineAccessDetails.textContent = `Válido até ${formatOfflineExpiry(status.expiresAt)}. A sincronização continua exigindo Google.`;
      el.offlineDeviceLabel.value = status.deviceLabel;
      state.offlineAuthorization = status;
    }
  }

  async function enableOfflineAccess() {
    if (!state.googleVerified || !KeyronDrive.isConnected()) {
      el.offlineAccessError.textContent = 'Verifique sua conta Google antes de autorizar este aparelho.';
      return;
    }
    const password = el.offlineConfirmPassword.value;
    if (!password) {
      el.offlineAccessError.textContent = 'Digite sua senha mestra para confirmar.';
      return;
    }
    el.offlineAccessEnableBtn.disabled = true;
    el.offlineAccessError.textContent = '';
    try {
      await KeyronCrypto.unlockBundle(password, state.bundle);
      const ownerBinding = await currentAccountBinding();
      if (!ownerBinding || ownerBinding !== state.bundle.ownerBinding) throw new Error('ACCOUNT_MISMATCH');
      await KeyronOfflineAccess.enroll({
        vaultId: state.bundle.vaultId,
        ownerBinding,
        deviceId: KeyronSaveEngine.deviceId,
        deviceLabel: el.offlineDeviceLabel.value || defaultDeviceLabel(),
        operationId: state.bundle.operationId,
        revision: Number(state.bundle.revision),
        trustDays: KeyronConfig.OFFLINE_TRUST_DAYS
      });
      el.offlineConfirmPassword.value = '';
      await refreshOfflineAccessSettingsUI();
      toast('Acesso offline autorizado somente neste aparelho por 30 dias.', 'success', 5600);
    } catch (error) {
      console.error(error);
      const messages = {
        ACCOUNT_MISMATCH: 'A conta Google atual não confere com o cofre.',
        OFFLINE_ACCESS_UNAVAILABLE: 'Este navegador não oferece armazenamento seguro compatível.',
        OFFLINE_ACCESS_KEY_CREATION_FAILED: 'Não foi possível criar a chave local não exportável.'
      };
      el.offlineAccessError.textContent = messages[error.message] || 'Senha mestra incorreta ou autorização local indisponível.';
    } finally {
      el.offlineAccessEnableBtn.disabled = false;
    }
  }

  async function refreshOfflineAccess() {
    if (!state.googleVerified || !KeyronDrive.isConnected()) {
      toast('Verifique sua conta Google para revalidar este aparelho.', 'warning');
      return;
    }
    el.offlineAccessRefreshBtn.disabled = true;
    try {
      const ownerBinding = await currentAccountBinding();
      if (!ownerBinding || ownerBinding !== state.bundle.ownerBinding) throw new Error('ACCOUNT_MISMATCH');
      await KeyronOfflineAccess.refresh({
        vaultId: state.bundle.vaultId,
        ownerBinding,
        deviceId: KeyronSaveEngine.deviceId,
        deviceLabel: el.offlineDeviceLabel.value || defaultDeviceLabel(),
        operationId: state.bundle.operationId,
        revision: Number(state.bundle.revision),
        trustDays: KeyronConfig.OFFLINE_TRUST_DAYS
      });
      await refreshOfflineAccessSettingsUI();
      toast('Autorização offline revalidada por mais 30 dias.', 'success');
    } catch (error) {
      console.error(error);
      toast('Não foi possível revalidar. Remova e autorize este aparelho novamente.', 'error', 5200);
    } finally {
      el.offlineAccessRefreshBtn.disabled = false;
    }
  }

  async function disableOfflineAccess() {
    const confirmed = await askConfirm({
      title: 'Remover acesso offline',
      message: 'Este aparelho voltará a exigir o Google antes de mostrar a senha mestra. O cofre cifrado local não será apagado.',
      confirmLabel: 'Remover autorização',
      kind: 'danger',
      kicker: 'DISPOSITIVO CONFIÁVEL'
    });
    if (!confirmed) return;
    await KeyronOfflineAccess.revoke(state.vault.id);
    clearOfflineSession();
    await refreshOfflineAccessSettingsUI();
    toast('Acesso offline removido deste aparelho.', 'info');
  }

  async function savePreferences() {
    state.vault.preferences = {
      ...state.vault.preferences,
      autoLockMinutes: Number(el.autoLock.value),
      clipboardClearSeconds: Number(el.clipboard.value),
      boardColumns: el.boardColumns.value,
      breachCheckWeekly: el.breachWeekly.checked
    };
    renderBoard();
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
    if (!state.googleVerified || !KeyronDrive.isConnected()) {
      toast('A importação de um cofre exige verificação Google para vincular o arquivo à conta correta.', 'warning', 5600);
      el.importInput.value = '';
      return;
    }
    try {
      const maxBytes = Number(KeyronConfig.MAX_BUNDLE_BYTES || 67108864);
      if (file.size > maxBytes) throw new Error('BUNDLE_TOO_LARGE');
      const text = await file.text();
      if (text.length > maxBytes) throw new Error('BUNDLE_TOO_LARGE');
      const candidate = JSON.parse(text);
      KeyronCrypto.assertValidBundle(candidate);
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
      const sourceBundle = state.pendingImportBundle;
      const result = await KeyronCrypto.unlockBundle(password, sourceBundle);
      const vault = KeyronVault.normalize(result.vault);
      const ownerAccountId = googleAccountIdentifier();
      if (!state.googleVerified || !ownerAccountId) throw new Error('GOOGLE_REQUIRED_FOR_IMPORT');
      const expectedBinding = await KeyronCrypto.hashAccountIdentifier(ownerAccountId);
      let bundle = sourceBundle;
      let key = result.key;

      if (result.legacy || !bundle.wrappedKey) {
        const migrated = await KeyronCrypto.rekeyBundle(password, vault, vault.id, {
          ownerAccountId,
          deviceId: KeyronSaveEngine.deviceId,
          saveReason: 'vault-import-migration'
        });
        bundle = migrated.bundle;
        key = migrated.key;
        if (migrated.recoveryCode) state.pendingRecoveryReveal = migrated.recoveryCode;
      } else if (Number(bundle.formatVersion || 0) < KeyronCrypto.FORMAT_VERSION ||
          !result.metadataProtected ||
          result.iterations < KeyronCrypto.CURRENT_ITERATIONS ||
          bundle.ownerBinding !== expectedBinding) {
        bundle = result.iterations < KeyronCrypto.CURRENT_ITERATIONS
          ? await KeyronCrypto.changePassword(key, password, bundle, {
              ownerAccountId,
              deviceId: KeyronSaveEngine.deviceId,
              saveReason: 'vault-import-upgrade'
            })
          : await KeyronCrypto.rebindOwner(key, bundle, vault, ownerAccountId, {
              deviceId: KeyronSaveEngine.deviceId,
              saveReason: 'vault-import-rebind'
            });
      }

      await KeyronStorage.saveRecovery(state.preImportBundle).catch(() => null);
      if (KeyronDrive.isConnected() && state.preImportBundle) await KeyronDrive.createSnapshot(state.preImportBundle).catch(() => null);
      await KeyronOfflineAccess.revoke(state.preImportBundle?.vaultId).catch(() => null);
      await KeyronOfflineAccess.revoke(bundle.vaultId).catch(() => null);
      clearOfflineSession();
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
        toast('Backup verificado, vinculado a esta conta e confirmado no Drive.', 'success', 5000);
      } catch (driveError) {
        console.error(driveError);
        if (driveError?.code === 'DRIVE_CONFLICT' && await handleDriveConflict(state.bundle)) return;
        setSyncStatus('error');
        scheduleSyncRetry();
        toast('Backup verificado e importado neste dispositivo. O Drive será atualizado novamente assim que responder.', 'warning', 6000);
      }
    } catch (error) {
      console.error(error);
      el.masterError.textContent = 'A senha não abriu este backup ou o arquivo não passou na verificação de integridade.';
    } finally {
      el.masterPassword.value = '';
      setBusy(false);
    }
  }

  // --- Importação inteligente de CSV (planilhas, outros gerenciadores) ---

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];

    const header = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1)
      .filter((cells) => cells.some((cell) => cell.trim() !== ''))
      .map((cells) => {
        const record = {};
        header.forEach((key, index) => { record[key] = (cells[index] || '').trim(); });
        return {
          name: record.name || record.site || record.nome || '',
          username: record.username || record.usuario || record['usuário'] || '',
          email: record.email || record['e-mail'] || '',
          password: record.password || record.senha || '',
          url: record.url || record.site_url || '',
          notes: record.notes || record.notas || record.observacoes || record['observações'] || ''
        };
      })
      .filter((entry) => entry.name);
  }

  function populateCsvImportColumn() {
    if (!el.csvImportColumn || !state.vault) return;
    const previous = el.csvImportColumn.value;
    el.csvImportColumn.replaceChildren();
    state.vault.columns.forEach((column, index) => {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = `${column.icon} ${column.name}`;
      option.selected = previous ? column.id === previous : index === state.vault.columns.length - 1;
      el.csvImportColumn.appendChild(option);
    });

    const previousCategory = el.csvImportCategory.value;
    el.csvImportCategory.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Sem categoria';
    el.csvImportCategory.appendChild(none);
    state.vault.categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      option.selected = category.id === previousCategory;
      el.csvImportCategory.appendChild(option);
    });
  }

  async function handleCsvFile(file) {
    if (!file) return;
    try {
      const maxBytes = Number(KeyronConfig.MAX_CSV_BYTES || 8388608);
      if (file.size > maxBytes) throw new Error('CSV_TOO_LARGE');
      const text = await file.text();
      const rows = parseCsv(text);
      const maxRows = Math.min(Number(KeyronConfig.MAX_CSV_ROWS || 10000), Math.max(0, 10000 - Number(state.vault?.entries?.length || 0)));
      if (rows.length > maxRows) throw new Error('CSV_TOO_MANY_ROWS');
      if (!rows.length) {
        toast('Não encontrei linhas válidas nesse CSV. Confira o cabeçalho esperado.', 'error', 5000);
        return;
      }
      const existingByName = new Map(state.vault.entries.map((entry) => [entry.name.trim().toLocaleLowerCase('pt-BR'), entry]));
      const toAdd = [];
      const skipped = [];
      const conflicts = [];
      for (const row of rows) {
        const key = row.name.trim().toLocaleLowerCase('pt-BR');
        const existing = existingByName.get(key);
        if (!existing) {
          toAdd.push(row);
        } else if ((existing.password || '') === (row.password || '')) {
          skipped.push(row);
        } else {
          conflicts.push({ existing, incoming: row, resolution: 'keep' });
        }
      }
      state.pendingCsvImport = { toAdd, skipped, conflicts, targetColumnId: el.csvImportColumn.value, targetCategoryId: el.csvImportCategory.value };
      renderImportReview();
      el.importReviewDialog.showModal();
    } catch (error) {
      console.error(error);
      if (error?.message === 'CSV_TOO_LARGE') {
        toast('Esse CSV é grande demais. O limite é 8 MB.', 'error', 5000);
      } else if (error?.message === 'CSV_TOO_MANY_ROWS') {
        toast('Esse CSV ultrapassa o limite seguro de 10.000 credenciais do cofre.', 'error', 5500);
      } else {
        toast('Não foi possível ler esse arquivo CSV.', 'error');
      }
    } finally {
      el.csvImportInput.value = '';
    }
  }

  function renderImportReview() {
    const plan = state.pendingCsvImport;
    if (!plan) return;
    const parts = [`${plan.toAdd.length} nova${plan.toAdd.length === 1 ? '' : 's'}`];
    if (plan.skipped.length) parts.push(`${plan.skipped.length} idêntica${plan.skipped.length === 1 ? '' : 's'} ignorada${plan.skipped.length === 1 ? '' : 's'}`);
    if (plan.conflicts.length) parts.push(`${plan.conflicts.length} com senha diferente`);
    el.importSummary.textContent = `${parts.join(' · ')}.`;

    el.importConflicts.replaceChildren();
    el.importConflictsBulk.hidden = plan.conflicts.length < 2;

    plan.conflicts.forEach((conflict, index) => {
      const row = document.createElement('div');
      row.className = 'import-conflict-row';
      row.dataset.index = String(index);

      const title = document.createElement('div');
      title.className = 'import-conflict-title';
      title.textContent = conflict.existing.name;

      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'text-button';
      reveal.textContent = 'ver senhas';
      reveal.addEventListener('click', () => {
        const shown = passwords.dataset.revealed === '1';
        passwords.dataset.revealed = shown ? '0' : '1';
        passwords.querySelector('.import-pw--keep').textContent = shown ? '••••••••' : (conflict.existing.password || '(vazia)');
        passwords.querySelector('.import-pw--incoming').textContent = shown ? '••••••••' : (conflict.incoming.password || '(vazia)');
        reveal.textContent = shown ? 'ver senhas' : 'ocultar senhas';
      });

      const passwords = document.createElement('div');
      passwords.className = 'import-conflict-passwords';
      passwords.dataset.revealed = '0';
      passwords.innerHTML = '<span>Atual: <code class="import-pw--keep">••••••••</code></span><span>Nova: <code class="import-pw--incoming">••••••••</code></span>';

      const options = document.createElement('div');
      options.className = 'import-conflict-options';
      [['keep', 'Manter atual'], ['incoming', 'Usar a nova'], ['both', 'Manter as duas']].forEach(([value, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pill-option${conflict.resolution === value ? ' is-active' : ''}`;
        btn.textContent = label;
        btn.dataset.value = value;
        btn.addEventListener('click', () => {
          conflict.resolution = value;
          options.querySelectorAll('.pill-option').forEach((node) => node.classList.toggle('is-active', node.dataset.value === value));
        });
        options.appendChild(btn);
      });

      row.append(title, reveal, passwords, options);
      el.importConflicts.appendChild(row);
    });
  }

  function applyCsvImport() {
    const plan = state.pendingCsvImport;
    if (!plan) return;
    const columnId = plan.targetColumnId && state.vault.columns.some((c) => c.id === plan.targetColumnId) ? plan.targetColumnId : state.vault.columns[state.vault.columns.length - 1].id;
    const categoryId = plan.targetCategoryId && state.vault.categories.some((c) => c.id === plan.targetCategoryId) ? plan.targetCategoryId : null;

    let added = 0;
    let replaced = 0;
    for (const row of plan.toAdd) {
      KeyronVault.addEntry(state.vault, { ...row, columnId, categoryId });
      added += 1;
    }
    for (const conflict of plan.conflicts) {
      if (conflict.resolution === 'incoming') {
        KeyronVault.updateEntry(state.vault, conflict.existing.id, { password: conflict.incoming.password, notes: conflict.incoming.notes || conflict.existing.notes });
        replaced += 1;
      } else if (conflict.resolution === 'both') {
        KeyronVault.addEntry(state.vault, { ...conflict.incoming, columnId, categoryId });
        added += 1;
      }
      // 'keep' não faz nada — a credencial atual permanece intacta.
    }

    state.pendingCsvImport = null;
    el.importReviewDialog.close();
    persistVault({ reason: 'csv-import' }).then(() => {
      toast(`Importação concluída: ${added} credencial${added === 1 ? '' : 'is'} adicionada${added === 1 ? '' : 's'}${replaced ? `, ${replaced} atualizada${replaced === 1 ? '' : 's'}` : ''}.`, 'success', 5500);
    });
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
      state.clipboardValue = value;
      toast(`${label} copiado.`, 'success');
      clearTimeout(state.clipboardTimer);
      const seconds = Math.max(5, Number(state.vault.preferences?.clipboardClearSeconds || 20));
      state.clipboardTimer = setTimeout(() => {
        clearOwnedClipboard().catch(() => null);
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

  async function hasValidImageSignature(file) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    return (file.type === 'image/png' && png) || (file.type === 'image/jpeg' && jpeg) || (file.type === 'image/webp' && webp);
  }

  async function processLogoFile(file) {
    if (!file) return null;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) throw new Error('UNSUPPORTED_IMAGE');
    if (file.size > Number(KeyronConfig.MAX_LOGO_BYTES || 4194304)) throw new Error('IMAGE_TOO_LARGE');
    if (!(await hasValidImageSignature(file))) throw new Error('INVALID_IMAGE_SIGNATURE');

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await image.decode();
      const sourceWidth = Number(image.naturalWidth || 0);
      const sourceHeight = Number(image.naturalHeight || 0);
      const maxSide = Number(KeyronConfig.MAX_LOGO_SIDE || 8192);
      const maxPixels = Number(KeyronConfig.MAX_LOGO_PIXELS || 25165824);
      if (!sourceWidth || !sourceHeight || sourceWidth > maxSide || sourceHeight > maxSide || sourceWidth * sourceHeight > maxPixels) {
        throw new Error('IMAGE_DIMENSIONS_TOO_LARGE');
      }
      const max = 512;
      const scale = Math.min(1, max / Math.max(sourceWidth, sourceHeight));
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

  const ACTIVITY_LABELS = { entry: 'Nova credencial', column: 'Nova gaveta', category: 'Nova categoria', security: 'Segurança' };

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
    document.body.classList.remove('settings-open');
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

  function clearDragVisuals() {
    document.body.classList.remove('keyron-dragging');
    document.body.classList.remove('keyron-dragging-column');
    $$('.credential-card.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    $$('.vault-column.is-dragover').forEach((node) => node.classList.remove('is-dragover'));
    $$('.vault-column.is-dragging-column').forEach((node) => node.classList.remove('is-dragging-column'));
    $$('.vault-column.is-dragover-column').forEach((node) => node.classList.remove('is-dragover-column'));
    $('.drop-indicator', el.board)?.remove();
    state.dragDropTarget = null;
    state.draggingEntryId = null;
    state.draggingColumnId = null;
    state.dragScrollVelocity = { x: 0, y: 0 };
    if (state.dragScrollFrame) cancelAnimationFrame(state.dragScrollFrame);
    state.dragScrollFrame = null;
  }

  function startDragScrollLoop() {
    if (state.dragScrollFrame) return;
    const step = () => {
      if (!state.draggingEntryId) {
        state.dragScrollFrame = null;
        return;
      }
      const { x, y } = state.dragScrollVelocity;
      if (x || y) window.scrollBy({ left: x, top: y, behavior: 'auto' });
      state.dragScrollFrame = requestAnimationFrame(step);
    };
    state.dragScrollFrame = requestAnimationFrame(step);
  }

  function updateDragAutoScroll(event) {
    const edge = 92;
    const maxSpeed = 22;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const axisSpeed = (position, limit) => {
      if (position < edge) return -Math.ceil(maxSpeed * (1 - Math.max(0, position) / edge));
      if (position > limit - edge) return Math.ceil(maxSpeed * (1 - Math.max(0, limit - position) / edge));
      return 0;
    };
    state.dragScrollVelocity = { x: axisSpeed(event.clientX, width), y: axisSpeed(event.clientY, height) };
    startDragScrollLoop();
  }

  function expandColumnDuringDrag(column) {
    if (!column.classList.contains('is-collapsed')) return;
    const columnId = column.dataset.columnId;
    state.collapsedColumns.delete(columnId);
    column.classList.remove('is-collapsed');
    const button = $('[data-action="column-collapse"]', column);
    if (button) {
      button.title = 'Retrair gaveta';
      button.setAttribute('aria-expanded', 'true');
    }
  }

  function updateDropIndicator(event, column) {
    expandColumnDuringDrag(column);
    const body = $('.column-body', column);
    if (!body) return;
    const cards = $$('.credential-card', body).filter((card) => card.dataset.entryId !== state.draggingEntryId);
    let targetIndex = cards.length;
    let beforeNode = null;
    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        targetIndex = index;
        beforeNode = cards[index];
        break;
      }
    }
    let indicator = $('.drop-indicator', el.board);
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      indicator.setAttribute('aria-hidden', 'true');
    }
    if (beforeNode) body.insertBefore(indicator, beforeNode);
    else body.appendChild(indicator);
    state.dragDropTarget = { columnId: column.dataset.columnId, index: targetIndex };
  }

  function handleDragWheel(event) {
    if (!state.draggingEntryId) return;
    event.preventDefault();
    event.stopPropagation();
    window.scrollBy({ left: event.deltaX, top: event.deltaY, behavior: 'auto' });
  }

  function bindEvents() {
    el.googleBtn.addEventListener('click', () => startGoogleVerification(state.forceAccountChoiceNext));
    el.masterForm.addEventListener('submit', handleMasterSubmit);
    el.masterPassword.addEventListener('input', updateMasterStrength);
    el.toggleMaster.addEventListener('click', () => togglePasswordVisibility(el.masterPassword, el.toggleMaster));
    el.biometricUnlockBtn.addEventListener('click', () => tryBiometricUnlock());
    el.forgotMasterBtn.addEventListener('click', () => showRecoveryStep());
    el.recoveryBackBtn.addEventListener('click', () => backToMasterFromRecovery());
    el.recoveryForm.addEventListener('submit', handleRecoverySubmit);
    el.recoveryNewPassword.addEventListener('input', updateRecoveryStrength);
    el.recoveryToggleNew.addEventListener('click', () => togglePasswordVisibility(el.recoveryNewPassword, el.recoveryToggleNew));
    el.recoveryRevealAck.addEventListener('change', () => {
      el.recoveryRevealClose.disabled = !el.recoveryRevealAck.checked;
    });
    el.recoveryRevealClose.addEventListener('click', () => el.recoveryRevealDialog.close());
    el.recoveryRevealDialog.addEventListener('cancel', (event) => event.preventDefault());
    el.recoveryCodeCopy.addEventListener('click', () => copyValue(el.recoveryCodeValue.textContent, 'Chave de recuperação'));
    el.recoveryRegenerateBtn.addEventListener('click', () => handleRecoveryRegenerate());
    el.backGoogle.addEventListener('click', () => {
      if (state.offlineAuthorized) {
        clearOfflineSession();
        showGoogleStep();
        if (navigator.onLine === false) el.googleState.textContent = 'Sem internet. A autorização offline continua salva; volte quando quiser ou aguarde a conexão.';
        return;
      }
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
      state.forceAccountChoiceNext = true;
      showGoogleStep();
    });

    el.addEntry.addEventListener('click', () => openEntryDialog());
    el.emptyAdd.addEventListener('click', () => openEntryDialog());
    el.addColumn.addEventListener('click', () => openColumnDialog());
    el.collapseAll.addEventListener('click', () => {
      const anyExpanded = state.vault.columns.some((c) => !state.collapsedColumns.has(c.id));
      if (anyExpanded) state.vault.columns.forEach((c) => state.collapsedColumns.add(c.id));
      else state.collapsedColumns.clear();
      renderBoard();
    });
    el.manageCategories.addEventListener('click', () => { renderCategoryDialog(); el.categoryDialog.showModal(); });
    el.settingsBtn.addEventListener('click', () => {
      document.body.classList.add('settings-open');
      el.settingsDialog.showModal();
      requestAnimationFrame(() => {
        renderSettings();
        activateSettingsSection('security', { scroll: false });
      });
    });
    el.settingsDialog.addEventListener('close', () => document.body.classList.remove('settings-open'));
    el.settingsNav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-settings-section]');
      if (button) activateSettingsSection(button.dataset.settingsSection);
    });
    el.breachCheckBtn.addEventListener('click', () => runBreachCheck());
    el.syncChip.addEventListener('click', reconnectOrSyncDrive);
    el.lockBtn.addEventListener('click', () => handleLockClick());
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
      if (card) {
        state.draggingEntryId = card.dataset.entryId;
        state.dragDropTarget = null;
        card.classList.add('is-dragging');
        document.body.classList.add('keyron-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-keyron-entry', card.dataset.entryId);
        event.dataTransfer.setData('text/plain', card.dataset.entryId);
        const rect = card.getBoundingClientRect();
        event.dataTransfer.setDragImage(card, Math.min(event.clientX - rect.left, rect.width - 1), Math.min(event.clientY - rect.top, rect.height - 1));
        return;
      }
      const head = event.target.closest('.column-head');
      const column = head?.closest('.vault-column');
      if (!column) return;
      state.draggingColumnId = column.dataset.columnId;
      column.classList.add('is-dragging-column');
      document.body.classList.add('keyron-dragging-column');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-keyron-column', column.dataset.columnId);
      event.dataTransfer.setData('text/plain', column.dataset.columnId);
    });
    el.board.addEventListener('dragend', clearDragVisuals);
    el.board.addEventListener('dragover', (event) => {
      if (state.draggingColumnId) {
        const column = event.target.closest('.vault-column');
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        $$('.vault-column.is-dragover-column').forEach((node) => { if (node !== column) node.classList.remove('is-dragover-column'); });
        if (column && column.dataset.columnId !== state.draggingColumnId) column.classList.add('is-dragover-column');
        return;
      }
      const column = event.target.closest('.vault-column');
      if (!column || !state.draggingEntryId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      $$('.vault-column.is-dragover').forEach((node) => { if (node !== column) node.classList.remove('is-dragover'); });
      column.classList.add('is-dragover');
      updateDropIndicator(event, column);
      updateDragAutoScroll(event);
    });
    el.board.addEventListener('dragleave', (event) => {
      const column = event.target.closest('.vault-column');
      if (!column) return;
      if (column.contains(event.relatedTarget)) return;
      column.classList.remove('is-dragover');
      column.classList.remove('is-dragover-column');
    });
    el.board.addEventListener('drop', async (event) => {
      if (state.draggingColumnId) {
        const column = event.target.closest('.vault-column');
        event.preventDefault();
        const draggedId = state.draggingColumnId;
        clearDragVisuals();
        if (!column || column.dataset.columnId === draggedId) return;
        const targetIndex = state.vault.columns.findIndex((item) => item.id === column.dataset.columnId);
        if (targetIndex < 0) return;
        KeyronVault.reorderColumn(state.vault, draggedId, targetIndex);
        await persistVault({ reason: 'column-reorder' });
        renderBoard();
        return;
      }
      const column = event.target.closest('.vault-column');
      if (!column || !state.draggingEntryId) return;
      event.preventDefault();
      const entryId = state.draggingEntryId || event.dataTransfer.getData('application/x-keyron-entry') || event.dataTransfer.getData('text/plain');
      const entry = state.vault.entries.find((item) => item.id === entryId);
      const target = state.dragDropTarget || {
        columnId: column.dataset.columnId,
        index: state.vault.entries.filter((item) => item.columnId === column.dataset.columnId && item.id !== entryId).length
      };
      if (!entry) {
        clearDragVisuals();
        return;
      }
      const previousColumnId = entry.columnId;
      KeyronVault.reorderEntry(state.vault, entryId, target.columnId, target.index);
      clearDragVisuals();
      await persistVault({ reason: 'entry-reorder' });
      toast(previousColumnId === target.columnId ? `“${entry.name}” foi reordenada.` : `“${entry.name}” foi movida para outra gaveta.`, 'success');
    });
    window.addEventListener('wheel', handleDragWheel, { passive: false, capture: true });

    el.entryDialog.addEventListener('close', restoreEntryDialogScroll);
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
        const message = error.message === 'IMAGE_TOO_LARGE'
          ? 'A imagem pode ter no máximo 4 MB.'
          : error.message === 'IMAGE_DIMENSIONS_TOO_LARGE'
            ? 'A imagem tem dimensões grandes demais para ser processada com segurança.'
            : 'Use uma imagem PNG, JPG ou WebP válida.';
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
    el.boardColumns.addEventListener('change', savePreferences);
    el.breachWeekly.addEventListener('change', savePreferences);
    el.cpForm.addEventListener('submit', handleChangePasswordSubmit);
    el.cpNew.addEventListener('input', updateChangePasswordStrength);
    el.cpToggleCurrent.addEventListener('click', () => togglePasswordVisibility(el.cpCurrent, el.cpToggleCurrent));
    el.cpToggleNew.addEventListener('click', () => togglePasswordVisibility(el.cpNew, el.cpToggleNew));
    el.cpToggleConfirm.addEventListener('click', () => togglePasswordVisibility(el.cpConfirm, el.cpToggleConfirm));
    el.exportBtn.addEventListener('click', exportBundle);
    el.importBtn.addEventListener('click', () => el.importInput.click());
    el.importInput.addEventListener('change', () => prepareImport(el.importInput.files?.[0]));
    el.csvImportBtn.addEventListener('click', () => el.csvImportInput.click());
    el.csvImportInput.addEventListener('change', () => handleCsvFile(el.csvImportInput.files?.[0]));
    el.importApplyBtn.addEventListener('click', applyCsvImport);
    el.importReviewDialog.addEventListener('close', () => { state.pendingCsvImport = null; });
    el.importConflictsBulk.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-bulk]');
      if (!button || !state.pendingCsvImport) return;
      state.pendingCsvImport.conflicts.forEach((conflict) => { conflict.resolution = button.dataset.bulk; });
      renderImportReview();
    });
    el.backupNow.addEventListener('click', createDriveSnapshot);
    el.signout.addEventListener('click', () => lockVault({ signOut: true }).catch(() => null));
    el.biometricEnableBtn.addEventListener('click', enableBiometric);
    el.biometricConfirmPassword.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); enableBiometric(); } });
    el.biometricDisableBtn.addEventListener('click', disableBiometric);
    el.offlineAccessEnableBtn.addEventListener('click', enableOfflineAccess);
    el.offlineConfirmPassword.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); enableOfflineAccess(); } });
    el.offlineAccessRefreshBtn.addEventListener('click', refreshOfflineAccess);
    el.offlineAccessDisableBtn.addEventListener('click', disableOfflineAccess);

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
      clearTimeout(state.hiddenLockTimer);
      const seconds = Math.max(5, Number(KeyronConfig.HIDDEN_LOCK_SECONDS || 30));
      if (!document.hidden) {
        const hiddenFor = state.hiddenAt ? Date.now() - state.hiddenAt : 0;
        state.hiddenAt = 0;
        // Navegadores podem suspender timers em segundo plano. Ao retornar, o tempo
        // real oculto é conferido antes de permitir que o cofre continue aberto.
        if (state.key && hiddenFor >= seconds * 1000) {
          lockVault().catch(() => null);
          return;
        }
        if (state.key) resetAutoLockTimer();
        return;
      }
      state.hiddenAt = Date.now();
      KeyronSaveEngine.flush(900).catch(() => null);
      if (state.needsInitialPush && state.googleVerified) syncToDrive();
      if (state.key) {
        state.hiddenLockTimer = setTimeout(() => {
          if (document.hidden && state.key) {
            lockVault().catch(() => null);
          }
        }, seconds * 1000);
      }
    });

    window.addEventListener('online', () => {
      if (state.offlineAuthorized) {
        setSyncStatus('trusted');
        toast('Internet disponível. Verifique o Google pelo indicador de sincronização para comparar e enviar alterações.', 'info', 5200);
      } else if (state.needsInitialPush && state.googleVerified) scheduleDriveSync(50);
    });
    window.addEventListener('offline', () => {
      if (state.offlineAuthorized) setSyncStatus('trusted');
      else if (state.needsInitialPush) setSyncStatus('offline');
    });
    window.addEventListener('pagehide', (event) => {
      KeyronSaveEngine.flush(700).catch(() => null);
      // Páginas colocadas no BFCache podem manter a memória JavaScript viva. A chave
      // e o conteúdo legível são descartados imediatamente antes do congelamento.
      if (event.persisted && state.key) {
        clearTimeout(state.autoLockTimer);
        clearTimeout(state.clipboardTimer);
        clearTimeout(state.hiddenLockTimer);
        state.key = null;
        state.vault = null;
        scrubSensitiveUi();
        closeAllDialogs();
        if (state.googleVerified && KeyronDrive.isConnected()) {
          configureMasterStep('unlock');
          showMasterStep();
        } else if (state.offlineAuthorized) {
          configureMasterStep('unlock');
          showMasterStep();
        } else {
          showGoogleStep();
        }
      }
    });
    let boardResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(boardResizeTimer);
      boardResizeTimer = setTimeout(() => {
        if (state.vault && !el.appScreen.hidden) renderBoard();
      }, 180);
    });
  }

  async function init() {
    bindEvents();
    setPasswordVisibility(el.masterPassword, el.toggleMaster, false);
    setPasswordVisibility(el.fPassword, el.togglePassword, false);
    setPasswordVisibility(el.cpCurrent, el.cpToggleCurrent, false);
    setPasswordVisibility(el.cpNew, el.cpToggleNew, false);
    setPasswordVisibility(el.cpConfirm, el.cpToggleConfirm, false);
    const stored = safeEncryptedBundle(await KeyronStorage.loadCurrent());
    const pending = safeEncryptedBundle(await KeyronSaveEngine.loadPendingBundle());
    let usePending = Boolean(pending && !stored);
    if (pending && stored) {
      const sameVault = String(pending.vaultId || '') === String(stored.vaultId || '');
      const compatibleOwner = !pending.ownerBinding || !stored.ownerBinding || pending.ownerBinding === stored.ownerBinding;
      const pendingVersion = Number(pending.formatVersion || 0);
      const storedVersion = Number(stored.formatVersion || 0);
      if (sameVault && compatibleOwner && pendingVersion >= 4 && storedVersion >= 4) {
        usePending = pending.operationId === stored.operationId ||
          (Array.isArray(pending.ancestors) && pending.ancestors.includes(stored.operationId));
      } else if (sameVault && compatibleOwner && pendingVersion < 4 && storedVersion < 4) {
        usePending = Number(pending.revision || 0) > Number(stored.revision || 0) ||
          (Number(pending.revision || 0) === Number(stored.revision || 0) && parseTime(pending) >= parseTime(stored));
      }
      if (!usePending && pending.operationId !== stored.operationId) {
        await KeyronStorage.saveRecovery(pending).catch(() => null);
      }
    }
    state.bundle = usePending ? pending : stored;
    if (usePending) {
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
    const enteredOffline = navigator.onLine === false ? await authorizeOfflineSession('network-offline') : false;
    if (!enteredOffline) showGoogleStep();
    if (!configured() && !enteredOffline) el.googleState.textContent = 'Google OAuth não configurado. Abra CONFIGURACAO.md.';

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js?v=1.0.F-r5', { updateViaCache: 'none' })
        .then((registration) => registration.update().catch(() => null))
        .catch((error) => console.warn('Service Worker:', error));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      console.error(error);
      toast('O Keyron não conseguiu iniciar neste navegador.', 'error', 6000);
    });
  });
})();
