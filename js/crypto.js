// Keyron Crypto — o conteúdo do cofre é cifrado antes de qualquer persistência.
// A senha mestra só participa da derivação da chave de embrulho e nunca é armazenada.
const KeyronCrypto = (() => {
  'use strict';

  const CURRENT_ITERATIONS = 600000;
  const LEGACY_ITERATIONS = 250000;
  const MIN_ITERATIONS = 600000;
  const MAX_ITERATIONS = 2000000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const DEK_BYTES = 32;
  const GCM_TAG_BYTES = 16;
  const MAX_PASSWORD_CHARS = 2048;
  const MAX_CIPHERTEXT_BYTES = 64 * 1024 * 1024;
  const FORMAT = 'keyron-vault';
  const FORMAT_VERSION = 4;
  // Os embrulhos v3 já publicados usam AAD versão 3. Mantê-la fixa preserva compatibilidade.
  const WRAP_AAD_VERSION = 3;
  const SUPPORTED_FORMAT_VERSIONS = new Set([2, 3, 4]);
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RECOVERY_CHARS = 30;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function fail(code) {
    throw new Error(code);
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value, { label = 'BASE64', exact = null, min = 1, max = MAX_CIPHERTEXT_BYTES } = {}) {
    if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(max * 4 / 3) + 8) fail(`INVALID_${label}`);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`INVALID_${label}`);
    let binary;
    try { binary = atob(value); } catch { fail(`INVALID_${label}`); }
    if (exact != null && binary.length !== exact) fail(`INVALID_${label}`);
    if (binary.length < min || binary.length > max) fail(`INVALID_${label}`);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  function randomId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${bytesToBase64(randomBytes(18)).replace(/[^a-z0-9]/gi, '')}`;
  }

  function generateRecoveryCode() {
    const limit = Math.floor(256 / RECOVERY_ALPHABET.length) * RECOVERY_ALPHABET.length;
    let raw = '';
    while (raw.length < RECOVERY_CHARS) {
      const bytes = randomBytes(Math.max(32, RECOVERY_CHARS - raw.length));
      for (const byte of bytes) {
        if (byte >= limit) continue; // rejection sampling: elimina viés de módulo.
        raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
        if (raw.length === RECOVERY_CHARS) break;
      }
    }
    const parts = [];
    for (let i = 0; i < raw.length; i += 5) parts.push(raw.slice(i, i + 5));
    return parts.join('-');
  }

  function canonicalRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function assertRecoveryCode(code) {
    const canonical = canonicalRecoveryCode(code);
    if (canonical.length !== RECOVERY_CHARS || !new RegExp(`^[${RECOVERY_ALPHABET}]+$`).test(canonical)) fail('INVALID_RECOVERY_CODE');
    return canonical;
  }

  function assertSecret(secret) {
    if (typeof secret !== 'string' || secret.length < 1 || secret.length > MAX_PASSWORD_CHARS) fail('INVALID_SECRET');
    return secret;
  }

  async function deriveKey(secret, saltBytes, iterations = CURRENT_ITERATIONS) {
    assertSecret(secret);
    if (!(saltBytes instanceof Uint8Array) || saltBytes.length !== SALT_BYTES) fail('INVALID_SALT');
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) fail('INVALID_KDF_ITERATIONS');
    const secretBytes = encoder.encode(secret);
    try {
      const material = await crypto.subtle.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } finally {
      secretBytes.fill(0);
    }
  }

  async function deriveLegacyKey(secret, saltBytes) {
    assertSecret(secret);
    const secretBytes = encoder.encode(secret);
    try {
      const material = await crypto.subtle.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: LEGACY_ITERATIONS },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } finally {
      secretBytes.fill(0);
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
    const iv = base64ToBytes(payload.iv, { label: 'IV', exact: IV_BYTES, max: IV_BYTES });
    const cipher = base64ToBytes(payload.data, { label: 'CIPHERTEXT', min: GCM_TAG_BYTES, max: MAX_CIPHERTEXT_BYTES });
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, version), tagLength: 128 },
      key,
      cipher
    );
    const plain = new Uint8Array(plainBuffer);
    try {
      return JSON.parse(decoder.decode(plain));
    } finally {
      plain.fill(0);
      cipher.fill(0);
      iv.fill(0);
    }
  }

  async function decryptLegacy(key, payload) {
    const iv = base64ToBytes(payload.iv, { label: 'LEGACY_IV', exact: IV_BYTES, max: IV_BYTES });
    const cipher = base64ToBytes(payload.data, { label: 'LEGACY_CIPHERTEXT', min: GCM_TAG_BYTES, max: MAX_CIPHERTEXT_BYTES });
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    const plain = new Uint8Array(plainBuffer);
    try {
      return JSON.parse(decoder.decode(plain));
    } finally {
      plain.fill(0);
      cipher.fill(0);
      iv.fill(0);
    }
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
        { name: 'AES-GCM', iv, additionalData: additionalData(context, WRAP_AAD_VERSION), tagLength: 128 },
        wrapKeyMaterial,
        raw
      );
      return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
    } finally {
      raw.fill(0);
    }
  }

  async function unwrapDEK(wrapped, wrapKeyMaterial, context) {
    const iv = base64ToBytes(wrapped.iv, { label: 'WRAP_IV', exact: IV_BYTES, max: IV_BYTES });
    const cipher = base64ToBytes(wrapped.data, { label: 'WRAPPED_KEY', exact: DEK_BYTES + GCM_TAG_BYTES, max: DEK_BYTES + GCM_TAG_BYTES });
    const raw = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(context, WRAP_AAD_VERSION), tagLength: 128 },
      wrapKeyMaterial,
      cipher
    ));
    try {
      if (raw.length !== DEK_BYTES) fail('INVALID_DEK');
      return await importDEK(raw);
    } finally {
      raw.fill(0);
      cipher.fill(0);
      iv.fill(0);
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

  async function hashBytes(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }

  async function hashText(value) {
    const bytes = encoder.encode(String(value));
    try { return bytesToBase64(await hashBytes(bytes)); } finally { bytes.fill(0); }
  }

  async function hashAccountIdentifier(identifier) {
    const normalized = String(identifier || '').trim();
    if (!normalized || normalized.length > 512) fail('INVALID_ACCOUNT_IDENTIFIER');
    return hashText(`KEYRON-ACCOUNT|${normalized}`);
  }

  async function payloadHash(payload) {
    return hashText(`${payload.iv}.${payload.data}`);
  }

  async function envelopeHash(bundle) {
    const envelope = {
      kdf: bundle.kdf ? {
        name: bundle.kdf.name,
        hash: bundle.kdf.hash,
        iterations: Number(bundle.kdf.iterations),
        salt: bundle.kdf.salt
      } : null,
      wrappedKey: bundle.wrappedKey ? { iv: bundle.wrappedKey.iv, data: bundle.wrappedKey.data } : null,
      recovery: bundle.recovery ? {
        kdf: bundle.recovery.kdf ? {
          name: bundle.recovery.kdf.name,
          hash: bundle.recovery.kdf.hash,
          iterations: Number(bundle.recovery.kdf.iterations),
          salt: bundle.recovery.kdf.salt
        } : null,
        wrappedKey: bundle.recovery.wrappedKey ? {
          iv: bundle.recovery.wrappedKey.iv,
          data: bundle.recovery.wrappedKey.data
        } : null,
        createdAt: bundle.recovery.createdAt
      } : null,
      cipher: bundle.cipher ? {
        name: bundle.cipher.name,
        length: Number(bundle.cipher.length),
        tagLength: Number(bundle.cipher.tagLength)
      } : null,
      check: bundle.check ? { iv: bundle.check.iv, data: bundle.check.data } : null
    };
    return hashText(JSON.stringify(envelope));
  }

  function safeText(value, max = 160) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function metadataForIntegrity(bundle) {
    return {
      marker: 'KEYRON_BUNDLE_OK',
      vaultId: bundle.vaultId,
      formatVersion: Number(bundle.formatVersion),
      revision: Number(bundle.revision),
      operationId: safeText(bundle.operationId),
      ancestors: Array.isArray(bundle.ancestors) ? bundle.ancestors.map((item) => safeText(item)) : [],
      updatedAt: safeText(bundle.updatedAt, 64),
      ownerBinding: bundle.ownerBinding || null,
      deviceId: safeText(bundle.deviceId),
      saveReason: safeText(bundle.saveReason, 80),
      locallySavedAt: safeText(bundle.locallySavedAt, 64),
      payloadHash: null,
      envelopeHash: null
    };
  }

  async function sealIntegrity(key, bundle) {
    const metadata = metadataForIntegrity(bundle);
    metadata.payloadHash = await payloadHash(bundle.payload);
    metadata.envelopeHash = await envelopeHash(bundle);
    return encrypt(key, metadata, `integrity:${bundle.vaultId}`, FORMAT_VERSION);
  }

  function constantTimeStringEqual(a, b) {
    const left = String(a ?? '');
    const right = String(b ?? '');
    let diff = left.length ^ right.length;
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i += 1) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
    return diff === 0;
  }

  async function verifyIntegrity(key, bundle) {
    if (Number(bundle.formatVersion) < 4) return true;
    let actual;
    try {
      actual = await decrypt(key, bundle.integrity, `integrity:${bundle.vaultId}`, FORMAT_VERSION);
    } catch {
      fail('INVALID_BUNDLE_INTEGRITY');
    }
    const expected = metadataForIntegrity(bundle);
    expected.payloadHash = await payloadHash(bundle.payload);
    expected.envelopeHash = await envelopeHash(bundle);
    for (const field of Object.keys(expected)) {
      const actualValue = JSON.stringify(actual?.[field] ?? null);
      const expectedValue = JSON.stringify(expected[field] ?? null);
      if (!constantTimeStringEqual(actualValue, expectedValue)) fail('INVALID_BUNDLE_INTEGRITY');
    }
    return true;
  }

  function assertKdf(kdf, label = 'KDF') {
    if (!kdf || typeof kdf !== 'object') fail(`INVALID_${label}`);
    if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') fail(`INVALID_${label}`);
    const iterations = Number(kdf.iterations);
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) fail(`INVALID_${label}_ITERATIONS`);
    base64ToBytes(kdf.salt, { label: `${label}_SALT`, exact: SALT_BYTES, max: SALT_BYTES }).fill(0);
  }

  function assertEncryptedPart(part, label, max = MAX_CIPHERTEXT_BYTES, exactData = null) {
    if (!part || typeof part !== 'object') fail(`INVALID_${label}`);
    base64ToBytes(part.iv, { label: `${label}_IV`, exact: IV_BYTES, max: IV_BYTES }).fill(0);
    const data = base64ToBytes(part.data, { label: `${label}_DATA`, exact: exactData, min: GCM_TAG_BYTES, max });
    data.fill(0);
  }

  function assertIsoDate(value, label) {
    if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) fail(`INVALID_${label}`);
  }

  function assertLegacyBundle(bundle) {
    base64ToBytes(bundle.salt, { label: 'LEGACY_SALT', exact: SALT_BYTES, max: SALT_BYTES }).fill(0);
    assertEncryptedPart(bundle.check, 'LEGACY_CHECK', 4096);
    assertEncryptedPart(bundle.vault, 'LEGACY_VAULT');
    return true;
  }

  function assertValidBundle(bundle, { allowLegacy = true } = {}) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('INVALID_BUNDLE');
    const isLegacy = !bundle.format && bundle.salt && bundle.vault && bundle.check;
    if (isLegacy) {
      if (!allowLegacy) fail('UNSUPPORTED_FORMAT');
      return assertLegacyBundle(bundle);
    }

    if (bundle.format !== FORMAT) fail('UNSUPPORTED_FORMAT');
    const version = Number(bundle.formatVersion);
    if (!SUPPORTED_FORMAT_VERSIONS.has(version)) fail('UNSUPPORTED_FORMAT');
    if (typeof bundle.vaultId !== 'string' || bundle.vaultId.length < 1 || bundle.vaultId.length > 160) fail('INVALID_VAULT_ID');
    assertKdf(bundle.kdf);
    if (!bundle.cipher || bundle.cipher.name !== 'AES-GCM' || Number(bundle.cipher.length) !== 256 || Number(bundle.cipher.tagLength) !== 128) fail('INVALID_CIPHER');
    assertEncryptedPart(bundle.check, 'CHECK', 4096);
    assertEncryptedPart(bundle.payload, 'PAYLOAD');

    const revision = Number(bundle.revision);
    if (!Number.isInteger(revision) || revision < 1 || revision > Number.MAX_SAFE_INTEGER) fail('INVALID_REVISION');
    if (version >= 3 && (typeof bundle.operationId !== 'string' || bundle.operationId.length < 1 || bundle.operationId.length > 160)) fail('INVALID_OPERATION_ID');
    if (version < 3 && bundle.operationId != null && (typeof bundle.operationId !== 'string' || bundle.operationId.length > 160)) fail('INVALID_OPERATION_ID');
    assertIsoDate(bundle.updatedAt, 'UPDATED_AT');

    if (version >= 3) {
      assertEncryptedPart(bundle.wrappedKey, 'WRAPPED_KEY', DEK_BYTES + GCM_TAG_BYTES, DEK_BYTES + GCM_TAG_BYTES);
      if (!bundle.recovery || typeof bundle.recovery !== 'object') fail('INVALID_RECOVERY');
      assertKdf(bundle.recovery.kdf, 'RECOVERY_KDF');
      assertEncryptedPart(bundle.recovery.wrappedKey, 'RECOVERY_WRAPPED_KEY', DEK_BYTES + GCM_TAG_BYTES, DEK_BYTES + GCM_TAG_BYTES);
      assertIsoDate(bundle.recovery.createdAt, 'RECOVERY_CREATED_AT');
    }

    if (version >= 4) {
      if (!Array.isArray(bundle.ancestors) || bundle.ancestors.length > 32) fail('INVALID_ANCESTORS');
      const seenAncestors = new Set();
      for (const ancestor of bundle.ancestors) {
        if (typeof ancestor !== 'string' || ancestor.length < 1 || ancestor.length > 160 || seenAncestors.has(ancestor) || ancestor === bundle.operationId) fail('INVALID_ANCESTORS');
        seenAncestors.add(ancestor);
      }
      if (bundle.ownerBinding != null) base64ToBytes(bundle.ownerBinding, { label: 'OWNER_BINDING', exact: 32, max: 32 }).fill(0);
      assertEncryptedPart(bundle.integrity, 'INTEGRITY', 8192);
    }
    return true;
  }

  async function createBundle(password, vault, options = {}) {
    assertSecret(password);
    const vaultId = vault.id || randomId();
    const now = new Date().toISOString();
    const dek = await generateDEK();
    const ownerBinding = options.ownerAccountId ? await hashAccountIdentifier(options.ownerAccountId) : null;

    const passwordWrap = await buildWrap(password, dek, CURRENT_ITERATIONS, `wrap-password:${vaultId}`);
    const recoveryCode = generateRecoveryCode();
    const recoveryWrap = await buildWrap(assertRecoveryCode(recoveryCode), dek, CURRENT_ITERATIONS, `wrap-recovery:${vaultId}`);
    const operationId = randomId();
    const payload = await encrypt(dek, vault, `payload:${vaultId}`, FORMAT_VERSION);
    const bundle = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      vaultId,
      ownerBinding,
      kdf: passwordWrap.kdf,
      wrappedKey: passwordWrap.wrappedKey,
      recovery: {
        kdf: recoveryWrap.kdf,
        wrappedKey: recoveryWrap.wrappedKey,
        createdAt: now
      },
      cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
      check: await encrypt(dek, { marker: 'KEYRON_OK', vaultId }, `check:${vaultId}`, FORMAT_VERSION),
      payload,
      revision: 1,
      operationId,
      ancestors: [],
      updatedAt: now,
      deviceId: safeText(options.deviceId),
      saveReason: safeText(options.saveReason || 'vault-create', 80),
      locallySavedAt: now
    };
    bundle.integrity = await sealIntegrity(dek, bundle);
    assertValidBundle(bundle, { allowLegacy: false });
    return { key: dek, bundle, recoveryCode };
  }

  async function unlockBundle(password, bundle) {
    assertSecret(password);
    const isLegacy = !bundle?.format && bundle?.salt && bundle?.vault;
    assertValidBundle(bundle);
    if (isLegacy) {
      const salt = base64ToBytes(bundle.salt, { label: 'LEGACY_SALT', exact: SALT_BYTES, max: SALT_BYTES });
      const key = await deriveLegacyKey(password, salt);
      salt.fill(0);
      try {
        const check = await decryptLegacy(key, bundle.check);
        if (!check || check.check !== 'borion-senhas-ok') fail('INVALID_PASSWORD');
        const vault = await decryptLegacy(key, bundle.vault);
        return { key, vault, legacy: true, iterations: LEGACY_ITERATIONS, metadataProtected: false };
      } catch {
        fail('INVALID_PASSWORD');
      }
    }

    const version = Number(bundle.formatVersion);
    const iterations = Number(bundle.kdf.iterations);
    const salt = base64ToBytes(bundle.kdf.salt, { label: 'KDF_SALT', exact: SALT_BYTES, max: SALT_BYTES });
    try {
      if (bundle.wrappedKey) {
        const kek = await deriveKey(password, salt, iterations);
        const dek = await unwrapDEK(bundle.wrappedKey, kek, `wrap-password:${bundle.vaultId}`);
        const check = await decrypt(dek, bundle.check, `check:${bundle.vaultId}`, version);
        if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) fail('INVALID_PASSWORD');
        await verifyIntegrity(dek, bundle);
        const vault = await decrypt(dek, bundle.payload, `payload:${bundle.vaultId}`, version);
        return { key: dek, vault, legacy: false, iterations, metadataProtected: version >= 4 };
      }

      const key = await deriveKey(password, salt, iterations);
      const check = await decrypt(key, bundle.check, `check:${bundle.vaultId}`, version);
      if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) fail('INVALID_PASSWORD');
      const vault = await decrypt(key, bundle.payload, `payload:${bundle.vaultId}`, version);
      return { key, vault, legacy: false, iterations, metadataProtected: false };
    } catch (error) {
      if (error?.message === 'UNSUPPORTED_FORMAT') throw error;
      fail(error?.message === 'INVALID_BUNDLE_INTEGRITY' ? 'INVALID_BUNDLE_INTEGRITY' : 'INVALID_PASSWORD');
    } finally {
      salt.fill(0);
    }
  }

  async function unlockWithRecoveryCode(code, bundle) {
    assertValidBundle(bundle, { allowLegacy: false });
    if (!bundle?.recovery?.wrappedKey) fail('NO_RECOVERY');
    const canonical = assertRecoveryCode(code);
    const iterations = Number(bundle.recovery.kdf.iterations);
    const salt = base64ToBytes(bundle.recovery.kdf.salt, { label: 'RECOVERY_SALT', exact: SALT_BYTES, max: SALT_BYTES });
    const kek = await deriveKey(canonical, salt, iterations);
    salt.fill(0);
    let dek;
    try {
      dek = await unwrapDEK(bundle.recovery.wrappedKey, kek, `wrap-recovery:${bundle.vaultId}`);
      const check = await decrypt(dek, bundle.check, `check:${bundle.vaultId}`, Number(bundle.formatVersion));
      if (!check || check.marker !== 'KEYRON_OK' || check.vaultId !== bundle.vaultId) fail('INVALID_RECOVERY_CODE');
      await verifyIntegrity(dek, bundle);
    } catch (error) {
      if (error?.message === 'INVALID_BUNDLE_INTEGRITY') throw error;
      fail('INVALID_RECOVERY_CODE');
    }
    return dek;
  }

  async function decryptPayload(key, bundle) {
    assertValidBundle(bundle, { allowLegacy: false });
    await verifyIntegrity(key, bundle);
    return decrypt(key, bundle.payload, `payload:${bundle.vaultId}`, Number(bundle.formatVersion));
  }

  async function updateBundle(key, bundle, vault, metadata = {}) {
    assertValidBundle(bundle, { allowLegacy: false });
    if (!bundle.wrappedKey || !bundle.recovery?.wrappedKey) fail('REKEY_REQUIRED');
    const now = new Date().toISOString();
    const currentRevision = Number(bundle.revision || 0);
    const revision = metadata.revision === undefined ? currentRevision + 1 : Number(metadata.revision);
    if (!Number.isSafeInteger(revision) || revision <= currentRevision) fail('INVALID_REVISION');
    const operationId = safeText(metadata.operationId || randomId());
    const ownerBinding = metadata.ownerAccountId
      ? await hashAccountIdentifier(metadata.ownerAccountId)
      : (metadata.ownerBinding !== undefined ? metadata.ownerBinding : (bundle.ownerBinding || null));
    const payload = await encrypt(key, vault, `payload:${bundle.vaultId}`, FORMAT_VERSION);
    const ancestors = [bundle.operationId, ...(Array.isArray(bundle.ancestors) ? bundle.ancestors : [])]
      .filter((value, index, values) => typeof value === 'string' && value && value !== operationId && values.indexOf(value) === index)
      .slice(0, 32);
    const next = {
      ...bundle,
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      ownerBinding,
      cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
      check: await encrypt(key, { marker: 'KEYRON_OK', vaultId: bundle.vaultId }, `check:${bundle.vaultId}`, FORMAT_VERSION),
      payload,
      revision,
      operationId,
      ancestors,
      updatedAt: now,
      deviceId: safeText(metadata.deviceId ?? bundle.deviceId),
      saveReason: safeText(metadata.saveReason ?? bundle.saveReason, 80),
      locallySavedAt: safeText(metadata.locallySavedAt || now, 64)
    };
    next.integrity = await sealIntegrity(key, next);
    assertValidBundle(next, { allowLegacy: false });
    return next;
  }

  async function changePassword(dek, newPassword, bundle, metadata = {}) {
    assertValidBundle(bundle, { allowLegacy: false });
    const vault = await decryptPayload(dek, bundle);
    const passwordWrap = await buildWrap(newPassword, dek, CURRENT_ITERATIONS, `wrap-password:${bundle.vaultId}`);
    const base = {
      ...bundle,
      kdf: passwordWrap.kdf,
      wrappedKey: passwordWrap.wrappedKey
    };
    return updateBundle(dek, base, vault, { ...metadata, saveReason: metadata.saveReason || 'password-change' });
  }

  async function regenerateRecovery(dek, bundle, metadata = {}) {
    assertValidBundle(bundle, { allowLegacy: false });
    const vault = await decryptPayload(dek, bundle);
    const recoveryCode = generateRecoveryCode();
    const recoveryWrap = await buildWrap(assertRecoveryCode(recoveryCode), dek, CURRENT_ITERATIONS, `wrap-recovery:${bundle.vaultId}`);
    const base = {
      ...bundle,
      recovery: {
        kdf: recoveryWrap.kdf,
        wrappedKey: recoveryWrap.wrappedKey,
        createdAt: new Date().toISOString()
      }
    };
    return {
      bundle: await updateBundle(dek, base, vault, { ...metadata, saveReason: metadata.saveReason || 'recovery-regenerate' }),
      recoveryCode
    };
  }

  async function rekeyBundle(password, vault, existingVaultId, options = {}) {
    const nextVault = { ...vault, id: existingVaultId || vault.id || randomId() };
    return createBundle(password, nextVault, options);
  }

  async function rebindOwner(key, bundle, vault, ownerAccountId, metadata = {}) {
    return updateBundle(key, bundle, vault, { ...metadata, ownerAccountId, saveReason: metadata.saveReason || 'owner-rebind' });
  }

  function looksLikeEncryptedBundle(value) {
    try { return assertValidBundle(value); } catch { return false; }
  }

  return Object.freeze({
    CURRENT_ITERATIONS,
    MIN_ITERATIONS,
    MAX_ITERATIONS,
    FORMAT,
    FORMAT_VERSION,
    MAX_CIPHERTEXT_BYTES,
    randomId,
    generateRecoveryCode,
    canonicalRecoveryCode,
    hashAccountIdentifier,
    assertValidBundle,
    createBundle,
    unlockBundle,
    unlockWithRecoveryCode,
    decryptPayload,
    changePassword,
    regenerateRecovery,
    updateBundle,
    rekeyBundle,
    rebindOwner,
    looksLikeEncryptedBundle
  });
})();
