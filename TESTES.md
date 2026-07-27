# Relatório de testes — Keyron v0.2.1

Data da revisão: 27/07/2026

## Testes executados

- Validação de sintaxe de todos os arquivos JavaScript com `node --check`.
- Validação do `manifest.json`.
- Verificação de referências locais, IDs duplicados e elementos usados pelo `app.js`.
- Teste real do núcleo Web Crypto:
  - criação de bundle Keyron;
  - PBKDF2-HMAC-SHA-256 com 600.000 iterações;
  - abertura com senha correta;
  - rejeição de senha incorreta;
  - rejeição de ciphertext adulterado;
  - atualização e nova abertura do cofre;
  - migração de bundle legado Borion v1 para Keyron v2.
- Teste de interface em Chromium com Google OAuth e Drive simulados:
  - verificação Google;
  - criação de senha mestra;
  - criação do cofre;
  - criação e exclusão lógica de categorias;
  - criação de nova gaveta;
  - cadastro de credencial;
  - upload e redução de logo;
  - movimentação por arrastar e soltar;
  - bloqueio e desbloqueio;
  - persistência da credencial após reabertura;
  - revisão responsiva em desktop e mobile.

## Correções encontradas durante os testes

1. Gavetas vazias não apareciam enquanto o cofre ainda não tinha credenciais. Corrigido.
2. Um site digitado como `netflix.com` era bloqueado pela validação HTML antes da normalização. Corrigido; o app acrescenta `https://` com validação segura.
3. O layout mobile foi alterado para gavetas horizontais com gesto de arrastar, evitando uma página vertical excessivamente longa.
4. O cache cifrado foi movido para IndexedDB para suportar logos sem depender do limite pequeno do localStorage.
5. O botão de status de sincronização agora permite reconectar o Drive após expiração do token e compara a versão remota antes de enviar a local.

## Limite do ambiente de teste

A integração foi testada contra uma simulação fiel das chamadas esperadas da Google Drive API. Não foi possível executar OAuth real sem o Client ID do projeto e a origem publicada. Depois de configurar `js/config.js`, faça um teste final no domínio real usando sua própria conta Google antes de colocar senhas verdadeiras no cofre.
