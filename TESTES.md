# Relatório de testes — Keyron v0.3.0

Data da revisão: 27/07/2026

## Testes executados nesta versão

### Validação estática

- Sintaxe de todos os arquivos JavaScript validada com `node --check`.
- `manifest.json` validado como JSON.
- Referências locais do HTML conferidas.
- IDs do HTML verificados, sem duplicações.
- Ordem dos scripts verificada: criptografia → armazenamento → Save Engine → cofre → Drive → aplicativo.
- Cache do Service Worker atualizado para `keyron-shell-v0.3.0`.

### Núcleo criptográfico e Save Engine

Foi executado um teste automatizado em Node.js com Web Crypto real e uma implementação controlada de IndexedDB. Foram validados:

- criação e abertura de bundle AES-256-GCM;
- derivação PBKDF2-HMAC-SHA-256 com 600.000 iterações;
- gravação de WAL contendo somente bundle cifrado;
- recuperação do bundle pendente;
- consolidação de alterações rápidas no modelo `latest-wins`;
- aumento monotônico de revisão;
- rejeição de confirmação remota antiga quando existe revisão local mais nova;
- limpeza do WAL após confirmação da operação correta;
- ausência de nomes, senhas e conteúdo do cofre no JSON enviado ao Drive.

Resultado do teste automatizado: **aprovado**.

## Comportamentos revisados no código

- Criação do cofre continua disponível se o Drive falhar depois da proteção local.
- Importação confirmada por senha não é desfeita quando apenas o upload remoto falha.
- Bloqueio aguarda brevemente o salvamento local e tenta concluir a sincronização pendente.
- Falhas transitórias 408, 429 e 5xx recebem novas tentativas automáticas.
- O teste de necessidade de snapshot é armazenado em cache, evitando uma listagem de backups a cada salvamento.
- O snapshot automático usa a versão remota anterior e roda depois do `PATCH` principal.

## Limite desta revisão

O ambiente desta análise não permitiu abrir uma origem HTTP/HTTPS no Chromium por política administrativa. Portanto, o OAuth real e a interface completa não foram executados contra a sua conta Google nesta etapa.

Antes de inserir senhas verdadeiras, publique no domínio autorizado e valide:

1. entrada com a conta Google correta;
2. criação e reabertura do cofre;
3. cadastro de uma credencial de teste;
4. fechamento imediato da aba e nova abertura;
5. confirmação de `Sincronizado`;
6. presença de `Keyron/vault.keyron` e dos snapshots no Drive.
