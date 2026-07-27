const KeyronGenerator = (() => {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DIGITS = '23456789';
  const SYMBOLS = '!@#$%&*+-_=?.';

  function secureIndex(max) {
    if (max <= 0) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  }

  function shuffle(chars) {
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = secureIndex(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars;
  }

  function generate(length = 24) {
    const size = Math.max(16, Math.min(128, Number(length) || 24));
    const sets = [LOWER, UPPER, DIGITS, SYMBOLS];
    const all = sets.join('');
    const chars = sets.map((set) => set[secureIndex(set.length)]);
    while (chars.length < size) chars.push(all[secureIndex(all.length)]);
    return shuffle(chars).join('');
  }

  function strength(password) {
    const value = String(password || '');
    if (!value) return 0;
    let pool = 0;
    if (/[a-z]/.test(value)) pool += 26;
    if (/[A-Z]/.test(value)) pool += 26;
    if (/\d/.test(value)) pool += 10;
    if (/[^A-Za-z0-9]/.test(value)) pool += 32;
    const entropy = pool ? value.length * Math.log2(pool) : 0;
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
    let score = Math.min(100, Math.round(entropy * 0.95));
    if (value.length < 12) score = Math.min(score, 38);
    if (variety < 3) score = Math.min(score, 58);
    if (/(.)\1{3,}/.test(value) || /1234|qwerty|senha|password/i.test(value)) score = Math.min(score, 28);
    return score;
  }

  return Object.freeze({ generate, strength });
})();
