// Keyron Biometric — desbloqueio local por verificação do dispositivo via WebAuthn PRF.
// O registro contém apenas um envelope AES-GCM local; nunca é enviado ao Google Drive.
const KeyronBiometric = (() => {
  'use strict';

  const RECORD_PREFIX = 'biometric:';
  const RP_NAME = 'Keyron';
  const SCHEMA = 2;
  const MAX_CREDENTIAL_ID_BYTES = 1024;
  const MAX_ENVELOPE_BYTES = 4096;
  const MAX_PASSWORD_CHARS = 2048;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();

  function fail(code) { throw new Error(code); }

  function available() {
    return Boolean(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
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

  function bytesToBase64Url(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value, { label = 'BASE64URL', exact = null, min = 1, max = MAX_ENVELOPE_BYTES } = {}) {
    if (typeof value !== 'string' || !value || value.length > Math.ceil(max * 4 / 3) + 8 || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`INVALID_${label}`);
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    let binary;
    try { binary = atob(padded); } catch { fail(`INVALID_${label}`); }
    if (exact != null && binary.length !== exact) fail(`INVALID_${label}`);
    if (binary.length < min || binary.length > max) fail(`INVALID_${label}`);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  const recordKey = (vaultId) => `${RECORD_PREFIX}${vaultId}`;

  function aad(vaultId, credentialId, schema = SCHEMA) {
    return encoder.encode(`KEYRON|biometric:${vaultId}:${credentialId}|${schema}`);
  }

  function validateRecord(record, vaultId) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('INVALID_RECORD');
    const schema = Number(record.schema || 1);
    if (![1, 2].includes(schema)) fail('UNSUPPORTED_RECORD');
    if (record.vaultId !== vaultId || typeof vaultId !== 'string' || !vaultId || vaultId.length > 160) fail('INVALID_RECORD_VAULT');
    const credentialId = base64UrlToBytes(record.credentialId, { label: 'CREDENTIAL_ID', min: 16, max: MAX_CREDENTIAL_ID_BYTES });
    const salt = base64UrlToBytes(record.salt, { label: 'PRF_SALT', exact: 32, max: 32 });
    const iv = base64UrlToBytes(record.iv, { label: 'IV', exact: 12, max: 12 });
    const data = base64UrlToBytes(record.data, { label: 'DATA', min: 17, max: MAX_ENVELOPE_BYTES });
    if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) fail('INVALID_RECORD_DATE');
    return { schema, credentialId, salt, iv, data };
  }

  async function hasRecord(vaultId) {
    if (!vaultId) return false;
    try {
      const record = await KeyronStorage.get(recordKey(vaultId));
      if (!record) return false;
      const parsed = validateRecord(record, vaultId);
      parsed.credentialId.fill(0); parsed.salt.fill(0); parsed.iv.fill(0); parsed.data.fill(0);
      return true;
    } catch {
      return false;
    }
  }

  async function forget(vaultId) {
    if (!vaultId) return;
    await KeyronStorage.remove(recordKey(vaultId)).catch(() => null);
  }

  async function deriveWrapKey(prfBytes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prfBytes));
    try {
      return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally {
      digest.fill(0);
    }
  }

  function extractPrfBytes(assertion) {
    const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
    if (!first) fail('PRF_UNAVAILABLE');
    const bytes = new Uint8Array(first);
    if (bytes.length < 16 || bytes.length > 128) fail('INVALID_PRF_OUTPUT');
    return bytes;
  }

  async function enroll(vaultId, password, accountLabel) {
    if (typeof vaultId !== 'string' || !vaultId || vaultId.length > 160 || typeof password !== 'string' || !password || password.length > MAX_PASSWORD_CHARS) fail('MISSING_PARAMS');
    if (!(await platformAvailable())) fail('PLATFORM_UNAVAILABLE');

    const userId = randomBytes(32);
    const challenge = randomBytes(32);
    let created;
    try {
      created = await navigator.credentials.create({
        publicKey: {
          rp: { name: RP_NAME, id: window.location.hostname },
          user: {
            id: userId,
            name: String(accountLabel || 'keyron-vault').slice(0, 64),
            displayName: 'Keyron'
          },
          challenge,
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'required'
          },
          attestation: 'none',
          timeout: 60000,
          extensions: { prf: {} }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') fail('USER_CANCELLED');
      fail('CREATE_FAILED');
    } finally {
      userId.fill(0);
      challenge.fill(0);
    }
    if (!created) fail('CREATE_FAILED');
    if (!created.getClientExtensionResults?.()?.prf?.enabled) fail('PRF_NOT_SUPPORTED');

    const credentialIdText = bytesToBase64Url(created.rawId);
    const credentialId = base64UrlToBytes(credentialIdText, { label: 'CREDENTIAL_ID', min: 16, max: MAX_CREDENTIAL_ID_BYTES });
    const salt = randomBytes(32);
    const assertionChallenge = randomBytes(32);
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: assertionChallenge,
          rpId: window.location.hostname,
          allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') fail('USER_CANCELLED');
      fail('PRF_EVAL_FAILED');
    } finally {
      assertionChallenge.fill(0);
      credentialId.fill(0);
    }

    const prfBytes = extractPrfBytes(assertion);
    const wrapKey = await deriveWrapKey(prfBytes);
    prfBytes.fill(0);
    const iv = randomBytes(12);
    const passwordBytes = encoder.encode(password);
    const associated = aad(vaultId, credentialIdText, SCHEMA);
    let cipher;
    try {
      cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: associated, tagLength: 128 },
        wrapKey,
        passwordBytes
      );
    } finally {
      passwordBytes.fill(0);
      associated.fill(0);
    }

    const record = {
      schema: SCHEMA,
      vaultId,
      credentialId: credentialIdText,
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      data: bytesToBase64Url(cipher),
      createdAt: new Date().toISOString()
    };
    salt.fill(0);
    iv.fill(0);
    await KeyronStorage.set(recordKey(vaultId), record);
    return true;
  }

  async function unlock(vaultId) {
    if (!vaultId) fail('MISSING_PARAMS');
    const record = await KeyronStorage.get(recordKey(vaultId));
    if (!record) fail('NO_RECORD');
    const parsed = validateRecord(record, vaultId);
    const challenge = randomBytes(32);
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [{ id: parsed.credentialId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: parsed.salt } } }
        }
      });
    } catch (error) {
      if (error?.name === 'NotAllowedError') fail('USER_CANCELLED');
      fail('ASSERTION_FAILED');
    } finally {
      challenge.fill(0);
    }

    const prfBytes = extractPrfBytes(assertion);
    const wrapKey = await deriveWrapKey(prfBytes);
    prfBytes.fill(0);
    const associated = parsed.schema >= 2 ? aad(vaultId, record.credentialId, parsed.schema) : null;
    let plainBytes;
    try {
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: parsed.iv,
          additionalData: associated || undefined,
          tagLength: 128
        },
        wrapKey,
        parsed.data
      );
      plainBytes = new Uint8Array(plain);
      const password = decoder.decode(plainBytes);
      if (!password || password.length > MAX_PASSWORD_CHARS) fail('UNWRAP_FAILED');

      // Migra silenciosamente os envelopes biométricos antigos para o schema com AAD
      // depois que a verificação do dispositivo já foi concluída com sucesso.
      if (parsed.schema < SCHEMA) {
        const migratedIv = randomBytes(12);
        const migratedAad = aad(vaultId, record.credentialId, SCHEMA);
        try {
          const migratedCipher = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: migratedIv, additionalData: migratedAad, tagLength: 128 },
            wrapKey,
            plainBytes
          );
          await KeyronStorage.set(recordKey(vaultId), {
            schema: SCHEMA,
            vaultId,
            credentialId: record.credentialId,
            salt: record.salt,
            iv: bytesToBase64Url(migratedIv),
            data: bytesToBase64Url(migratedCipher),
            createdAt: record.createdAt,
            migratedAt: new Date().toISOString()
          });
        } finally {
          migratedIv.fill(0);
          migratedAad.fill(0);
        }
      }
      return password;
    } catch {
      fail('UNWRAP_FAILED');
    } finally {
      parsed.credentialId.fill(0);
      parsed.salt.fill(0);
      parsed.iv.fill(0);
      parsed.data.fill(0);
      associated?.fill(0);
      plainBytes?.fill(0);
    }
  }

  return Object.freeze({ available, platformAvailable, hasRecord, enroll, unlock, forget });
})();
