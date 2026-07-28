# Testes — Keyron v1.0.0

## Suíte automatizada

Cada rodada executa 77 verificações:

- 15 testes de núcleo: criação, ordenação, migração, exclusão, AES-GCM, KDF, recuperação e reordenação de gavetas.
- 25 testes dinâmicos de segurança: adulteração de conteúdo/metadados, vínculo de conta, KDF malicioso, Base64 inválido, linhagem, revisão regressiva, rollback de envelopes, recuperação, normalização e limites.
- 7 testes do Drive com mocks: OAuth, `permissionId`, download validado, ETag, `If-Match`, conflito 412, troca de token, limite de upload e falha fechada sem ETag.
- 30 testes estáticos: sintaxe, referências, CSP, clickjacking, ausência de segredos, escopo OAuth, token em memória, criptografia, biometria, WAL, URLs, logos, importações, HIBP, bloqueio, BFCache, Service Worker, áudio e manifesto.

Execute uma rodada:

```bash
node tests/run-all.js
```

Execute as 18 repetições de homologação:

```bash
node tests/run-all.js 18
```

## Resultado da homologação

Em 28/07/2026, a suíte completa foi executada em 18 rodadas consecutivas. Resultado: **1.386/1.386 verificações aprovadas**, sem falhas.

## Ambiente externo

O ambiente isolado de empacotamento não autentica numa conta Google real e não possui um dispositivo WebAuthn/PRF real. Por isso, os seguintes pontos precisam ser confirmados no domínio HTTPS final:

- popup e consentimento reais do Google;
- leitura e escrita reais do Google Drive;
- presença real do ETag exposto ao navegador;
- autenticação de plataforma por digital, rosto ou PIN;
- resposta ao vivo do Pwned Passwords;
- drag-and-drop e comportamento visual em navegadores/dispositivos reais;
- cabeçalhos entregues pelo servidor na primeira navegação.

A análise automatizada não é prova matemática de ausência de vulnerabilidades. Ela demonstra que os invariantes codificados passaram e reduz regressões conhecidas.
