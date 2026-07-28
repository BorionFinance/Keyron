// Keyron Crypto — nenhum dado do cofre sai em texto puro.
// A senha mestra existe apenas durante a derivação da chave e nunca é persistida.
//
// A partir da v3 do formato, o cofre passa a usar uma chave de dados (DEK) aleatória,
// independente da senha: o payload é cifrado sempre com essa DEK, e a DEK em si é
// "embrulhada" (wrapped) tanto pela senha mestra quanto por uma chave de recuperação
// de alta entropia gerada e mostrada uma única vez. Trocar a senha mestra só re-embrulha
// a DEK (não precisa recifrar o cofre inteiro), e a chave de recuperação continua válida
// depois da troca. Sem a senha mestra e sem a chave de recuperação, o conteúdo permanece
// inacessível — não existe nenhum outro caminho de acesso.
const KeyronCrypto = (() => {
  const CURRENT_ITERATIONS = 600000;
  const LEGACY_ITERATIONS = 250000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const FORMAT = 'keyron-vault';
  const FORMAT_VERSION = 3;
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L, evita ambiguidade

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  function randomId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${bytesToBase64(randomBytes(12)).replace(/[^a-z0-9]/gi, '')}`;
  }

  function generateRecoveryCode(groups = 6, groupSize = 5) {
    const bytes = randomBytes(groups * groupSize);
    let raw = '';
    for (let i = 0; i < bytes.length; i += 1) raw += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    const parts = [];
    for (let i = 0; i < raw.length; i += groupSize) parts.push(raw.slice(i, i + groupSize));
    return parts.join('-');
  }

  function canonicalRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function deriveKey(password, saltBytes, iterations = CURRENT_ITERATIONS) {
    const passwordBytes = encoder.encode(password);
    try {
      const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } finally {
      passwordBytes.fill(0);
    }
  }

  function additionalData(context, version = FORMAT_VERSION) {
    return encoder.encode(`KEYRON|${context}|${version}`);
  }

  async function encrypt(key, plainObject, context = 'payload', version = FORMAT_VERSION) {
    const iv = randomBytes(IV_BYTES);
    const plain = encoder.encode(JSON.stringify(plainObject));
    try {
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: additionalData(context, version), tagLength: 128 },
        key,
        plain
      );
      return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
    } finally {
      plain.fill(0);
    }
  }

  async function decrypt(key, payload, context = 'payload', version = FORMAT_VERSION) {
    const iv = base64ToBytes(payload.iv);
    const cipher = base64ToBytes(payload.data);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, version), tagLength: 128 },
      key,
      cipher
    );
    return JSON.parse(decoder.decode(plain));
  }

  // Compatibilidade somente para migrar a versão Borion anterior, que não usava AAD.
  async function decryptLegacy(key, payload) {
    const iv = base64ToBytes(payload.iv);
    const cipher = base64ToBytes(payload.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(decoder.decode(plain));
  }

  async function generateDEK() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function importDEK(rawBytes) {
    return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function wrapDEK(dek, wrapKeyMaterial, context) {
    const iv = randomBytes(IV_BYTES);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
    try {
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: additionalData(context) },
        wrapKeyMaterial,
        raw
      );
      return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
    } finally {
      raw.fill(0);
    }
  }

  async function unwrapDEK(wrapped, wrapKeyMaterial, context) {
    const iv = base64ToBytes(wrapped.iv);
    const cipher = base64ToBytes(wrapped.data);
    const raw = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context) },
      wrapKeyMaterial,
      cipher
    ));
    try {
      return await importDEK(raw);
    } finally {
      raw.fill(0);
    }
  }

  async function buildWrap(secret, dek, iterations, context) {
    const salt = randomBytes(SALT_BYTES);
    const kek = await deriveKey(secret, salt, iterations);
    const wrappedKey = await wrapDEK(dek, kek, context);
    return {
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
      wrappedKey
    };
  }

  async function createBundle(password, vault) {
    const vaultId = vault.id || randomId();
    const now = new Date().toISOString();
    const dek = await generateDEK();

    const passwordWrap = await buildWrap(password, dek, CURRENT_ITERATIONS, `wrap-password:${vaultId}`);
    const recoveryCode = generateRecoveryCode();
    const recoveryWrap = await buildWrap(canonicalRecoveryCode(recoveryCode), dek, CURRENT_ITERATIONS, `wrap-recovery:${vaultId}`);

    const bundle = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      vaultId,
      kdf: passwordWrap.kdf,
      wrappedKey: passwordWrap.wrappedKey,
      recovery: {
        kdf: recoveryWrap.kdf,
        wrappedKey: recoveryWrap.wrappedKey,
        createdAt: now
      },
      cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
      check: await encrypt(dek, { marker: 'KEYRON_OK', vaultId }, `check:${vaultId}`),
      payload: await encrypt(dek, vault, `payload:${vaultId}`),
      revision: 1,
      operationId: randomId(),
      updatedAt: now
    };
    return { key: dek, bundle, recoveryCode };
  }

  async function unlockBundle(password, bundle) {
    const isLegacy = !bundle.format && bundle.salt && bundle.vault;
    if (isLegacy) {
      const salt = base64ToBytes(bundle.salt);
      const key = await deriveKey(password, salt, LEGACY_ITERATIONS);
      try {
        const check = await decryptLegacy(key, bundle.check);
        if (!check || check.check !== 'borion-senhas-ok') throw new Error('INVALID_PASSWORD');
        const vault = await decryptLegacy(key, bundle.vault);
        return { key, vault, legacy: true, iterations: LEGACY_ITERATIONS };
      } catch {
        throw new Error('INVALID_PASSWORD');
      }
    }

    if (bundle.format !== FORMAT) throw new Error('UNSUPPORTED_FORMAT');
    if (Number(bundle.formatVersion) > FORMAT_VERSION) throw new Error('UNSUPPORTED_FORMAT');

    const iterations = Number(bundle?.kdf?.iterations || CURRENT_ITERATIONS);
    const salt = base64ToBytes(bundle.kdf.salt);

    try {
      if (bundle.wrappedKey) {
        // Formato com DEK própria (v3+): a senha só destrava o embrulho da chave de dados.
        const kek = await deriveKey(password, salt, iterations);
        const dek = await unwrapDEK(bundle.wrappedKey, kek, `wrap-password:${bundle.vaultId}`);
        const check = await decrypt(dek, bundle.check, `check:${bundle.vaultId}`, bundle.formatVersion);
        if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) throw new Error('INVALID_PASSWORD');
        const vault = await decrypt(dek, bundle.payload, `payload:${bundle.vaultId}`, bundle.formatVersion);
        return { key: dek, vault, legacy: false, iterations };
      }

      // Formato v2 (sem DEK própria): a senha deriva a própria chave de cifragem.
      const key = await deriveKey(password, salt, iterations);
      const check = await decrypt(key, bundle.check, `check:${bundle.vaultId}`, bundle.formatVersion);
      if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) throw new Error('INVALID_PASSWORD');
      const vault = await decrypt(key, bundle.payload, `payload:${bundle.vaultId}`, bundle.formatVersion);
      return { key, vault, legacy: false, iterations };
    } catch (error) {
      if (error.message === 'UNSUPPORTED_FORMAT') throw error;
      throw new Error('INVALID_PASSWORD');
    }
  }

  // Destrava a DEK usando a chave de recuperação em vez da senha mestra. Não decifra
  // o payload sozinha — devolve a própria chave para o chamador decidir o que fazer
  // (ver decryptPayload) e permitir a troca de senha em seguida.
  async function unlockWithRecoveryCode(code, bundle) {
    if (!bundle?.recovery?.wrappedKey) throw new Error('NO_RECOVERY');
    const iterations = Number(bundle.recovery.kdf.iterations || CURRENT_ITERATIONS);
    const salt = base64ToBytes(bundle.recovery.kdf.salt);
    const kek = await deriveKey(canonicalRecoveryCode(code), salt, iterations);
    let dek;
    try {
      dek = await unwrapDEK(bundle.recovery.wrappedKey, kek, `wrap-recovery:${bundle.vaultId}`);
    } catch {
      throw new Error('INVALID_RECOVERY_CODE');
    }
    try {
      const check = await decrypt(dek, bundle.check, `check:${bundle.vaultId}`, bundle.formatVersion);
      if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) throw new Error('INVALID_RECOVERY_CODE');
    } catch {
      throw new Error('INVALID_RECOVERY_CODE');
    }
    return dek;
  }

  async function decryptPayload(key, bundle) {
    return decrypt(key, bundle.payload, `payload:${bundle.vaultId}`, bundle.formatVersion);
  }

  // Re-embrulha a mesma DEK com uma nova senha. Não recifra o payload nem mexe na
  // chave de recuperação — ela continua abrindo o mesmo cofre depois da troca.
  async function changePassword(dek, newPassword, bundle) {
    const passwordWrap = await buildWrap(newPassword, dek, CURRENT_ITERATIONS, `wrap-password:${bundle.vaultId}`);
    return {
      ...bundle,
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      kdf: passwordWrap.kdf,
      wrappedKey: passwordWrap.wrappedKey,
      updatedAt: new Date().toISOString()
    };
  }

  // Gera uma chave de recuperação nova, invalidando a anterior (a antiga deixa de
  // abrir a DEK; a senha mestra atual continua funcionando normalmente).
  async function regenerateRecovery(dek, bundle) {
    const recoveryCode = generateRecoveryCode();
    const recoveryWrap = await buildWrap(canonicalRecoveryCode(recoveryCode), dek, CURRENT_ITERATIONS, `wrap-recovery:${bundle.vaultId}`);
    return {
      bundle: {
        ...bundle,
        recovery: {
          kdf: recoveryWrap.kdf,
          wrappedKey: recoveryWrap.wrappedKey,
          createdAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      },
      recoveryCode
    };
  }

  async function updateBundle(key, bundle, vault) {
    const now = new Date().toISOString();
    return {
      ...bundle,
      format: FORMAT,
      payload: await encrypt(key, vault, `payload:${bundle.vaultId}`, bundle.formatVersion),
      updatedAt: now
    };
  }

  // Usado para migrar cofres antigos (Borion legado ou Keyron v2 sem DEK própria) para
  // a estrutura atual, e também como base defensiva de troca de senha caso a migração
  // ainda não tenha rodado. Sempre gera uma DEK e uma chave de recuperação novas.
  async function rekeyBundle(password, vault, existingVaultId) {
    const nextVault = { ...vault, id: existingVaultId || vault.id || randomId() };
    return createBundle(password, nextVault);
  }

  function looksLikeEncryptedBundle(value) {
    if (!value || typeof value !== 'object') return false;
    return Boolean(
      (value.format === FORMAT && value.kdf?.salt && value.payload?.iv && value.payload?.data) ||
      (value.salt && value.vault?.iv && value.vault?.data && value.check?.iv)
    );
  }

  return Object.freeze({
    CURRENT_ITERATIONS,
    FORMAT,
    FORMAT_VERSION,
    randomId,
    generateRecoveryCode,
    canonicalRecoveryCode,
    createBundle,
    unlockBundle,
    unlockWithRecoveryCode,
    decryptPayload,
    changePassword,
    regenerateRecovery,
    updateBundle,
    rekeyBundle,
    looksLikeEncryptedBundle
  });
})();
