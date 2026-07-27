// crypto.js — Núcleo de criptografia do Borion Senhas
//
// Regra de ouro deste arquivo: a senha mestra NUNCA é salva em disco,
// em localStorage ou no Drive. Ela só existe na memória (numa CryptoKey
// não-extraível) enquanto o cofre está desbloqueado. Tudo que sai daqui
// pra fora (localStorage ou Drive) já está cifrado.

const BorionCrypto = (() => {
  const PBKDF2_ITERATIONS = 250000; // custo alto de propósito, dificulta força bruta offline
  const SALT_BYTES = 16;
  const IV_BYTES = 12; // tamanho recomendado do IV para AES-GCM

  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function randomBytes(len) {
    return crypto.getRandomValues(new Uint8Array(len));
  }

  function generateSalt() {
    return randomBytes(SALT_BYTES);
  }

  function saltToBase64(saltBytes) {
    return bufToBase64(saltBytes);
  }

  function saltFromBase64(b64) {
    return new Uint8Array(base64ToBuf(b64));
  }

  // Deriva uma CryptoKey AES-256-GCM a partir da senha mestra + salt.
  // extractable = false: essa chave nunca pode ser lida/exportada de volta
  // pra uma string, nem pelo próprio app — só dá pra usar pra cifrar/decifrar.
  async function deriveKey(masterPassword, saltBytes, iterations = PBKDF2_ITERATIONS) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(key, plainObject) {
    const iv = randomBytes(IV_BYTES);
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(plainObject));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { iv: bufToBase64(iv), data: bufToBase64(cipherBuf) };
  }

  async function decrypt(key, payload) {
    const iv = new Uint8Array(base64ToBuf(payload.iv));
    const cipherBuf = base64ToBuf(payload.data);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBuf));
  }

  // Não guardamos a senha em lugar nenhum, mas guardamos um pequeno objeto
  // cifrado com um valor conhecido. Isso permite confirmar rapidamente se a
  // senha digitada está certa (AES-GCM falha a decifrar com chave errada —
  // é assim que "senha incorreta" é detectado, sem nunca comparar a senha
  // em si com nada).
  async function makeCheck(key) {
    return encrypt(key, { check: 'borion-senhas-ok' });
  }

  async function verifyCheck(key, checkPayload) {
    try {
      const result = await decrypt(key, checkPayload);
      return !!(result && result.check === 'borion-senhas-ok');
    } catch (e) {
      return false;
    }
  }

  return {
    PBKDF2_ITERATIONS,
    generateSalt, saltToBase64, saltFromBase64,
    deriveKey, encrypt, decrypt, makeCheck, verifyCheck
  };
})();

if (typeof module !== 'undefined') module.exports = BorionCrypto;
