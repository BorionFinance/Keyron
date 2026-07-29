/* Keyron Documents Crypto — objetos binários independentes, cifrados localmente antes do Drive. */
const KeyronDocumentsCrypto = (() => {
  'use strict';

  const FORMAT = 'keyron-document';
  const VERSION = 1;
  const MAGIC = new Uint8Array([0x4b, 0x45, 0x59, 0x52, 0x44, 0x4f, 0x43, 0x31]); // KEYRDOC1
  const CHUNK_BYTES = 2 * 1024 * 1024;
  const MAX_FILE_BYTES = 250 * 1024 * 1024;
  const MAX_CONTAINER_BYTES = 270 * 1024 * 1024;
  const TAG_BYTES = 16;
  const IV_BYTES = 12;
  const KEY_BYTES = 32;
  const HEADER_PREFIX_BYTES = MAGIC.length + 4;
  const MAX_HEADER_BYTES = 16 * 1024;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const activeSessions = new Set();

  const DANGEROUS_EXTENSIONS = new Set([
    'exe', 'com', 'scr', 'msi', 'msp', 'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'jar',
    'hta', 'lnk', 'url', 'reg', 'dll', 'sys', 'apk', 'appx', 'appxbundle', 'xll', 'chm', 'iso'
  ]);

  function fail(code) {
    throw new Error(code);
  }

  function assertNotAborted(signal) {
    if (signal?.aborted) fail('DOCUMENT_OPERATION_ABORTED');
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value, exact, label = 'BASE64') {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`INVALID_DOCUMENT_${label}`);
    let binary;
    try { binary = atob(value); } catch { fail(`INVALID_DOCUMENT_${label}`); }
    if (exact != null && binary.length !== exact) fail(`INVALID_DOCUMENT_${label}`);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function encodeU32(value) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value, false);
    return out;
  }

  function decodeU32(bytes, offset = 0) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < offset + 4) fail('INVALID_DOCUMENT_CONTAINER');
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
  }

  function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
    return diff === 0;
  }

  function cleanId(value) {
    const result = String(value || '').trim();
    if (!result || result.length > 180 || !/^[A-Za-z0-9._:-]+$/.test(result)) fail('INVALID_DOCUMENT_ID');
    return result;
  }

  function extensionOf(name) {
    const safe = String(name || '').split(/[\\/]/).pop() || '';
    const match = safe.match(/\.([A-Za-z0-9]{1,16})$/);
    return match ? match[1].toLowerCase() : '';
  }

  function sanitizeFilename(value, fallback = 'documento') {
    let name = String(value || '').normalize('NFC')
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 180);
    if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = fallback;
    return name;
  }

  function signature(bytes, values, offset = 0) {
    return values.every((value, index) => bytes[offset + index] === value);
  }

  async function inspectFile(file) {
    if (!(file instanceof Blob)) fail('DOCUMENT_FILE_REQUIRED');
    if (!Number.isFinite(file.size) || file.size <= 0) fail('DOCUMENT_EMPTY_FILE');
    if (file.size > MAX_FILE_BYTES) fail('DOCUMENT_TOO_LARGE');
    const name = sanitizeFilename(file.name || 'documento');
    const extension = extensionOf(name);
    if (DANGEROUS_EXTENSIONS.has(extension)) fail('DOCUMENT_DANGEROUS_TYPE');

    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    let detectedMime = 'application/octet-stream';
    let previewKind = 'generic';
    if (signature(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      detectedMime = 'application/pdf';
      previewKind = 'pdf';
    } else if (signature(head, [0xff, 0xd8, 0xff])) {
      detectedMime = 'image/jpeg';
      previewKind = 'image';
    } else if (signature(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      detectedMime = 'image/png';
      previewKind = 'image';
    } else if (signature(head, [0x52, 0x49, 0x46, 0x46]) && signature(head, [0x57, 0x45, 0x42, 0x50], 8)) {
      detectedMime = 'image/webp';
      previewKind = 'image';
    } else if (extension === 'svg' || extension === 'html' || extension === 'htm' || extension === 'xml') {
      // Pode ser guardado como binário, mas nunca será renderizado pelo Keyron.
      detectedMime = 'application/octet-stream';
      previewKind = 'generic';
    } else if (extension === 'txt') {
      detectedMime = 'text/plain';
    } else if (extension === 'csv') {
      detectedMime = 'text/csv';
    } else if (signature(head, [0x50, 0x4b, 0x03, 0x04])) {
      const office = {
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        zip: 'application/zip'
      };
      detectedMime = office[extension] || 'application/zip';
    }
    head.fill(0);
    return { name, extension, detectedMime, previewKind, bytes: file.size };
  }

  function ensureRootKey(documents) {
    if (!documents || typeof documents !== 'object') fail('DOCUMENTS_STATE_REQUIRED');
    if (documents.rootKey != null && documents.rootKey !== '') {
      try {
        const existing = base64ToBytes(documents.rootKey, KEY_BYTES, 'ROOT_KEY');
        existing.fill(0);
        return false;
      } catch {
        // Nunca substitua silenciosamente uma raiz inválida: isso tornaria todos os
        // documentos existentes irrecuperáveis e mascararia corrupção do cofre.
        fail('DOCUMENT_ROOT_KEY_INVALID');
      }
    }
    if (Array.isArray(documents.items) && documents.items.length > 0) {
      fail('DOCUMENT_ROOT_KEY_MISSING');
    }
    const raw = randomBytes(KEY_BYTES);
    documents.rootKey = bytesToBase64(raw);
    raw.fill(0);
    return true;
  }

  function wrapAad(vaultId, documentId) {
    return encoder.encode(`KEYRON|document-key-wrap|1|${vaultId}|${documentId}`);
  }

  async function importAesKey(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function wrapDocumentKey(rootKeyBase64, rawDocumentKey, vaultId, documentId) {
    const rootRaw = base64ToBytes(rootKeyBase64, KEY_BYTES, 'ROOT_KEY');
    const iv = randomBytes(IV_BYTES);
    try {
      const rootKey = await importAesKey(rootRaw);
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: wrapAad(vaultId, documentId), tagLength: 128 },
        rootKey,
        rawDocumentKey
      );
      return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)), algorithm: 'AES-256-GCM', version: 1 };
    } finally {
      rootRaw.fill(0);
      iv.fill(0);
    }
  }

  async function unwrapDocumentKey(rootKeyBase64, wrapped, vaultId, documentId) {
    if (!wrapped || wrapped.version !== 1) fail('INVALID_DOCUMENT_WRAPPED_KEY');
    const rootRaw = base64ToBytes(rootKeyBase64, KEY_BYTES, 'ROOT_KEY');
    const iv = base64ToBytes(wrapped.iv, IV_BYTES, 'WRAP_IV');
    const cipher = base64ToBytes(wrapped.data, KEY_BYTES + TAG_BYTES, 'WRAPPED_KEY');
    try {
      const rootKey = await importAesKey(rootRaw);
      const plain = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: wrapAad(vaultId, documentId), tagLength: 128 },
        rootKey,
        cipher
      ));
      if (plain.length !== KEY_BYTES) fail('INVALID_DOCUMENT_KEY');
      return plain;
    } catch {
      fail('DOCUMENT_AUTH_FAILED');
    } finally {
      rootRaw.fill(0);
      iv.fill(0);
      cipher.fill(0);
    }
  }

  function chunkAad(context, index, plainLength) {
    return encoder.encode(`KEYRON|document-chunk|1|${context.vaultId}|${context.documentId}|${index}|${context.chunkCount}|${plainLength}`);
  }

  async function createDirectSession(mode, rawKey, context) {
    const key = await importAesKey(rawKey);
    return {
      async process(index, data, iv = null, plainLength = data.byteLength) {
        if (mode === 'encrypt') {
          const localIv = randomBytes(IV_BYTES);
          try {
            const cipher = new Uint8Array(await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: localIv, additionalData: chunkAad(context, index, plainLength), tagLength: 128 },
              key,
              data
            ));
            return { iv: localIv, data: cipher };
          } finally {
            data.fill(0);
          }
        }
        try {
          const plain = new Uint8Array(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData: chunkAad(context, index, plainLength), tagLength: 128 },
            key,
            data
          ));
          data.fill(0);
          iv.fill(0);
          return { data: plain };
        } catch {
          fail('DOCUMENT_AUTH_FAILED');
        }
      },
      close() { /* direct WebCrypto session has no worker */ }
    };
  }

  async function createWorkerSession(mode, rawKey, context) {
    if (typeof Worker === 'undefined') return createDirectSession(mode, rawKey, context);
    let worker;
    try {
      worker = new Worker('js/documents-worker.js?v=1.0.F-docs-r1');
    } catch {
      return createDirectSession(mode, rawKey, context);
    }
    const pending = new Map();
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const session = {
      async process(index, data, iv = null, plainLength = data.byteLength) {
        await ready;
        return new Promise((resolve, reject) => {
          pending.set(index, { resolve, reject });
          const payload = { type: 'chunk', index, plainLength, data: data.buffer };
          const transfer = [data.buffer];
          if (iv) {
            payload.iv = iv.buffer;
            transfer.push(iv.buffer);
          }
          worker.postMessage(payload, transfer);
        });
      },
      close() {
        try { worker.postMessage({ type: 'close' }); } catch { /* noop */ }
        worker.terminate();
        activeSessions.delete(session);
        for (const waiter of pending.values()) waiter.reject(new Error('DOCUMENT_OPERATION_ABORTED'));
        pending.clear();
      }
    };
    activeSessions.add(session);
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'ready') {
        readyResolve();
        return;
      }
      if (message.type === 'error') {
        const error = new Error(message.code || 'DOCUMENT_WORKER_FAILED');
        if (pending.size) {
          for (const waiter of pending.values()) waiter.reject(error);
          pending.clear();
        } else {
          readyReject(error);
        }
        return;
      }
      if (message.type !== 'result') return;
      const waiter = pending.get(message.index);
      if (!waiter) return;
      pending.delete(message.index);
      waiter.resolve({
        iv: message.iv ? new Uint8Array(message.iv) : null,
        data: new Uint8Array(message.data)
      });
    });
    worker.addEventListener('error', () => {
      const error = new Error('DOCUMENT_WORKER_FAILED');
      readyReject(error);
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    });
    const workerKey = rawKey.slice();
    worker.postMessage({ type: 'init', mode, rawKey: workerKey.buffer, ...context }, [workerKey.buffer]);
    try {
      await ready;
      return session;
    } catch (error) {
      session.close();
      throw error;
    }
  }

  function buildHeader(documentId, chunkCount) {
    const header = encoder.encode(JSON.stringify({ format: FORMAT, version: VERSION, documentId, chunkSize: CHUNK_BYTES, chunkCount }));
    if (header.byteLength > MAX_HEADER_BYTES) fail('INVALID_DOCUMENT_HEADER');
    return header;
  }

  async function encryptFile(file, { vaultId, documentId, rootKey, signal, onProgress } = {}) {
    const inspection = await inspectFile(file);
    const cleanVaultId = cleanId(vaultId);
    const cleanDocumentId = cleanId(documentId);
    assertNotAborted(signal);
    const chunkCount = Math.ceil(file.size / CHUNK_BYTES);
    if (!chunkCount || chunkCount > 20000) fail('DOCUMENT_CHUNK_LIMIT');
    const rawKey = randomBytes(KEY_BYTES);
    let session;
    try {
      const wrappedKey = await wrapDocumentKey(rootKey, rawKey, cleanVaultId, cleanDocumentId);
      session = await createWorkerSession('encrypt', rawKey, { vaultId: cleanVaultId, documentId: cleanDocumentId, chunkCount });
      const header = buildHeader(cleanDocumentId, chunkCount);
      const parts = [MAGIC, encodeU32(header.byteLength), header];
      let cipherBytes = HEADER_PREFIX_BYTES + header.byteLength;
      for (let index = 0; index < chunkCount; index += 1) {
        assertNotAborted(signal);
        const start = index * CHUNK_BYTES;
        const end = Math.min(file.size, start + CHUNK_BYTES);
        const plain = new Uint8Array(await file.slice(start, end).arrayBuffer());
        const result = await session.process(index, plain, null, plain.byteLength);
        parts.push(result.iv, encodeU32(result.data.byteLength), result.data);
        cipherBytes += IV_BYTES + 4 + result.data.byteLength;
        onProgress?.({ stage: 'encrypting', loaded: end, total: file.size, percent: Math.round((end / file.size) * 100) });
      }
      const container = new Blob(parts, { type: 'application/octet-stream' });
      if (container.size !== cipherBytes || container.size > MAX_CONTAINER_BYTES) fail('INVALID_DOCUMENT_CONTAINER_SIZE');
      return {
        container,
        wrappedKey,
        inspection,
        cipherBytes: container.size,
        formatVersion: VERSION,
        chunkCount,
        integrity: 'AES-256-GCM-CHUNKED'
      };
    } finally {
      rawKey.fill(0);
      session?.close();
    }
  }

  async function readBytes(blob, offset, length) {
    if (offset < 0 || length < 0 || offset + length > blob.size) fail('INVALID_DOCUMENT_CONTAINER');
    return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
  }

  async function readHeader(blob, expectedDocumentId) {
    if (!(blob instanceof Blob) || blob.size < HEADER_PREFIX_BYTES + IV_BYTES + 4 + TAG_BYTES || blob.size > MAX_CONTAINER_BYTES) fail('INVALID_DOCUMENT_CONTAINER');
    const prefix = await readBytes(blob, 0, HEADER_PREFIX_BYTES);
    const magic = prefix.subarray(0, MAGIC.length);
    if (!equalBytes(magic, MAGIC)) fail('INVALID_DOCUMENT_MAGIC');
    const headerLength = decodeU32(prefix, MAGIC.length);
    prefix.fill(0);
    if (!headerLength || headerLength > MAX_HEADER_BYTES || HEADER_PREFIX_BYTES + headerLength >= blob.size) fail('INVALID_DOCUMENT_HEADER');
    const headerBytes = await readBytes(blob, HEADER_PREFIX_BYTES, headerLength);
    let header;
    try { header = JSON.parse(decoder.decode(headerBytes)); } catch { fail('INVALID_DOCUMENT_HEADER'); } finally { headerBytes.fill(0); }
    if (header?.format !== FORMAT || header?.version !== VERSION) fail('UNSUPPORTED_DOCUMENT_FORMAT');
    if (cleanId(header.documentId) !== cleanId(expectedDocumentId)) fail('DOCUMENT_ID_MISMATCH');
    if (!Number.isInteger(header.chunkCount) || header.chunkCount < 1 || header.chunkCount > 20000) fail('INVALID_DOCUMENT_HEADER');
    if (header.chunkSize !== CHUNK_BYTES) fail('INVALID_DOCUMENT_HEADER');
    return { ...header, dataOffset: HEADER_PREFIX_BYTES + headerLength };
  }

  async function decryptContainer(container, item, { vaultId, rootKey, signal, onProgress, consumer } = {}) {
    if (!item || typeof item !== 'object') fail('DOCUMENT_ITEM_REQUIRED');
    const cleanVaultId = cleanId(vaultId);
    const documentId = cleanId(item.id);
    const header = await readHeader(container, documentId);
    const rawKey = await unwrapDocumentKey(rootKey, item.wrappedKey, cleanVaultId, documentId);
    let session;
    let offset = header.dataOffset;
    let plainTotal = 0;
    try {
      session = await createWorkerSession('decrypt', rawKey, { vaultId: cleanVaultId, documentId, chunkCount: header.chunkCount });
      for (let index = 0; index < header.chunkCount; index += 1) {
        assertNotAborted(signal);
        const recordHeader = await readBytes(container, offset, IV_BYTES + 4);
        const iv = recordHeader.slice(0, IV_BYTES);
        const cipherLength = decodeU32(recordHeader, IV_BYTES);
        recordHeader.fill(0);
        if (cipherLength < TAG_BYTES + 1 || cipherLength > CHUNK_BYTES + TAG_BYTES) fail('INVALID_DOCUMENT_CHUNK');
        offset += IV_BYTES + 4;
        const cipher = await readBytes(container, offset, cipherLength);
        offset += cipherLength;
        const plainLength = cipherLength - TAG_BYTES;
        const result = await session.process(index, cipher, iv, plainLength);
        if (result.data.byteLength !== plainLength) fail('INVALID_DOCUMENT_CHUNK');
        plainTotal += plainLength;
        await consumer(result.data, index, header.chunkCount);
        onProgress?.({ stage: 'decrypting', loaded: plainTotal, total: Number(item.originalBytes || plainTotal), percent: Math.min(100, Math.round((plainTotal / Math.max(1, Number(item.originalBytes || plainTotal))) * 100)) });
      }
      if (offset !== container.size) fail('INVALID_DOCUMENT_TRAILING_DATA');
      if (Number(item.originalBytes || 0) !== plainTotal) fail('INVALID_DOCUMENT_PLAINTEXT_SIZE');
      return { bytes: plainTotal, header };
    } catch (error) {
      if (String(error?.message || '').includes('OperationError')) fail('DOCUMENT_AUTH_FAILED');
      throw error;
    } finally {
      rawKey.fill(0);
      session?.close();
    }
  }

  async function decryptToBlob(container, item, options = {}) {
    const parts = [];
    try {
      await decryptContainer(container, item, {
        ...options,
        consumer: async (plain) => { parts.push(plain); }
      });
      return new Blob(parts, { type: item.detectedMime || 'application/octet-stream' });
    } catch (error) {
      for (const part of parts) part.fill(0);
      throw error;
    }
  }

  async function decryptToWritable(container, item, writable, options = {}) {
    if (!writable || typeof writable.write !== 'function') fail('DOCUMENT_WRITABLE_REQUIRED');
    try {
      await decryptContainer(container, item, {
        ...options,
        consumer: async (plain) => {
          await writable.write(plain);
          plain.fill(0);
        }
      });
      await writable.close();
    } catch (error) {
      try { await writable.abort?.(error); } catch { /* noop */ }
      throw error;
    }
  }

  function terminateAll() {
    for (const session of [...activeSessions]) session.close();
    activeSessions.clear();
  }

  return Object.freeze({
    FORMAT,
    VERSION,
    CHUNK_BYTES,
    MAX_FILE_BYTES,
    MAX_CONTAINER_BYTES,
    inspectFile,
    sanitizeFilename,
    ensureRootKey,
    encryptFile,
    decryptToBlob,
    decryptToWritable,
    terminateAll,
    _test: Object.freeze({ readHeader, base64ToBytes, bytesToBase64, equalBytes })
  });
})();
