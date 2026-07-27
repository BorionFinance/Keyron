// app.js — Orquestra tudo: tela de bloqueio, cofre em memória, cache local
// (localStorage guarda só dados CIFRADOS), sincronização com o Drive,
// auto-lock e cópia pra área de transferência.

(() => {
  const LS_BUNDLE = 'borion_senhas_bundle';
  const LS_DRIVE_FILE_ID = 'borion_senhas_drive_file_id';
  const LS_SETTINGS = 'borion_senhas_settings';

  const DEFAULT_SETTINGS = { autoLockMinutes: 5, clipboardClearSeconds: 20 };

  // ---- Estado em memória (nada disto é persistido em texto puro) ----
  let cryptoKey = null;
  let currentVault = null;
  let localBundle = null; // metadados + dados cifrados (pode ficar em localStorage sem problema)
  let driveFileId = null;
  let dirty = false; // há alterações locais ainda não confirmadas no Drive
  let failedAttempts = 0;
  let autoLockTimer = null;
  let clipboardTimer = null;
  let editingEntryId = null;
  let settings = { ...DEFAULT_SETTINGS };

  // ---- Atalhos de DOM ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    lockScreen: $('#lock-screen'),
    appScreen: $('#app-screen'),
    lockTitle: $('#lock-title'),
    lockSubtitle: $('#lock-subtitle'),
    lockForm: $('#lock-form'),
    passwordInput: $('#master-password'),
    confirmGroup: $('#confirm-group'),
    confirmInput: $('#master-password-confirm'),
    lockError: $('#lock-error'),
    lockSubmit: $('#lock-submit'),
    forgotLink: $('#forgot-link'),
    driveConnectBtn: $('#drive-connect-btn'),
    driveStatus: $('#drive-status'),
    bolt: $('#vault-bolt'),
    searchInput: $('#search-input'),
    entryList: $('#entry-list'),
    emptyState: $('#empty-state'),
    addBtn: $('#add-entry-btn'),
    lockBtn: $('#lock-btn'),
    exportBtn: $('#export-btn'),
    syncIndicator: $('#sync-indicator'),
    toastArea: $('#toast-area'),
    modalBackdrop: $('#modal-backdrop'),
    entryForm: $('#entry-form'),
    modalTitle: $('#modal-title'),
    fName: $('#f-name'),
    fUsername: $('#f-username'),
    fEmail: $('#f-email'),
    fPassword: $('#f-password'),
    fUrl: $('#f-url'),
    fNotes: $('#f-notes'),
    fTotp: $('#f-totp'),
    togglePwBtn: $('#toggle-pw-visibility'),
    genPwBtn: $('#generate-pw-btn'),
    strengthBar: $('#strength-bar'),
    deleteEntryBtn: $('#delete-entry-btn'),
    cancelModalBtn: $('#cancel-modal-btn')
  };

  // ---------------------------------------------------------------------
  // Persistência local (tudo cifrado — ver crypto.js)
  // ---------------------------------------------------------------------
  function loadLocalBundle() {
    const raw = localStorage.getItem(LS_BUNDLE);
    return raw ? JSON.parse(raw) : null;
  }

  function saveLocalBundle(bundle) {
    localStorage.setItem(LS_BUNDLE, JSON.stringify(bundle));
    localBundle = bundle;
  }

  function loadSettings() {
    const raw = localStorage.getItem(LS_SETTINGS);
    settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  }

  function getDriveFileId() {
    return localStorage.getItem(LS_DRIVE_FILE_ID);
  }

  function setDriveFileId(id) {
    driveFileId = id;
    if (id) localStorage.setItem(LS_DRIVE_FILE_ID, id);
  }

  // ---------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------
  function toast(message, kind = 'info') {
    const div = document.createElement('div');
    div.className = `toast toast--${kind}`;
    div.textContent = message;
    el.toastArea.appendChild(div);
    requestAnimationFrame(() => div.classList.add('toast--visible'));
    setTimeout(() => {
      div.classList.remove('toast--visible');
      setTimeout(() => div.remove(), 300);
    }, 3200);
  }

  // ---------------------------------------------------------------------
  // Google Drive
  // ---------------------------------------------------------------------
  function driveConfigured() {
    return (
      typeof BorionConfig !== 'undefined' &&
      BorionConfig.GOOGLE_CLIENT_ID &&
      !BorionConfig.GOOGLE_CLIENT_ID.startsWith('SEU_CLIENT_ID')
    );
  }

  function updateDriveStatusUI() {
    if (!driveConfigured()) {
      el.driveStatus.textContent = 'Drive não configurado (veja CONFIGURACAO.md)';
      el.driveConnectBtn.disabled = true;
      return;
    }
    el.driveConnectBtn.disabled = false;
    if (BorionDrive.isConnected()) {
      el.driveStatus.textContent = 'Conectado ao Google Drive';
      el.driveConnectBtn.textContent = 'Conectado';
    } else {
      el.driveStatus.textContent = 'Sem conexão com o Drive — funciona só neste dispositivo';
      el.driveConnectBtn.textContent = 'Conectar ao Google Drive';
    }
  }

  async function onDriveTokenReady() {
    updateDriveStatusUI();
    toast('Conectado ao Google Drive', 'success');
    try {
      const existingId = getDriveFileId();
      let remote = null;
      let fileId = existingId;

      if (fileId) {
        remote = await BorionDrive.downloadVaultFile(fileId).catch(() => null);
      }
      if (!remote) {
        const found = await BorionDrive.findVaultFile();
        if (found) {
          fileId = found.id;
          remote = await BorionDrive.downloadVaultFile(fileId);
        }
      }

      if (remote) {
        setDriveFileId(fileId);
        const localUpdated = localBundle ? localBundle.updatedAt : null;
        if (!localUpdated || new Date(remote.updatedAt) > new Date(localUpdated)) {
          saveLocalBundle(remote);
          if (cryptoKey) {
            // já estava desbloqueado neste dispositivo — recarrega com o que veio do Drive
            currentVault = await BorionCrypto.decrypt(cryptoKey, remote.vault);
            renderList();
          } else if (el.lockScreen.dataset.mode === 'create') {
            // encontramos um cofre existente no Drive: não faz sentido "criar" outro
            setLockMode('unlock');
            toast('Cofre encontrado no Drive — digite sua senha mestra', 'info');
          }
        }
      } else if (localBundle && !dirty) {
        // não existe nada no Drive ainda, mas já existe cofre local: sobe como primeiro backup
        await pushToDrive();
      }
    } catch (e) {
      console.error(e);
      toast('Conectou, mas não deu pra sincronizar agora. Tenta de novo em instantes.', 'error');
    }
  }

  function connectDrive() {
    if (!driveConfigured()) {
      toast('Preencha o Client ID do Google em js/config.js primeiro', 'error');
      return;
    }
    if (!BorionDrive._initialized) {
      BorionDrive.initTokenClient(
        BorionConfig.GOOGLE_CLIENT_ID,
        onDriveTokenReady,
        (err) => toast(`Erro ao conectar: ${err}`, 'error')
      );
      BorionDrive._initialized = true;
    }
    BorionDrive.connect();
  }

  async function pushToDrive() {
    if (!localBundle) return;
    setSyncIndicator('syncing');
    try {
      if (BorionDrive.isConnected()) {
        const id = driveFileId || getDriveFileId();
        let result;
        if (id) {
          result = await BorionDrive.updateVaultFile(id, localBundle);
        } else {
          result = await BorionDrive.createVaultFile(localBundle);
        }
        setDriveFileId(result.id);
        dirty = false;
        setSyncIndicator('synced');
      } else {
        dirty = true;
        setSyncIndicator('offline');
      }
    } catch (e) {
      console.error(e);
      dirty = true;
      setSyncIndicator('error');
      toast('Não deu pra sincronizar com o Drive agora — os dados continuam salvos aqui neste dispositivo', 'error');
    }
  }

  function setSyncIndicator(state) {
    if (!el.syncIndicator) return;
    el.syncIndicator.className = `sync-indicator sync-indicator--${state}`;
    const labels = {
      syncing: 'Sincronizando…',
      synced: 'Sincronizado',
      offline: 'Só neste dispositivo',
      error: 'Falha ao sincronizar'
    };
    el.syncIndicator.textContent = labels[state] || '';
  }

  // ---------------------------------------------------------------------
  // Fluxo de bloqueio / desbloqueio
  // ---------------------------------------------------------------------
  function setLockMode(mode) {
    el.lockScreen.dataset.mode = mode;
    if (mode === 'create') {
      el.lockTitle.textContent = 'Criar seu cofre';
      el.lockSubtitle.textContent = 'Escolha uma senha mestra forte. Ela nunca é enviada a lugar nenhum — se você esquecê-la, não tem como recuperar o cofre.';
      el.confirmGroup.hidden = false;
      el.lockSubmit.textContent = 'Criar cofre';
      el.forgotLink.hidden = true;
    } else {
      el.lockTitle.textContent = 'Cofre bloqueado';
      el.lockSubtitle.textContent = 'Digite sua senha mestra para abrir.';
      el.confirmGroup.hidden = true;
      el.lockSubmit.textContent = 'Abrir cofre';
      el.forgotLink.hidden = false;
    }
    el.lockError.textContent = '';
    el.passwordInput.value = '';
    el.confirmInput.value = '';
  }

  async function handleLockSubmit(ev) {
    ev.preventDefault();
    const mode = el.lockScreen.dataset.mode;
    const pw = el.passwordInput.value;

    if (!pw) return;

    if (mode === 'create') {
      if (pw.length < 8) {
        el.lockError.textContent = 'Use pelo menos 8 caracteres — quanto mais longa, melhor.';
        return;
      }
      if (pw !== el.confirmInput.value) {
        el.lockError.textContent = 'As senhas digitadas não são iguais.';
        return;
      }
      await createVault(pw);
    } else {
      await unlockVault(pw);
    }
  }

  async function createVault(masterPassword) {
    const salt = BorionCrypto.generateSalt();
    cryptoKey = await BorionCrypto.deriveKey(masterPassword, salt);
    currentVault = BorionVault.emptyVault();
    const check = await BorionCrypto.makeCheck(cryptoKey);
    const encVault = await BorionCrypto.encrypt(cryptoKey, currentVault);

    const bundle = {
      version: 1,
      salt: BorionCrypto.saltToBase64(salt),
      iterations: BorionCrypto.PBKDF2_ITERATIONS,
      check,
      vault: encVault,
      updatedAt: new Date().toISOString()
    };
    saveLocalBundle(bundle);
    await pushToDrive();
    enterApp();
    toast('Cofre criado. Guarde bem sua senha mestra.', 'success');
  }

  async function unlockVault(masterPassword) {
    if (!localBundle) return;
    el.lockSubmit.disabled = true;
    try {
      const salt = BorionCrypto.saltFromBase64(localBundle.salt);
      const key = await BorionCrypto.deriveKey(masterPassword, salt, localBundle.iterations);
      const ok = await BorionCrypto.verifyCheck(key, localBundle.check);

      if (!ok) {
        failedAttempts++;
        el.lockError.textContent = 'Senha mestra incorreta.';
        el.lockScreen.classList.remove('shake');
        void el.lockScreen.offsetWidth;
        el.lockScreen.classList.add('shake');
        // pequeno atraso crescente só pra desencorajar tentativa por força bruta na UI
        const delay = Math.min(failedAttempts * 400, 3000);
        await new Promise((r) => setTimeout(r, delay));
        return;
      }

      failedAttempts = 0;
      cryptoKey = key;
      currentVault = await BorionCrypto.decrypt(cryptoKey, localBundle.vault);
      enterApp();
      if (BorionDrive.isConnected()) onDriveTokenReady();
    } catch (e) {
      console.error(e);
      el.lockError.textContent = 'Não deu pra abrir o cofre. Os dados locais podem estar corrompidos.';
    } finally {
      el.lockSubmit.disabled = false;
    }
  }

  function enterApp() {
    el.lockScreen.classList.add('unlocking');
    setTimeout(() => {
      el.lockScreen.hidden = true;
      el.lockScreen.classList.remove('unlocking', 'shake');
      el.appScreen.hidden = false;
      renderList();
      resetAutoLockTimer();
    }, 550); // dá tempo da animação do ferrolho tocar antes de trocar de tela
  }

  function lock() {
    cryptoKey = null;
    currentVault = null;
    editingEntryId = null;
    closeModal();
    el.searchInput.value = '';
    el.appScreen.hidden = true;
    el.lockScreen.hidden = false;
    setLockMode(localBundle ? 'unlock' : 'create');
    clearTimeout(autoLockTimer);
  }

  function resetAutoLockTimer() {
    clearTimeout(autoLockTimer);
    autoLockTimer = setTimeout(() => {
      lock();
      toast('Cofre bloqueado por inatividade', 'info');
    }, settings.autoLockMinutes * 60 * 1000);
  }

  // "Esqueci minha senha mestra" — opção destrutiva e deliberadamente difícil de acionar por acidente
  function handleForgotPassword() {
    const confirmation = prompt(
      'Não existe recuperação de senha mestra — é assim que a criptografia protege seus dados.\n\n' +
      'A única opção é apagar o cofre (local e do Drive) e começar um novo, vazio.\n\n' +
      'Para confirmar que você quer APAGAR TUDO, digite APAGAR abaixo:'
    );
    if (confirmation !== 'APAGAR') return;

    localStorage.removeItem(LS_BUNDLE);
    localStorage.removeItem(LS_DRIVE_FILE_ID);
    localBundle = null;
    driveFileId = null;
    currentVault = null;
    cryptoKey = null;
    setLockMode('create');
    toast('Cofre local apagado. Um novo cofre será criado ao continuar.', 'info');
  }

  // ---------------------------------------------------------------------
  // Renderização da lista
  // ---------------------------------------------------------------------
  function initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  function renderList() {
    if (!currentVault) return;
    const query = el.searchInput.value;
    const entries = BorionVault.searchEntries(currentVault, query);

    el.entryList.innerHTML = '';
    el.emptyState.hidden = entries.length > 0;

    if (currentVault.entries.length === 0) {
      el.emptyState.querySelector('p').textContent = 'Seu cofre está vazio. Adicione a primeira senha.';
    } else if (entries.length === 0) {
      el.emptyState.hidden = false;
      el.emptyState.querySelector('p').textContent = `Nada encontrado para "${query}".`;
    }

    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'entry-card';
      card.dataset.id = entry.id;

      const subtitle = entry.username || entry.email || entry.url || '—';

      card.innerHTML = `
        <div class="entry-card__avatar" aria-hidden="true">${initials(entry.name)}</div>
        <div class="entry-card__info">
          <h3 class="entry-card__name"></h3>
          <p class="entry-card__subtitle"></p>
        </div>
        <div class="entry-card__actions">
          <button type="button" class="icon-btn" data-action="copy-user" title="Copiar usuário/e-mail">👤</button>
          <button type="button" class="icon-btn" data-action="copy-pass" title="Copiar senha">🔑</button>
          <button type="button" class="icon-btn" data-action="edit" title="Editar">✎</button>
        </div>
      `;
      card.querySelector('.entry-card__name').textContent = entry.name;
      card.querySelector('.entry-card__subtitle').textContent = subtitle;
      el.entryList.appendChild(card);
    }
  }

  function handleListClick(ev) {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const card = ev.target.closest('.entry-card');
    const id = card.dataset.id;
    const entry = currentVault.entries.find((e) => e.id === id);
    if (!entry) return;

    if (btn.dataset.action === 'copy-user') {
      copyToClipboard(entry.username || entry.email, 'Usuário');
    } else if (btn.dataset.action === 'copy-pass') {
      copyToClipboard(entry.password, 'Senha');
    } else if (btn.dataset.action === 'edit') {
      openModal(entry);
    }
  }

  // ---------------------------------------------------------------------
  // Clipboard — copia e limpa sozinho depois de alguns segundos
  // ---------------------------------------------------------------------
  async function copyToClipboard(text, label) {
    if (!text) {
      toast(`${label} está vazio`, 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copiado — limpa em ${settings.clipboardClearSeconds}s`, 'success');
    } catch (e) {
      toast('Não deu pra acessar a área de transferência', 'error');
      return;
    }
    clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === text) await navigator.clipboard.writeText('');
      } catch (e) {
        // sem permissão de leitura — sem problema, apenas não limpamos automaticamente
      }
    }, settings.clipboardClearSeconds * 1000);
  }

  // ---------------------------------------------------------------------
  // Modal de entrada (criar/editar)
  // ---------------------------------------------------------------------
  function openModal(entry) {
    editingEntryId = entry ? entry.id : null;
    el.modalTitle.textContent = entry ? 'Editar senha' : 'Nova senha';
    el.fName.value = entry ? entry.name : '';
    el.fUsername.value = entry ? entry.username : '';
    el.fEmail.value = entry ? entry.email : '';
    el.fPassword.value = entry ? entry.password : '';
    el.fUrl.value = entry ? entry.url : '';
    el.fNotes.value = entry ? entry.notes : '';
    el.fTotp.value = entry ? entry.totp || '' : '';
    el.fPassword.type = 'password';
    el.deleteEntryBtn.hidden = !entry;
    updateStrengthBar();
    el.modalBackdrop.hidden = false;
    setTimeout(() => el.fName.focus(), 50);
  }

  function closeModal() {
    el.modalBackdrop.hidden = true;
    editingEntryId = null;
  }

  async function handleEntryFormSubmit(ev) {
    ev.preventDefault();

    if (!cryptoKey || !currentVault) {
      // o cofre bloqueou (ex.: por inatividade) enquanto o formulário estava aberto
      toast('O cofre foi bloqueado enquanto você editava — desbloqueie de novo pra salvar', 'error');
      closeModal();
      lock();
      return;
    }

    const data = {
      name: el.fName.value,
      username: el.fUsername.value,
      email: el.fEmail.value,
      password: el.fPassword.value,
      url: el.fUrl.value,
      notes: el.fNotes.value,
      totp: el.fTotp.value
    };

    try {
      if (editingEntryId) {
        BorionVault.updateEntry(currentVault, editingEntryId, data);
      } else {
        BorionVault.addEntry(currentVault, data);
      }
      await persistVaultChange();
      closeModal();
      renderList();
      toast('Senha salva', 'success');
    } catch (e) {
      console.error(e);
      toast('Não deu pra salvar — tenta de novo. Se persistir, veja o console (F12) e me manda o erro.', 'error');
    }
  }

  async function handleDeleteEntry() {
    if (!editingEntryId) return;
    if (!confirm('Apagar esta senha? Essa ação não pode ser desfeita.')) return;

    if (!cryptoKey || !currentVault) {
      toast('O cofre foi bloqueado enquanto você editava — desbloqueie de novo', 'error');
      closeModal();
      lock();
      return;
    }

    try {
      BorionVault.deleteEntry(currentVault, editingEntryId);
      await persistVaultChange();
      closeModal();
      renderList();
      toast('Senha apagada', 'success');
    } catch (e) {
      console.error(e);
      toast('Não deu pra apagar — tenta de novo', 'error');
    }
  }

  async function persistVaultChange() {
    const encVault = await BorionCrypto.encrypt(cryptoKey, currentVault);
    localBundle.vault = encVault;
    localBundle.updatedAt = new Date().toISOString();
    saveLocalBundle(localBundle);
    await pushToDrive();
  }

  function updateStrengthBar() {
    const score = BorionGenerator.strength(el.fPassword.value);
    el.strengthBar.style.width = `${score}%`;
    el.strengthBar.dataset.level = score < 34 ? 'fraca' : score < 67 ? 'media' : 'forte';
  }

  // ---------------------------------------------------------------------
  // Exportar backup local cifrado (arquivo .json que só abre com a senha mestra)
  // ---------------------------------------------------------------------
  function exportBackup() {
    if (!localBundle) return;
    const blob = new Blob([JSON.stringify(localBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `borion-senhas-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup cifrado exportado — continua ilegível sem sua senha mestra', 'success');
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  function bindEvents() {
    el.lockForm.addEventListener('submit', handleLockSubmit);
    el.forgotLink.addEventListener('click', (e) => { e.preventDefault(); handleForgotPassword(); });
    el.driveConnectBtn.addEventListener('click', connectDrive);

    el.searchInput.addEventListener('input', renderList);
    el.entryList.addEventListener('click', handleListClick);
    el.addBtn.addEventListener('click', () => openModal(null));
    el.lockBtn.addEventListener('click', lock);
    el.exportBtn.addEventListener('click', exportBackup);

    el.entryForm.addEventListener('submit', handleEntryFormSubmit);
    el.cancelModalBtn.addEventListener('click', closeModal);
    el.deleteEntryBtn.addEventListener('click', handleDeleteEntry);
    el.modalBackdrop.addEventListener('click', (e) => { if (e.target === el.modalBackdrop) closeModal(); });

    el.togglePwBtn.addEventListener('click', () => {
      el.fPassword.type = el.fPassword.type === 'password' ? 'text' : 'password';
    });
    el.genPwBtn.addEventListener('click', () => {
      el.fPassword.type = 'text';
      el.fPassword.value = BorionGenerator.generate({ length: 22 });
      updateStrengthBar();
    });
    el.fPassword.addEventListener('input', updateStrengthBar);

    ['click', 'keydown', 'mousemove'].forEach((evt) => {
      document.addEventListener(evt, () => { if (cryptoKey) resetAutoLockTimer(); }, { passive: true });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.modalBackdrop.hidden) closeModal();
    });
  }

  function init() {
    loadSettings();
    localBundle = loadLocalBundle();
    driveFileId = getDriveFileId();
    setLockMode(localBundle ? 'unlock' : 'create');
    updateDriveStatusUI();
    bindEvents();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
