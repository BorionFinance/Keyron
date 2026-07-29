/* Keyron Documents Worker — cifra e decifra blocos fora da thread principal. */
(() => {
  'use strict';

  const encoder = new TextEncoder();
  let session = null;

  function aad({ vaultId, documentId, index, chunkCount, plainLength }) {
    return encoder.encode(`KEYRON|document-chunk|1|${vaultId}|${documentId}|${index}|${chunkCount}|${plainLength}`);
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  self.addEventListener('message', async (event) => {
    const message = event.data || {};
    try {
      if (message.type === 'init') {
        const raw = new Uint8Array(message.rawKey);
        const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        raw.fill(0);
        session = {
          key,
          mode: message.mode,
          vaultId: String(message.vaultId || ''),
          documentId: String(message.documentId || ''),
          chunkCount: Number(message.chunkCount || 0)
        };
        self.postMessage({ type: 'ready' });
        return;
      }

      if (message.type === 'close') {
        session = null;
        self.close();
        return;
      }

      if (message.type !== 'chunk' || !session) throw new Error('DOCUMENT_WORKER_NOT_READY');
      const index = Number(message.index);
      const plainLength = Number(message.plainLength);
      const additionalData = aad({ ...session, index, plainLength });

      if (session.mode === 'encrypt') {
        const plain = new Uint8Array(message.data);
        const iv = randomBytes(12);
        try {
          const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
            session.key,
            plain
          );
          self.postMessage({ type: 'result', index, iv: iv.buffer, data: cipherBuffer }, [iv.buffer, cipherBuffer]);
        } finally {
          plain.fill(0);
        }
        return;
      }

      const iv = new Uint8Array(message.iv);
      const cipher = new Uint8Array(message.data);
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
        session.key,
        cipher
      );
      cipher.fill(0);
      iv.fill(0);
      self.postMessage({ type: 'result', index, data: plainBuffer }, [plainBuffer]);
    } catch (error) {
      self.postMessage({ type: 'error', code: String(error?.message || 'DOCUMENT_WORKER_FAILED') });
    }
  });
})();
