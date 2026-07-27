# Modelo de segurança — Keyron v0.2.0

## O que é protegido

Todo o conteúdo sensível do cofre é serializado e cifrado no navegador: nomes das credenciais, usuários, e-mails, senhas, segredos adicionais, URLs, notas, categorias, gavetas e logos.

## Camadas

1. **Google OAuth:** restringe o acesso aos arquivos do próprio app com o escopo `drive.file`.
2. **Senha mestra:** deriva localmente uma chave AES-256 não exportável.
3. **AES-256-GCM:** fornece confidencialidade e autenticação do conteúdo. Alterações indevidas no ciphertext impedem a abertura.
4. **Bloqueio por inatividade:** descarta as referências à chave e ao cofre em memória.
5. **CSP e validação:** restringe origens externas, URLs e formatos de imagens.

## Limites reais

- O Google Drive não oferece “senha no arquivo” como uma segunda senha independente via API. No Keyron, a senha mestra já é a senha criptográfica do arquivo: sem ela, o conteúdo não é legível.
- O Google vê metadados de armazenamento, como nomes de pastas/arquivos, tamanhos e horários. O conteúdo permanece cifrado.
- Um dispositivo comprometido por malware, extensão maliciosa, keylogger ou acesso remoto pode capturar dados enquanto o cofre está aberto. Nenhum aplicativo web elimina esse risco.
- A limpeza automática da área de transferência depende das permissões do navegador e não pode ser garantida em todos os sistemas.
- Este projeto ainda não passou por auditoria criptográfica externa. Para uso comercial ou compartilhamento com muitos usuários, faça revisão independente, testes de invasão e política formal de resposta a incidentes.
