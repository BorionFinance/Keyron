# Keyron v0.2.0

Cofre pessoal de credenciais com autenticação Google, senha mestra e criptografia local antes da sincronização com o Drive.

## Principais recursos

- Fluxo obrigatório: Google OAuth → senha mestra.
- AES-256-GCM com PBKDF2-HMAC-SHA-256 (600.000 iterações).
- Gavetas personalizadas e movimentação por arrastar e soltar.
- Categorias criadas pelo usuário e filtros rápidos.
- Logos PNG/JPG/WebP de até 4 MB na entrada, reduzidas para no máximo 512 px e cifradas dentro do cofre.
- IndexedDB para o cache local cifrado, evitando o limite reduzido do localStorage.
- Backup `.keyron`, importação verificada por senha e snapshots cifrados no Drive.
- Bloqueio automático e tentativa segura de limpeza da área de transferência.
- Migração do bundle cifrado `borion_senhas_bundle` e do arquivo legado `borion-senhas-vault.json`.

Leia `CONFIGURACAO.md` antes de publicar.
