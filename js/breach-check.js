// Verificação de vazamentos pelo HIBP Pwned Passwords usando k-anonymity.
// A senha completa e o hash completo nunca são enviados: somente os 5 primeiros caracteres do SHA-1.
const KeyronBreachCheck = (() => {
  'use strict';

  const API = 'https://api.pwnedpasswords.com/range/';
  const encoder = new TextEncoder();

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  async function sha1(value) {
    const bytes = encoder.encode(String(value ?? ''));
    try {
      return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)));
    } finally {
      bytes.fill(0);
    }
  }

  function parseRange(text) {
    const map = new Map();
    String(text || '').split(/\r?\n/).forEach((line) => {
      const [suffix, count] = line.trim().split(':');
      if (/^[A-F0-9]{35}$/i.test(suffix || '')) map.set(suffix.toUpperCase(), Math.max(0, Number(count) || 0));
    });
    return map;
  }

  async function fetchPrefix(prefix) {
    const response = await fetch(`${API}${encodeURIComponent(prefix)}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    if (!response.ok) throw new Error(`HIBP_${response.status}`);
    return parseRange(await response.text());
  }

  async function checkEntries(entries, onProgress = null) {
    const candidates = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry?.password) continue;
      const hash = await sha1(entry.password);
      candidates.push({ entryId: entry.id, prefix: hash.slice(0, 5), suffix: hash.slice(5) });
    }

    const groups = new Map();
    candidates.forEach((candidate) => {
      if (!groups.has(candidate.prefix)) groups.set(candidate.prefix, []);
      groups.get(candidate.prefix).push(candidate);
    });

    const prefixes = Array.from(groups.keys());
    const results = [];
    let cursor = 0;
    let completed = 0;
    const workers = Array.from({ length: Math.min(3, Math.max(1, prefixes.length)) }, async () => {
      while (cursor < prefixes.length) {
        const index = cursor;
        cursor += 1;
        const prefix = prefixes[index];
        const matches = await fetchPrefix(prefix);
        for (const candidate of groups.get(prefix)) {
          results.push({ entryId: candidate.entryId, count: matches.get(candidate.suffix) || 0 });
        }
        completed += 1;
        onProgress?.({ completed, total: prefixes.length });
      }
    });
    await Promise.all(workers);
    return results;
  }

  function isWeeklyDue(lastCheckAt, reference = Date.now()) {
    if (!lastCheckAt) return true;
    const time = Date.parse(lastCheckAt);
    return !Number.isFinite(time) || (reference - time) >= 7 * 24 * 60 * 60 * 1000;
  }

  return Object.freeze({ sha1, parseRange, checkEntries, isWeeklyDue });
})();
