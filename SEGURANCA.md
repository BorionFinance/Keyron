# Modelo de segurança — Keyron v0.3.8

## O que é protegido

Todo o conteúdo sensível do cofre é serializado e cifrado no navegador: nomes das credenciais, usuários, e-mails, senhas, segredos adicionais, URLs, notas, categorias, gavetas e logos.

## Camadas

1. **Google OAuth:** restringe o acesso aos arquivos do próprio app com o escopo `drive.file`.
2. **Senha mestra:** deriva localmente uma chave AES-256 não exportável via PBKDF2-SHA256 com 600.000 iterações.
3. **AES-256-GCM:** fornece confidencialidade e autenticação do conteúdo. Alterações indevidas no ciphertext impedem a abertura.
4. **Bloqueio por inatividade:** descarta as referências à chave e ao cofre em memória.
5. **CSP e validação:** restringe origens externas, URLs e formatos de imagens.
6. **Desbloqueio biométrico (opcional, local ao dispositivo):** usa a extensão PRF do WebAuthn para derivar, a partir de uma verificação biométrica real (digital, rosto ou PIN do sistema) feita pelo próprio hardware seguro do aparelho, uma chave AES-GCM local. Essa chave abre um pequeno envelope cifrado — guardado só neste dispositivo, nunca no Drive — que contém a senha mestra. Sem uma verificação biométrica bem-sucedida naquele hardware específico, o envelope não pode ser aberto. Se o navegador ou aparelho não suportar a extensão PRF, o recurso fica automaticamente indisponível e a senha mestra digitada continua sendo o único caminho — nunca há um caminho mais fraco escondido por trás do botão de biometria.

## Limites reais

- O Google Drive não oferece “senha no arquivo” como uma segunda senha independente via API. No Keyron, a senha mestra já é a senha criptográfica do arquivo: sem ela, o conteúdo não é legível.
- O Google vê metadados de armazenamento, como nomes de pastas/arquivos, tamanhos e horários. O conteúdo permanece cifrado.
- Um dispositivo comprometido por malware, extensão maliciosa, keylogger ou acesso remoto pode capturar dados enquanto o cofre está aberto. Nenhum aplicativo web elimina esse risco.
- A limpeza automática da área de transferência depende das permissões do navegador e não pode ser garantida em todos os sistemas.
- O desbloqueio biométrico depende do navegador/SO suportar a extensão PRF do WebAuthn (suporte ainda é recente e varia por aparelho). Teste no seu dispositivo antes de confiar nele como único método do dia a dia — a senha mestra continua sendo o método de referência.
- Este projeto ainda não passou por auditoria criptográfica externa. Para uso comercial ou compartilhamento com muitos usuários, faça revisão independente, testes de invasão e política formal de resposta a incidentes.

## Durabilidade sem texto puro

O Save Engine mantém dois registros locais cifrados:

- `current`: última versão cifrada disponível neste dispositivo;
- `pending`: última versão cifrada ainda não confirmada no Google Drive.

O marcador em `localStorage` contém somente metadados técnicos, como revisão, horário, identificador da operação e motivo genérico. Ele não contém nomes de serviços, usuários, senhas, notas, logos ou categorias.

A confirmação remota só remove o registro pendente quando pertence ao mesmo cofre e não é mais antiga do que a revisão protegida localmente.
