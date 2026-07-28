'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const app = read('js/app.js');
const cryptoJs = read('js/crypto.js');
const drive = read('js/drive.js');
const biometric = read('js/biometric.js');
const storage = read('js/storage.js');
const saveEngine = read('js/save-engine.js');
const vault = read('js/vault.js');
const breach = read('js/breach-check.js');
const config = read('js/config.js');
const sw = read('service-worker.js');
const frameGuard = read('js/frame-guard.js');
const offlineAccess = read('js/offline-access.js');
const allSource = [index, app, cryptoJs, drive, biometric, storage, saveEngine, vault, breach, config, sw, frameGuard, offlineAccess].join('\n');

let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}
function refs(text, attr) {
  return Array.from(text.matchAll(new RegExp(`${attr}=["']([^"']+)["']`, 'g')), (match) => match[1]);
}

try {
  test('Todos os JavaScript passam na verificação de sintaxe', () => {
    const files = fs.readdirSync(path.join(root, 'js')).filter((file) => file.endsWith('.js'))
      .concat(['service-worker.js']).map((file) => file === 'service-worker.js' ? file : `js/${file}`);
    for (const file of files) cp.execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  });

  test('Versão oficial 1.0.F é consistente', () => {
    assert(config.includes("APP_VERSION: '1.0.F'"), 'config sem 1.0.F');
    assert(index.includes('v=1.0.F'), 'HTML sem 1.0.F');
    assert(sw.includes("keyron-shell-v1.0.F"), 'cache sem 1.0.F');
    assert(!/0\.6\.3|1\.0\.0/.test([index, config, sw].join('\n')), 'referência de versão antiga');
  });

  test('Referências locais do HTML existem', () => {
    const localRefs = [...refs(index, 'src'), ...refs(index, 'href')]
      .filter((value) => !value.startsWith('http') && !value.startsWith('#'));
    for (const ref of localRefs) {
      const clean = ref.split('?')[0];
      assert(fs.existsSync(path.join(root, clean)), `arquivo ausente: ${clean}`);
    }
  });

  test('Recursos locais referenciados pelo CSS existem', () => {
    const css = read('css/style.css');
    const urls = Array.from(css.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1])
      .filter((value) => !value.startsWith('data:') && !value.startsWith('http'));
    for (const ref of urls) {
      const resolved = path.resolve(root, 'css', ref);
      assert(fs.existsSync(resolved), `recurso CSS ausente: ${ref}`);
    }
  });

  test('Recursos declarados no cache PWA existem', () => {
    const shell = Array.from(sw.matchAll(/'\.\/([^']+)'/g), (match) => match[1]);
    for (const ref of shell) {
      if (!ref) continue;
      const clean = ref.split('?')[0];
      assert(fs.existsSync(path.join(root, clean)), `recurso do cache ausente: ${clean}`);
    }
  });

  test('IDs do HTML são únicos', () => {
    const ids = Array.from(index.matchAll(/\sid=["']([^"']+)["']/g), (match) => match[1]);
    assert(new Set(ids).size === ids.length, 'há IDs duplicados');
  });

  test('Todos os IDs buscados pelo app existem no HTML', () => {
    const ids = new Set(Array.from(index.matchAll(/\sid=["']([^"']+)["']/g), (match) => match[1]));
    const queried = new Set(Array.from(app.matchAll(/\$\('#([^']+)'\)/g), (match) => match[1]));
    const missing = [...queried].filter((id) => !ids.has(id));
    assert(missing.length === 0, `IDs ausentes: ${missing.join(', ')}`);
  });

  test('Não há handlers inline nem execução dinâmica', () => {
    assert(!/\son[a-z]+\s*=/i.test(index), 'handler inline encontrado');
    assert(!/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(allSource), 'execução dinâmica encontrada');
  });

  test('Usos de innerHTML são estáticos e limitados', () => {
    const lines = app.split('\n').filter((line) => line.includes('.innerHTML'));
    assert(lines.length === 3, `quantidade inesperada de innerHTML: ${lines.length}`);
    assert(lines.every((line) => !/\$\{|entry\.|vault\.|value\b|user\b/.test(line)), 'dado variável em innerHTML');
  });

  test('CSP bloqueia objetos, base, enquadramento e scripts inline', () => {
    const csp = index.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
    assert(csp.includes("object-src 'none'"), 'object-src ausente');
    assert(csp.includes("base-uri 'none'"), 'base-uri ausente');
    assert(csp.includes("frame-ancestors 'none'"), 'frame-ancestors ausente');
    assert(csp.includes("script-src 'self' https://accounts.google.com"), 'script-src inesperado');
    assert(!/script-src[^;]*'unsafe-inline'/.test(csp), 'script inline permitido');
    assert(!/script-src[^;]*'unsafe-eval'/.test(csp), 'eval permitido');
  });

  test('Proteção anti-clickjacking carrega antes da interface', () => {
    const guardAt = index.indexOf('js/frame-guard.js');
    const cssAt = index.indexOf('css/style.css');
    const appAt = index.indexOf('js/app.js');
    assert(guardAt > 0 && guardAt < cssAt && guardAt < appAt, 'frame guard fora de ordem');
    assert(frameGuard.includes('window.top !== window.self') && frameGuard.includes("style.display = 'none'"), 'frame guard incompleto');
    assert(app.includes('window.__KEYRON_FRAME_BLOCKED__'), 'app não respeita bloqueio de frame');
  });

  test('Único script remoto é o Google Identity Services', () => {
    const remote = refs(index, 'src').filter((value) => value.startsWith('http'));
    assert(remote.length === 1 && remote[0] === 'https://accounts.google.com/gsi/client', `scripts remotos: ${remote.join(', ')}`);
  });

  test('Não há segredo OAuth ou chave privada embutida', () => {
    assert(!/client_secret/i.test(allSource), 'client_secret encontrado');
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(allSource), 'chave privada encontrada');
    assert(!/AIza[0-9A-Za-z_-]{30,}/.test(allSource), 'API key Google encontrada');
  });

  test('OAuth usa somente drive.file', () => {
    assert(drive.includes("const SCOPE = 'https://www.googleapis.com/auth/drive.file'"), 'escopo drive.file ausente');
    assert(!/auth\/drive['"\s]/.test(drive), 'escopo amplo drive encontrado');
    assert(drive.includes("id: profile.permissionId || ''"), 'vínculo não exige permissionId estável');
  });

  test('Token OAuth fica apenas em memória', () => {
    const storageLines = drive.split('\n').filter((line) => /localStorage|sessionStorage/.test(line));
    assert(storageLines.every((line) => !/accessToken|access_token|Authorization/.test(line)), 'token persistido');
    assert(drive.includes('let accessToken = null'), 'token em memória ausente');
  });

  test('Autorização offline usa chave HMAC SHA-256 não exportável em IndexedDB separado', () => {
    assert(offlineAccess.includes("const DB_NAME = 'keyron-offline-access-v1'"), 'banco separado ausente');
    assert(offlineAccess.includes("{ name: 'HMAC', hash: 'SHA-256', length: 256 }"), 'HMAC-SHA-256 ausente');
    assert(offlineAccess.includes("false,") && offlineAccess.includes("['sign', 'verify']"), 'chave local não exportável ausente');
    assert(offlineAccess.includes('key.extractable === false'), 'validação de não exportabilidade ausente');
    assert(!/localStorage|sessionStorage/.test(offlineAccess), 'autorização offline tem fallback fraco');
  });

  test('Atualizações da autorização offline são serializadas entre salvamentos e abas', () => {
    assert(offlineAccess.includes('const mutationQueues = new Map()'), 'fila local de mutações ausente');
    assert(offlineAccess.includes('navigator?.locks?.request') && offlineAccess.includes("mode: 'exclusive'"), 'Web Locks entre abas ausente');
    assert(offlineAccess.includes('withMutationLock(bundle?.vaultId'), 'avanço da âncora não é serializado');
  });

  test('Selo offline vincula conta, cofre, dispositivo, validade e linhagem', () => {
    for (const token of ['vaultId', 'ownerBinding', 'deviceId', 'operationId', 'revision', 'verifiedAt', 'expiresAt', 'lastSeenAt', 'nonce']) {
      assert(offlineAccess.includes(`record.${token}`), `campo offline não selado: ${token}`);
    }
    assert(offlineAccess.includes("'KEYRON_OFFLINE_ACCESS'"), 'separação de domínio HMAC ausente');
    assert(offlineAccess.includes("crypto.subtle.verify('HMAC'"), 'prova HMAC não é verificada');
  });

  test('Acesso offline falha fechado em expiração, relógio e rollback', () => {
    assert(offlineAccess.includes('OFFLINE_ACCESS_EXPIRED'), 'expiração não bloqueia');
    assert(offlineAccess.includes('OFFLINE_ACCESS_CLOCK_ROLLBACK'), 'retrocesso do relógio não bloqueia');
    assert(offlineAccess.includes('OFFLINE_ACCESS_LINEAGE_MISMATCH'), 'linhagem divergente não bloqueia');
    assert(offlineAccess.includes('OFFLINE_ACCESS_REVISION_ROLLBACK'), 'revisão regressiva não bloqueia');
    assert(offlineAccess.includes('bundle?.ancestors') && offlineAccess.includes('record.operationId'), 'descendência não é comprovada');
  });

  test('Aplicação exige autorização local antes da senha e Google antes de sincronizar', () => {
    assert(app.includes("authorizeOfflineSession('network-offline')"), 'entrada offline inicial ausente');
    assert(app.includes("authorizeOfflineSession('google-unavailable')"), 'fallback quando Google falha ausente');
    assert(app.includes('bundleAuthorizedForUnlock(rawBundle)'), 'desbloqueio não valida autorização offline');
    assert(app.includes('!state.googleVerified || !KeyronDrive.isConnected()'), 'operações remotas não exigem Google');
    assert(app.includes("setSyncStatus(state.offlineAuthorized ? 'trusted'"), 'estado offline confiável ausente');
  });

  test('Operações sensíveis não criam divergência enquanto offline', () => {
    assert(app.includes('Verifique o Google antes de trocar a senha mestra'), 'troca de senha permitida offline');
    assert(app.includes('Verifique o Google antes de gerar uma nova chave de recuperação'), 'nova recuperação permitida offline');
    assert(app.includes('GOOGLE_REQUIRED_FOR_IMPORT'), 'importação não exige Google');
    assert(app.includes("if (!state.googleVerified)") && app.includes("A recuperação exige uma nova verificação Google"), 'recuperação por chave permitida offline');
  });

  test('PWA inclui módulo e interface de dispositivo confiável', () => {
    assert(index.includes('js/offline-access.js?v=1.0.F-r2'), 'script offline ausente no HTML');
    assert(sw.includes("'./js/offline-access.js?v=1.0.F-r2'"), 'script offline ausente no cache PWA');
    assert(index.includes('id="offline-access-section"'), 'configuração offline ausente');
    assert(index.includes('id="offline-access-banner"'), 'aviso de sessão offline ausente');
    assert(config.includes('OFFLINE_TRUST_DAYS: 30'), 'validade offline não configurada em 30 dias');
  });


  test('Opção offline permanece visível e o PWA força o build corrigido', () => {
    const offlinePos = index.indexOf('id="offline-access-section"');
    const biometricPos = index.indexOf('id="biometric-section"');
    assert(offlinePos > 0 && offlinePos < biometricPos, 'opção offline não está no topo de Segurança');
    assert(index.includes('id="offline-access-unavailable"'), 'mensagem de incompatibilidade ausente');
    assert(app.includes('el.offlineAccessSection.hidden = false'), 'interface offline pode sumir silenciosamente');
    assert(sw.includes("keyron-shell-v1.0.F-r2"), 'cache corrigido não foi versionado');
    assert(app.includes("service-worker.js?v=1.0.F-r2") && app.includes("updateViaCache: 'none'"), 'atualização forçada do PWA ausente');
  });

  test('Drive combina If-Match com preflight de linhagem e confirmação sem ETag', () => {
    assert(drive.includes("headers['If-Match'] = expectedEtag"), 'If-Match condicional ausente');
    assert(drive.includes("response.status === 412 ? 'DRIVE_CONFLICT'"), '412 não tratado');
    assert(drive.includes('bundleDescendsFrom') && drive.includes('DRIVE_CONFLICT_LINEAGE'), 'preflight de linhagem ausente');
    assert(drive.includes('DRIVE_CONFLICT_CONFIRMATION'), 'leitura de confirmação sem ETag ausente');
    assert(app.includes('handleDriveConflict'), 'conflito não tratado no app');
    assert(drive.includes('serializeBundle') && drive.includes('DRIVE_VAULT_TOO_LARGE'), 'limite de upload ausente');
  });

  test('Formato cifrado usa AES-256-GCM e PBKDF2-SHA-256 600 mil', () => {
    assert(cryptoJs.includes('const CURRENT_ITERATIONS = 600000'), 'iterações divergentes');
    assert(cryptoJs.includes("{ name: 'AES-GCM', length: 256 }"), 'AES-256 ausente');
    assert(cryptoJs.includes("hash: 'SHA-256'"), 'SHA-256 ausente');
    assert(cryptoJs.includes('tagLength: 128'), 'tag GCM ausente');
    assert(cryptoJs.includes('additionalData'), 'AAD ausente');
  });

  test('Selo cobre conteúdo, envelope, conta e linhagem', () => {
    for (const token of ['payloadHash', 'envelopeHash', 'ownerBinding', 'ancestors', 'operationId', 'revision']) {
      assert(cryptoJs.includes(token), `campo de integridade ausente: ${token}`);
    }
    assert(cryptoJs.includes('INVALID_BUNDLE_INTEGRITY'), 'erro de integridade ausente');
  });

  test('Validação defensiva limita KDF, ciphertext e Base64', () => {
    assert(cryptoJs.includes('MAX_ITERATIONS = 2000000'), 'limite KDF ausente');
    assert(cryptoJs.includes('MAX_CIPHERTEXT_BYTES = 64 * 1024 * 1024'), 'limite ciphertext ausente');
    assert(cryptoJs.includes('INVALID_ANCESTORS'), 'validação de linhagem ausente');
    assert(cryptoJs.includes("INVALID_${label}"), 'validação Base64 ausente');
    assert(!/Math\.random\s*\(/.test(allSource), 'PRNG fraco encontrado');
  });

  test('Biometria local usa WebAuthn PRF, AAD e verificação obrigatória', () => {
    assert(biometric.includes('const SCHEMA = 2'), 'schema biométrico antigo');
    assert(biometric.includes('KEYRON|biometric:'), 'AAD biométrico ausente');
    assert((biometric.match(/userVerification: 'required'/g) || []).length >= 2, 'verificação do usuário não obrigatória');
    assert(biometric.includes("attestation: 'none'"), 'attestation não minimizada');
    assert(biometric.includes('prfBytes.fill(0)'), 'PRF não limpo');
  });

  test('Armazenamento local declara somente bundles cifrados', () => {
    assert(storage.startsWith('// Armazena somente o bundle cifrado'), 'contrato de armazenamento divergente');
    assert(!/saveCurrent\([^)]*vault/i.test(storage), 'cofre legível salvo diretamente');
    assert(saveEngine.includes('WAL cifrado primeiro'), 'WAL cifrado ausente');
  });


  test('Fallback e WAL não ressuscitam nem descartam versões divergentes', () => {
    assert(storage.includes('localRemove(fallbackKeyFor(key))'), 'fallback antigo não é limpo');
    assert(saveEngine.includes('confirmedDescendsPending'), 'confirmação do WAL não usa linhagem');
    assert(saveEngine.includes('Nunca descarte um WAL divergente'), 'proteção contra descarte divergente ausente');
    assert(app.includes('pending.ancestors.includes(stored.operationId)'), 'startup não valida descendência do WAL');
  });

  test('URL externa aceita apenas HTTP e HTTPS', () => {
    assert(app.includes("if (!['http:', 'https:'].includes(parsed.protocol))"), 'filtro de protocolo ausente');
    assert(!/javascript:\s*/i.test(index), 'javascript: no HTML');
  });

  test('Logos aceitam somente PNG, JPEG e WebP com limites', () => {
    assert(app.includes("new Set(['image/png', 'image/jpeg', 'image/webp'])"), 'whitelist de imagem ausente');
    assert(vault.includes("data:image\\/(png|jpeg|webp)"), 'validação de data URL ausente');
    assert(app.includes('MAX_LOGO_PIXELS') && app.includes('MAX_LOGO_SIDE'), 'limites de dimensão ausentes');
    assert(app.includes('hasValidImageSignature') && app.includes('INVALID_IMAGE_SIGNATURE'), 'assinatura real da imagem não é conferida');
  });

  test('Importações têm limites de tamanho e quantidade', () => {
    assert(app.includes('MAX_BUNDLE_BYTES'), 'limite de backup ausente');
    assert(app.includes('MAX_CSV_BYTES'), 'limite CSV ausente');
    assert(app.includes('MAX_CSV_ROWS'), 'limite de linhas CSV ausente');
    assert(vault.includes('MAX_ENTRIES = 10000'), 'limite de entradas ausente');
    assert(index.includes('id="master-password" minlength="12" maxlength="2048"'), 'limite da senha mestra ausente');
  });

  test('Verificação HIBP envia só prefixo e limita resposta', () => {
    assert(breach.includes("headers: { 'Add-Padding': 'true' }"), 'padding HIBP ausente');
    assert(breach.includes('hash.slice(0, 5)') && breach.includes('hash.slice(5)'), 'k-anonymity ausente');
    assert(breach.includes('MAX_RESPONSE_BYTES'), 'limite de resposta ausente');
    assert(breach.includes("credentials: 'omit'"), 'credenciais enviadas ao HIBP');
  });

  test('Bloqueio limpa UI, clipboard, aba oculta e BFCache', () => {
    assert(app.includes('scrubSensitiveUi'), 'limpeza de UI ausente');
    assert(app.includes('clearOwnedClipboard'), 'limpeza de clipboard ausente');
    assert(app.includes('HIDDEN_LOCK_SECONDS'), 'bloqueio em aba oculta ausente');
    assert(app.includes('event.persisted && state.key'), 'proteção BFCache ausente');
    assert(app.includes('belongsToCurrentGoogleAccount(state.bundle)') && app.includes('unlockWithRecoveryCode'), 'recuperação não vinculada à conta');
    const lockBlock = app.slice(app.indexOf('async function lockVault'), app.indexOf('function resetAutoLockTimer'));
    assert(lockBlock.indexOf('state.key = null') < lockBlock.indexOf('await KeyronSaveEngine.flush'), 'chave não é descartada antes da espera de I/O');
  });

  test('Service Worker não entrega HTML no lugar de JS/CSS', () => {
    assert(sw.includes('if (navigation)'), 'fallback não condicionado à navegação');
    assert(sw.includes("new Response('Recurso indisponível offline.'"), 'erro 503 ausente');
    assert(sw.includes("headers.set('X-Content-Type-Options', 'nosniff')"), 'nosniff ausente');
    assert(sw.includes("headers.set('X-Frame-Options', 'DENY')"), 'X-Frame-Options ausente');
    assert(sw.includes("headers.set('Content-Security-Policy', CSP)"), 'CSP em navegação PWA ausente');
    assert(sw.includes("headers.set('Permissions-Policy'"), 'Permissions-Policy ausente');
    assert(sw.includes("headers.set('Cross-Origin-Resource-Policy', 'same-origin')"), 'CORP ausente');
    assert(sw.includes('SHELL_URLS.has(event.request.url)') && sw.includes('networkOnly'), 'cache aceita recursos fora da shell');
  });

  test('Não há áudio, som automático ou APIs de reprodução', () => {
    assert(!/<audio\b|new\s+Audio\s*\(|\.play\s*\(/i.test(allSource), 'áudio encontrado');
  });

  test('Manifesto PWA é JSON válido e seus ícones existem', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert(manifest.name && manifest.start_url, 'manifesto incompleto');
    for (const icon of manifest.icons || []) assert(fs.existsSync(path.join(root, icon.src)), `ícone ausente: ${icon.src}`);
  });

  console.log(`\n${passed}/38 testes estáticos de segurança aprovados.`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
