# Keyron v1.0.0

O Keyron é um cofre pessoal de credenciais em HTML, CSS e JavaScript puros. O conteúdo é cifrado no navegador antes de qualquer persistência e o Google Drive recebe somente o bundle cifrado.

## Proteção principal

- Google OAuth como primeira barreira de acesso.
- Cofre vinculado criptograficamente ao `permissionId` estável da conta Google verificada.
- AES-256-GCM com tag de autenticação de 128 bits.
- Chave de dados aleatória de 256 bits, independente da senha mestra.
- PBKDF2-HMAC-SHA-256 com 600.000 iterações, salt aleatório de 16 bytes e limites defensivos de KDF.
- IV aleatório de 12 bytes em cada cifragem.
- Senha mestra e chave de recuperação usadas apenas para proteger a chave de dados.
- Formato de cofre v4 com selo autenticado sobre conteúdo, envelopes de chave, conta proprietária, revisão e linhagem de operações.
- Google Drive limitado ao escopo `drive.file`.
- ETag + `If-Match` para impedir sobrescrita silenciosa entre dispositivos.
- WAL local cifrado para reduzir perda de alterações antes da confirmação remota.
- Biometria local por WebAuthn/PRF quando o navegador e o dispositivo oferecem suporte.

## O que fica em texto legível

Enquanto o cofre está desbloqueado, o navegador precisa manter temporariamente o conteúdo em memória para exibi-lo. Ao bloquear, ocultar a aba pelo tempo configurado ou entrar em BFCache, o Keyron limpa a interface e descarta as referências à chave e ao cofre legível.

No armazenamento local, no WAL, nos backups exportados e no Google Drive ficam apenas bundles cifrados. O token OAuth permanece somente em memória.

## Estrutura no Google Drive

O aplicativo cria uma pasta `Keyron`, um arquivo principal `vault.keyron` e uma subpasta `Backups`. Snapshots e cópias de conflito continuam cifrados. O Google ainda consegue ver metadados como nome, tamanho e datas dos arquivos, mas não o conteúdo interno do cofre.

## Recuperação

Na criação do cofre, o Keyron gera uma chave de recuperação aleatória de 30 caracteres. Ela é mostrada uma única vez e deve ser guardada fora do aparelho. Não existe recuperação por CPF, telefone, CEP, e-mail ou perguntas pessoais.

Backups antigos continuam protegidos pelas credenciais válidas quando foram criados. Trocar a senha mestra ou regenerar a chave de recuperação não reescreve automaticamente cópias históricas já exportadas.

## Verificação de senhas vazadas

A consulta ao Pwned Passwords usa k-anonymity: o SHA-1 é calculado localmente e somente os cinco primeiros caracteres do hash são enviados. A senha e o hash completo não saem do aparelho. O SHA-1 não é usado na criptografia do cofre.

## Publicação

1. Confira o Client ID em `js/config.js`.
2. Autorize o domínio HTTPS exato no cliente OAuth do Google.
3. Publique todo o conteúdo desta pasta sem alterar a estrutura.
4. Faça os testes ao vivo descritos em `TESTES.md` no domínio final.

O projeto não exige Node.js no servidor. O Node.js é usado apenas para executar os testes locais incluídos em `tests/`.

## Limite honesto de segurança

Nenhum aplicativo web pode proteger credenciais de um sistema operacional comprometido, keylogger, extensão maliciosa com acesso à página, navegador adulterado ou código malicioso servido pelo mesmo domínio. A força contra ataque offline também depende diretamente de uma senha mestra longa, exclusiva e difícil de adivinhar.
