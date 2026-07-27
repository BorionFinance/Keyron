// Keyron Crypto — nenhum dado do cofre sai em texto puro.
// A senha mestra existe apenas durante a derivação da chave e nunca é persistida.
const KeyronCrypto = (() => {
  const CURRENT_ITERATIONS = 600000;
  const LEGACY_ITERATIONS = 250000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const FORMAT = 'keyron-vault';
  const FORMAT_VERSION = 2;

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

  async function createBundle(password, vault) {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(password, salt, CURRENT_ITERATIONS);
    const now = new Date().toISOString();
    const vaultId = vault.id || randomId();
    const bundle = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      vaultId,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: CURRENT_ITERATIONS,
        salt: bytesToBase64(salt)
      },
      cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
      check: await encrypt(key, { marker: 'KEYRON_OK', vaultId }, `check:${vaultId}`),
      payload: await encrypt(key, vault, `payload:${vaultId}`),
      updatedAt: now
    };
    return { key, bundle };
  }

  async function unlockBundle(password, bundle) {
    const isLegacy = !bundle.format && bundle.salt && bundle.vault;
    const iterations = isLegacy ? LEGACY_ITERATIONS : Number(bundle?.kdf?.iterations || CURRENT_ITERATIONS);
    const salt = isLegacy ? base64ToBytes(bundle.salt) : base64ToBytes(bundle.kdf.salt);
    const key = await deriveKey(password, salt, iterations);

    try {
      if (isLegacy) {
        const check = await decryptLegacy(key, bundle.check);
        if (!check || check.check !== 'borion-senhas-ok') throw new Error('INVALID_PASSWORD');
        const vault = await decryptLegacy(key, bundle.vault);
        return { key, vault, legacy: true, iterations };
      }

      if (bundle.format !== FORMAT || Number(bundle.formatVersion) !== FORMAT_VERSION) {
        throw new Error('UNSUPPORTED_FORMAT');
      }
      const check = await decrypt(key, bundle.check, `check:${bundle.vaultId}`, bundle.formatVersion);
      if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) throw new Error('INVALID_PASSWORD');
      const vault = await decrypt(key, bundle.payload, `payload:${bundle.vaultId}`, bundle.formatVersion);
      return { key, vault, legacy: false, iterations };
    } catch (error) {
      if (error.message === 'UNSUPPORTED_FORMAT') throw error;
      throw new Error('INVALID_PASSWORD');
    }
  }

  async function updateBundle(key, bundle, vault) {
    const now = new Date().toISOString();
    return {
      ...bundle,
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      payload: await encrypt(key, vault, `payload:${bundle.vaultId}`),
      updatedAt: now
    };
  }

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
    createBundle,
    unlockBundle,
    updateBundle,
    rekeyBundle,
    looksLikeEncryptedBundle
  });
})();
