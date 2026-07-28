# Segurança — Keyron v1.0.F

## Modelo de ameaça

O Keyron foi endurecido para proteger o cofre contra leitura do arquivo no Drive, cópia do armazenamento local, senha mestra incorreta, adulteração de bundle, troca de metadados, rollback parcial de envelopes, importação malformada, XSS por dados do cofre e sobrescrita concorrente entre dispositivos.

A v1.0.F também protege a entrada offline contra simples cópia do bundle, troca de conta, troca de identificador do dispositivo, adulteração do registro local, autorização expirada, retrocesso relevante do relógio e rollback para uma linhagem anterior do cofre.

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

## Autorização offline

O acesso offline é opt-in e só pode ser habilitado quando:

- a conta Google está verificada;
- o Drive está conectado;
- o cofre está vinculado à mesma conta;
- a senha mestra atual foi confirmada;
- o navegador aceita armazenar uma CryptoKey no IndexedDB.

A autorização local contém somente metadados de vínculo e uma prova HMAC. Os campos autenticados incluem schema, ID do cofre, hash da conta proprietária, ID e rótulo do dispositivo, operação, revisão, criação, última verificação online, expiração, último uso e nonce aleatório.

A chave é HMAC-SHA-256 de 256 bits, gerada com Web Crypto como `extractable: false` e usos restritos a `sign` e `verify`. Ela fica em um banco IndexedDB separado e não é exportada para o bundle, Drive, backup ou CSV. Copiar somente o arquivo `.keyron`, o WAL ou o armazenamento principal não cria uma autorização offline em outro navegador.

A validade máxima é de 30 dias. A autorização é renovada depois de um desbloqueio online válido ou pelo botão de revalidação. Um retrocesso do relógio acima da tolerância de cinco minutos falha fechado. A autorização também mantém uma âncora da operação/revisão aceita; o bundle atual precisa ser exatamente aquela operação ou um descendente autenticado, nunca uma revisão anterior ou uma ramificação paralela.

Atualizações dessa âncora são serializadas com Web Locks entre abas quando disponíveis e com fila local como fallback. Isso evita que salvamentos concorrentes rebaixem o registro para uma operação antiga.

A autorização offline não guarda a senha mestra. Depois da prova do dispositivo, o usuário ainda precisa fornecer a senha mestra ou satisfazer a biometria local já cadastrada para obter a chave do cofre.

### Regras enquanto offline

- O Drive não é lido nem escrito.
- O token Google não é reaproveitado.
- A recuperação por chave fica indisponível até nova verificação Google.
- Troca da senha mestra, regeneração da recuperação e importação ficam bloqueadas.
- Alterações comuns do cofre são cifradas localmente e permanecem pendentes.
- O status mostra explicitamente **Offline autorizado**.
- Ao voltar a internet, a sincronização exige nova verificação Google e comparação de linhagem.

### Revogação e limites

Remover o acesso offline nas configurações apaga a autorização e a CryptoKey daquele navegador. Trocar a senha mestra, recuperar a conta ou importar outro cofre também revoga a autorização local e exige nova inscrição.

Não existe revogação remota instantânea de um dispositivo que permaneça completamente desconectado. Um aparelho perdido pode continuar tentando abrir a cópia local até a validade terminar. Por isso, o modo deve ser ativado somente em dispositivos pessoais com bloqueio de tela forte, criptografia do sistema e conta do sistema operacional protegida.

`extractable: false` impede a exportação normal da chave pela API Web Crypto, mas não transforma um navegador ou sistema operacional comprometido em ambiente confiável. Código malicioso executando no mesmo domínio/perfil ainda pode tentar usar a chave dentro do próprio navegador.

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
4. Um dispositivo confiável perdido não pode ser revogado instantaneamente enquanto permanecer offline; a autorização local vale até 30 dias.
5. Google Identity Services é um script remoto confiado pela aplicação; comprometimento do fornecedor ou da hospedagem está fora do alcance do código local.
6. Extensões, malware, keyloggers e ferramentas com acesso à memória da página podem ler dados enquanto o cofre está desbloqueado.
7. WebAuthn/PRF, OAuth, Drive, Service Worker real e Pwned Passwords precisam ser confirmados ao vivo no domínio final.
