# Testes — Keyron v1.0.F

## Suíte automatizada

Cada rodada executa 98 verificações:

- 15 testes de núcleo: criação, ordenação, migração, exclusão, AES-GCM, KDF, recuperação e reordenação de gavetas.
- 25 testes dinâmicos de segurança: adulteração de conteúdo/metadados, vínculo de conta, KDF malicioso, Base64 inválido, linhagem, revisão regressiva, rollback de envelopes, recuperação, normalização e limites.
- 8 testes do Drive com mocks: OAuth, `permissionId`, download validado, `ETag`/`If-Match`, conflito 412, troca de token, limite de upload, sincronização quando o navegador não expõe `ETag` e bloqueio de linhagem divergente antes do PATCH.
- 14 testes do acesso offline: inscrição, HMAC não exportável, cópia sem chave, adulteração, conta e dispositivo divergentes, avanço de linhagem, concorrência, rollback, ramificação paralela, expiração, relógio regressivo e revogação.
- 38 testes estáticos: sintaxe, referências, CSP, clickjacking, ausência de segredos, escopo OAuth, token em memória, criptografia, biometria, autorização offline, serialização entre abas, WAL, URLs, logos, importações, HIBP, bloqueio, BFCache, Service Worker, áudio e manifesto.

Execute uma rodada:

```bash
node tests/run-all.js
```

Execute as 18 repetições de homologação:

```bash
node tests/run-all.js 18
```

## Resultado da homologação

Em 28/07/2026, a suíte completa foi executada em 18 rodadas consecutivas. Após a correção de interface/cache e sincronização sem `ETag`, a suíte completa foi executada novamente em 18 rodadas consecutivas. Resultado: **1.800/1.800 verificações aprovadas**, sem falhas.

## Casos específicos do modo offline

A suíte confirma que:

- o registro não funciona sem a CryptoKey local;
- a CryptoKey HMAC é criada como não exportável;
- qualquer alteração nos metadados assinados invalida a autorização;
- outra conta, outro dispositivo ou outro cofre não são aceitos;
- a versão local precisa manter a linhagem autenticada;
- rollback e ramificações paralelas falham fechado;
- a âncora não regride em salvamentos concorrentes;
- validade vencida e retrocesso relevante do relógio bloqueiam a entrada;
- remover a autorização apaga o acesso daquele navegador;
- a aplicação não sincroniza, importa, troca a senha mestra nem gera nova recuperação sem Google.

## Ambiente externo

O ambiente isolado de empacotamento não autentica numa conta Google real e não possui um dispositivo WebAuthn/PRF real. Por isso, os seguintes pontos precisam ser confirmados no domínio HTTPS final:

- popup e consentimento reais do Google;
- leitura e escrita reais do Google Drive;
- comportamento real dos cabeçalhos `ETag` no navegador e no domínio publicado; quando não exposto, a aplicação usa preflight de linhagem e leitura de confirmação;
- instalação e atualização reais do Service Worker no computador e no celular;
- persistência real da CryptoKey não exportável no navegador de cada aparelho;
- autenticação de plataforma por digital, rosto ou PIN;
- comportamento após colocar o aparelho em modo avião e encerrar/reabrir o PWA;
- resposta ao vivo do Pwned Passwords;
- drag-and-drop e comportamento visual em navegadores/dispositivos reais;
- cabeçalhos entregues pelo servidor na primeira navegação.

A análise automatizada não é prova matemática de ausência de vulnerabilidades. Ela demonstra que os invariantes codificados passaram e reduz regressões conhecidas.
