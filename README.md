# Keyron v1.0.F

O Keyron é um cofre pessoal de credenciais em HTML, CSS e JavaScript puros. O conteúdo é cifrado no navegador antes de qualquer persistência e o Google Drive recebe somente o bundle cifrado.

## Proteção principal

- Google OAuth como primeira barreira normal de acesso.
- Acesso offline opcional somente em aparelhos autorizados previamente com Google e senha mestra.
- Cofre vinculado criptograficamente ao `permissionId` estável da conta Google verificada.
- AES-256-GCM com tag de autenticação de 128 bits.
- Chave de dados aleatória de 256 bits, independente da senha mestra.
- PBKDF2-HMAC-SHA-256 com 600.000 iterações, salt aleatório de 16 bytes e limites defensivos de KDF.
- IV aleatório de 12 bytes em cada cifragem.
- Senha mestra e chave de recuperação usadas apenas para proteger a chave de dados.
- Formato de cofre v4 com selo autenticado sobre conteúdo, envelopes de chave, conta proprietária, revisão e linhagem de operações.
- Google Drive limitado ao escopo `drive.file`.
- `ETag` + `If-Match` quando disponíveis; fallback seguro por preflight de linhagem e leitura de confirmação quando o navegador não expõe `ETag`.
- WAL local cifrado para reduzir perda de alterações antes da confirmação remota.
- Biometria local por WebAuthn/PRF quando o navegador e o dispositivo oferecem suporte.


## Correção interna da v1.0.F

A revisão de manutenção `r2` mantém o nome visível **v1.0.F**, mas troca o identificador interno do cache do PWA. Isso força a atualização de HTML, CSS e JavaScript e impede que uma instalação anterior continue mostrando a tela de Segurança sem o card de acesso offline.

## Acesso offline por dispositivo confiável

O modo offline não é habilitado automaticamente. Em cada aparelho pessoal:

1. entre normalmente com o Google;
2. abra **Configurações → Segurança → Acesso offline neste aparelho**;
3. dê um nome ao dispositivo, confirme a senha mestra e selecione **Autorizar acesso offline**.

A autorização vale por até 30 dias e é renovada após um desbloqueio online válido. Ela fica vinculada ao cofre, à conta proprietária, ao identificador local do aparelho e à linhagem autenticada da versão cifrada. A prova usa uma chave HMAC-SHA-256 não exportável guardada em um IndexedDB separado; essa chave não vai para o Drive nem para backups do cofre.

Sem internet ou quando a biblioteca do Google estiver indisponível, um aparelho autorizado pode abrir a cópia cifrada local usando a senha mestra ou a biometria já configurada. Alterações feitas offline continuam sendo cifradas e entram no WAL local. O Drive só volta a ser consultado ou atualizado depois de uma nova verificação Google, quando o Keyron compara a linhagem antes de sincronizar.

Troca de senha mestra, geração de nova chave de recuperação e importação de outro cofre continuam exigindo Google e Drive ativos. Isso evita criar duas credenciais de segurança diferentes entre a cópia local e a remota.

A persistência do navegador é solicitada com `navigator.storage.persist()`, mas nenhum navegador garante que dados locais nunca serão apagados. O Drive e os backups cifrados continuam sendo necessários.

## O que fica em texto legível

Enquanto o cofre está desbloqueado, o navegador precisa manter temporariamente o conteúdo em memória para exibi-lo. Ao bloquear, ocultar a aba pelo tempo configurado ou entrar em BFCache, o Keyron limpa a interface e descarta as referências à chave e ao cofre legível.

No armazenamento local, no WAL, nos backups exportados e no Google Drive ficam apenas bundles cifrados. O token OAuth permanece somente em memória. A autorização offline guarda metadados do vínculo e uma CryptoKey não exportável, nunca credenciais do cofre em texto legível.

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
4. Abra o Keyron online ao menos uma vez em cada dispositivo para instalar e atualizar a shell do PWA.
5. Faça os testes ao vivo descritos em `TESTES.md` no domínio final.

O projeto não exige Node.js no servidor. O Node.js é usado apenas para executar os testes locais incluídos em `tests/`.

## Limite honesto de segurança

Nenhum aplicativo web pode proteger credenciais de um sistema operacional comprometido, keylogger, extensão maliciosa com acesso à página, navegador adulterado ou código malicioso servido pelo mesmo domínio. A força contra ataque offline também depende diretamente de uma senha mestra longa, exclusiva e difícil de adivinhar.

Um aparelho autorizado que seja perdido pode continuar abrindo o cofre sem Google até a autorização expirar, desde que o invasor também consiga vencer o bloqueio do aparelho e descobrir a senha mestra ou satisfazer a autenticação local. Não existe revogação remota instantânea enquanto esse aparelho permanecer totalmente offline.
