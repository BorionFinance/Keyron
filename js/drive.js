// drive.js — Fala com o Google Drive. Este módulo só transporta o blob
// JÁ CIFRADO (o crypto.js cuida disso antes). Ele nunca vê a senha mestra
// nem os dados em texto puro.
//
// Usa o escopo "drive.file" de propósito: com esse escopo o app só enxerga
// arquivos que ele mesmo criou — nunca o resto do seu Drive.

const BorionDrive = (() => {
  const VAULT_FILENAME = 'borion-senhas-vault.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function isConnected() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  function initTokenClient(clientId, onTokenReady, onError) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) {
          if (onError) onError(resp.error);
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + resp.expires_in * 1000 - 60000; // margem de 1 min
        onTokenReady();
      }
    });
  }

  function connect() {
    if (!tokenClient) throw new Error('Cliente Google ainda não foi inicializado (config.js está certo?)');
    tokenClient.requestAccessToken({ prompt: '' });
  }

  function disconnect() {
    if (accessToken && window.google) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  async function apiFetch(url, options = {}) {
    if (!isConnected()) throw new Error('Não conectado ao Google Drive');
    const headers = Object.assign({}, options.headers, { Authorization: `Bearer ${accessToken}` });
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Drive API ${res.status}: ${body}`);
    }
    return res;
  }

  // Procura o arquivo do cofre no Drive (só encontra o que o próprio app criou,
  // por causa do escopo drive.file).
  async function findVaultFile() {
    const q = encodeURIComponent(`name='${VAULT_FILENAME}' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)`;
    const res = await apiFetch(url);
    const json = await res.json();
    return json.files && json.files[0] ? json.files[0] : null;
  }

  async function createVaultFile(contentObj) {
    const boundary = 'borion-senhas-boundary';
    const metadata = { name: VAULT_FILENAME, mimeType: 'application/json' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(contentObj)}\r\n` +
      `--${boundary}--`;
    const res = await apiFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
    );
    return res.json();
  }

  async function updateVaultFile(fileId, contentObj) {
    const res = await apiFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contentObj) }
    );
    return res.json();
  }

  async function downloadVaultFile(fileId) {
    const res = await apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return res.json();
  }

  async function getFileMeta(fileId) {
    const res = await apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`);
    return res.json();
  }

  return {
    VAULT_FILENAME,
    isConnected,
    initTokenClient,
    connect,
    disconnect,
    findVaultFile,
    createVaultFile,
    updateVaultFile,
    downloadVaultFile,
    getFileMeta
  };
})();
