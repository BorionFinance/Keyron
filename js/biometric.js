// Keyron Biometric — desbloqueio local via biometria da plataforma (Face ID, Touch ID,
// impressão digital do Android, Windows Hello) usando a extensão PRF do WebAuthn.
//
// Como funciona, em resumo:
// 1) Um "passkey" de plataforma é criado no dispositivo (fica preso ao hardware seguro
//    dele — nunca sai do aparelho e nunca é enviado a servidor nenhum).
// 2) A cada desbloqueio, o navegador exige a biometria real (rosto/digital/PIN do SO)
//    para liberar um segredo determinístico (saída da extensão "prf") daquele passkey.
// 3) Esse segredo vira uma chave AES-GCM local que só serve para abrir um pequeno
//    "envelope" cifrado guardado neste aparelho, contendo a própria senha mestra.
// 4) Com a senha mestra recuperada, o desbloqueio segue o fluxo normal do Keyron
//    (a mesma derivação PBKDF2 + AES-GCM de sempre). Nada na segurança do cofre muda —
//    isto só evita digitar a senha quando a biometria do aparelho confirma que é você.
//
// Tudo fica só neste dispositivo (IndexedDB local, com fallback em localStorage).
// Nada disso é sincronizado no Google Drive nem sai do navegador.
const KeyronBiometric = (() => {
  const RECORD_PREFIX = 'biometric:';
  const RP_NAME = 'Keyron';

  function available() {
    return Boolean(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && navigator.credentials.get);
  }

  async function platformAvailable() {
    if (!available()) return false;
    try {
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    const view = new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  const recordKey = (vaultId) => `${RECORD_PREFIX}${vaultId}`;

  async function hasRecord(vaultId) {
    if (!vaultId) return false;
    try {
      const record = await KeyronStorage.get(recordKey(vaultId));
      return Boolean(record);
    } catch {
      return false;
    }
  }

  async function forget(vaultId) {
    if (!vaultId) return;
    await KeyronStorage.remove(recordKey(vaultId)).catch(() => null);
  }

  // Deriva uma chave AES-GCM local a partir da saída da extensão PRF do WebAuthn.
  // A saída do PRF só existe depois de uma verificação biométrica bem-sucedida —
  // sem ela, esta chave não pode ser reconstruída.
  async function deriveWrapKey(prfBytes) {
    const digest = await crypto.subtle.digest('SHA-256', prfBytes);
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  function extractPrfBytes(assertion) {
    const results = assertion.getClientExtensionResults?.();
    const first = results?.prf?.results?.first;
    if (!first) throw new Error('PRF_UNAVAILABLE');
    return new Uint8Array(first);
  }

  async function enroll(vaultId, password, accountLabel) {
    if (!vaultId || !password) throw new Error('MISSING_PARAMS');
    if (!(await platformAvailable())) throw new Error('PLATFORM_UNAVAILABLE');

    const userId = randomBytes(16);
    let created;
    try {
      created = await navigator.credentials.create({
        publicKey: {
          rp: { name: RP_NAME, id: window.location.hostname },
          user: { id: userId, name: accountLabel || 'keyron-vault', displayName: 'Keyron' },
          challenge: randomBytes(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
          timeout: 60000,
          extensions: { prf: {} }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') throw new Error('USER_CANCELLED');
      throw new Error('CREATE_FAILED');
    }
    if (!created) throw new Error('CREATE_FAILED');

    const prfEnabled = Boolean(created.getClientExtensionResults?.().prf?.enabled);
    if (!prfEnabled) throw new Error('PRF_NOT_SUPPORTED');

    const salt = randomBytes(32);
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [{ id: created.rawId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') throw new Error('USER_CANCELLED');
      throw new Error('PRF_EVAL_FAILED');
    }

    const prfBytes = extractPrfBytes(assertion);
    const wrapKey = await deriveWrapKey(prfBytes);
    const iv = randomBytes(12);
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    let cipher;
    try {
      cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, passwordBytes);
    } finally {
      passwordBytes.fill(0);
    }

    const record = {
      vaultId,
      credentialId: bytesToBase64Url(created.rawId),
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      data: bytesToBase64Url(cipher),
      createdAt: new Date().toISOString()
    };
    await KeyronStorage.set(recordKey(vaultId), record);
    return true;
  }

  async function unlock(vaultId) {
    if (!vaultId) throw new Error('MISSING_PARAMS');
    const record = await KeyronStorage.get(recordKey(vaultId));
    if (!record) throw new Error('NO_RECORD');

    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [{ id: base64UrlToBytes(record.credentialId), type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: base64UrlToBytes(record.salt) } } }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') throw new Error('USER_CANCELLED');
      throw new Error('ASSERTION_FAILED');
    }

    const prfBytes = extractPrfBytes(assertion);
    const wrapKey = await deriveWrapKey(prfBytes);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64UrlToBytes(record.iv) },
        wrapKey,
        base64UrlToBytes(record.data)
      );
      return new TextDecoder().decode(plain);
    } catch {
      throw new Error('UNWRAP_FAILED');
    }
  }

  return Object.freeze({ available, platformAvailable, hasRecord, enroll, unlock, forget });
})();
