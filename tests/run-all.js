'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const suites = [
  ['núcleo', 'core-tests.js', 15],
  ['segurança dinâmica', 'security-tests.js', 25],
  ['Drive simulado', 'drive-tests.js', 8],
  ['acesso offline', 'offline-access-tests.js', 14],
  ['segurança estática', 'static-security-tests.js', 38]
];
const repeats = Math.max(1, Math.min(100, Number(process.argv[2] || 1)));
const assertionsPerRound = suites.reduce((sum, suite) => sum + suite[2], 0);

for (let round = 1; round <= repeats; round += 1) {
  for (const [name, file] of suites) {
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    if (result.status !== 0) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      console.error(`RODADA ${round} FALHOU: ${name}`);
      process.exit(result.status || 1);
    }
  }
  console.log(`RODADA ${String(round).padStart(2, '0')}/${repeats}: ${assertionsPerRound}/${assertionsPerRound} aprovados`);
}

console.log(`TOTAL: ${repeats * assertionsPerRound}/${repeats * assertionsPerRound} verificações aprovadas em ${repeats} rodada(s).`);
