// generator.js — Gerador de senhas. Usa crypto.getRandomValues (gerador
// criptograficamente seguro), nunca Math.random().

const BorionGenerator = (() => {
  const SETS = {
    lower: 'abcdefghijkmnopqrstuvwxyz', // sem "l" pra evitar confusão com "1"/"I"
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // sem "I" e "O"
    digits: '23456789', // sem 0 e 1
    symbols: '!@#$%^&*()-_=+[]{}?'
  };

  function generate(opts = {}) {
    const { length = 20, lower = true, upper = true, digits = true, symbols = true } = opts;

    let pool = '';
    if (lower) pool += SETS.lower;
    if (upper) pool += SETS.upper;
    if (digits) pool += SETS.digits;
    if (symbols) pool += SETS.symbols;
    if (!pool) pool = SETS.lower + SETS.digits;

    const randomVals = crypto.getRandomValues(new Uint32Array(length));
    let result = '';
    for (let i = 0; i < length; i++) {
      result += pool[randomVals[i] % pool.length];
    }
    return result;
  }

  // Estimativa simples de força, só pra dar feedback visual no gerador/formulário.
  function strength(password) {
    if (!password) return 0;
    let variety = 0;
    if (/[a-z]/.test(password)) variety++;
    if (/[A-Z]/.test(password)) variety++;
    if (/[0-9]/.test(password)) variety++;
    if (/[^a-zA-Z0-9]/.test(password)) variety++;
    const lengthScore = Math.min(password.length / 24, 1);
    return Math.round(((variety / 4) * 0.5 + lengthScore * 0.5) * 100);
  }

  return { generate, strength };
})();

if (typeof module !== 'undefined') module.exports = BorionGenerator;
