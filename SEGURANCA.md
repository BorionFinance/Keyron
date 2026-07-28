# Segurança — Keyron v1.0.0

## Modelo de ameaça

O Keyron foi endurecido para proteger o cofre contra leitura do arquivo no Drive, cópia do armazenamento local, senha mestra incorreta, adulteração de bundle, troca de metadados, rollback parcial de envelopes, importação malformada, XSS por dados do cofre e sobrescrita concorrente entre dispositivos.

Ele não promete proteger contra malware com acesso ao aparelho, keylogger, extensão maliciosa autorizada a ler a página, navegador comprometido, domínio de hospedagem comprometido ou invasor que obtenha simultaneamente o arquivo cifrado e a senha mestra/chave de recuperação.

## Criptografia do formato v4

- Cifra: AES-GCM de 256 bits.
- Tag GCM: 128 bits.
- KDF: PBKDF2-HMAC-SHA-256.
- Iterações atuais: 600.000.
- Faixa aceita defensivamente: 600.000 a 2.000.000.
- Salt: 16 bytes aleatórios por envelope.
- IV: 12 bytes aleatórios por cifragem.
- Chave de dados: 32 bytes aleatórios.
- Recuperação: 30 caracteres escolhidos com rejection sampling, sem viés de módulo.

A senha mestra deriva uma chave de embrulho; ela não cifra diretamente todo o cofre. A mesma chave de dados é embrulhada separadamente pela senha mestra e pela chave de recuperação.

## Selo de integridade

O formato v4 autentica, com a própria chave de dados:

- hash do ciphertext do conteúdo;
- KDF e embrulho da senha mestra;
- KDF e embrulho da recuperação;
- verificador do cofre e parâmetros da cifra;
- conta Google proprietária;
- revisão, operação, dispositivo, motivo e horário de salvamento;
- linhagem recente de operações.

Isso bloqueia alterações isoladas, mistura de partes de bundles, recolocação de um embrulho antigo dentro de uma versão nova e falsificação de revisão/linhagem. Um rollback do arquivo inteiro para uma cópia histórica ainda válida não pode ser provado em um dispositivo totalmente novo sem uma fonte monotônica externa confiável; em dispositivos que possuem uma versão mais nova, a linhagem permite detectar divergência e impedir sobrescrita automática.

## Conta Google e Drive

O vínculo usa o `permissionId` retornado pela API do Drive. O Client ID OAuth do frontend é público por definição; ele não é segredo. O token de acesso fica apenas em memória.

O escopo é exatamente `https://www.googleapis.com/auth/drive.file`, limitando o aplicativo aos arquivos criados ou abertos por ele. Atualizações do arquivo principal exigem ETag e `If-Match`; se o ETag não estiver disponível, o Keyron falha fechado e não envia a sobrescrita.

Conflitos preservam a cópia local cifrada, tentam criar um snapshot de conflito no Drive e exigem novo desbloqueio da versão remota escolhida.

## Armazenamento local e bloqueio

- IndexedDB e fallback local recebem somente bundles cifrados.
- O WAL é cifrado antes de ser marcado como pendente.
- Um fallback antigo é removido quando o IndexedDB passa a ser a fonte válida, evitando ressurreição após limpeza.
- WAL divergente não é descartado apenas por número de revisão; exige mesma operação ou descendência autenticada.
- O bloqueio descarta imediatamente chave e cofre legível antes de esperar por rede ou IndexedDB.
- Aba oculta por 30 segundos bloqueia o cofre, inclusive quando o navegador suspende timers.
- Entrada em BFCache descarta o estado legível de forma síncrona.
- Limpeza da área de transferência é best-effort porque o navegador pode negar permissão de leitura.

## Biometria

A biometria usa WebAuthn com autenticador de plataforma, `userVerification: required` e extensão PRF. O segredo local é cifrado por AES-GCM com AAD vinculando schema, cofre e credencial WebAuthn. O registro não é sincronizado com o Drive.

A verificação do sistema pode ser satisfeita por digital, rosto ou PIN do dispositivo, conforme as regras do sistema operacional. Ela não substitui a criptografia do arquivo.

## Entrada e conteúdo ativo

- CSP restringe scripts ao próprio domínio e ao Google Identity Services.
- Não há `eval`, `new Function`, handlers inline nem dados do usuário inseridos em `innerHTML`.
- URLs externas aceitam somente HTTP e HTTPS e abrem com `noopener,noreferrer`.
- Logos aceitam somente PNG, JPEG e WebP, validam assinatura binária, tamanho, dimensões e pixels, e são recodificadas em canvas.
- SVG não entra no cofre como logo.
- Backups, CSVs, campos e respostas externas possuem limites defensivos.
- O Service Worker não devolve HTML no lugar de JavaScript/CSS e só armazena recursos conhecidos da shell.

## Riscos residuais

1. Senha mestra fraca permite ataque offline ao bundle roubado; use uma frase longa e exclusiva.
2. Backups históricos continuam abrindo com as credenciais válidas na data em que foram criados.
3. Um dispositivo novo, sem estado anterior, não consegue distinguir uma cópia histórica inteira válida da versão mais recente sem consultar uma referência externa confiável.
4. Google Identity Services é um script remoto confiado pela aplicação; comprometimento do fornecedor ou da hospedagem está fora do alcance do código local.
5. Extensões, malware, keyloggers e ferramentas com acesso à memória da página podem ler dados enquanto o cofre está desbloqueado.
6. WebAuthn/PRF, OAuth, Drive e Pwned Passwords precisam ser confirmados ao vivo no domínio final.
