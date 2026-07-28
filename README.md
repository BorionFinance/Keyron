# Keyron v0.3.9

Cofre pessoal de credenciais com autenticação Google, senha mestra e criptografia local antes da sincronização com o Google Drive.

## Principais recursos

- Fluxo obrigatório: Google OAuth → senha mestra (ou biometria do aparelho, se ativada).
- AES-256-GCM com PBKDF2-HMAC-SHA-256 e 600.000 iterações.
- Desbloqueio biométrico opcional (WebAuthn + extensão PRF), local a cada dispositivo.
- Gavetas personalizadas, categorias e movimentação por arrastar e soltar, com opção de expandir/retrair cada gaveta (ou todas de uma vez) para cofres com muitas credenciais.
- Registro local de atividade (novas credenciais, gavetas e categorias) com data e hora, visível em Configurações e como "última adição" no topo do cofre.
- Logos PNG, JPG ou WebP de até 4 MB na entrada, reduzidas para no máximo 512 px e cifradas dentro do cofre.
- IndexedDB para o cache local cifrado, sem depender do limite pequeno do `localStorage`.
- Exportação e importação de backup `.keyron`, com verificação da senha antes da substituição.
- Snapshots cifrados e rotativos no Drive.
- Bloqueio automático e tentativa segura de limpeza da área de transferência.
- Migração do bundle legado `borion_senhas_bundle` e do arquivo `borion-senhas-vault.json`.

## Salvamento rápido e resistente

O Keyron usa uma camada própria de durabilidade adaptada ao requisito principal do app: **nenhum dado sensível pode ser gravado em texto puro**.

- WAL local cifrado: a versão pendente fica protegida no IndexedDB antes da confirmação do Drive.
- Salvamento local primeiro: a interface não espera o upload remoto para responder.
- Consolidação `latest-wins`: mudanças muito rápidas são agrupadas e estados intermediários desnecessários são descartados.
- Revisão e identificador por operação: evita que uma confirmação antiga apague uma alteração mais nova ainda pendente.
- Sincronização em segundo plano após pequeno debounce.
- Retentativas automáticas com espera progressiva quando o Drive ou a internet falham.
- Recuperação de alteração pendente após atualização, fechamento repentino ou reinício do navegador.
- `navigator.locks` para serializar a escrita no Drive entre abas compatíveis.
- Tentativa de `flush` ao ocultar a página, bloquear o cofre e fechar a aba.
- Snapshot automático executado depois da atualização principal, sem atrasar o salvamento de `vault.keyron`.

Leia `CONFIGURACAO.md` e `SEGURANCA.md` antes de publicar.
