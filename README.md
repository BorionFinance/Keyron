# Keyron v0.6.2

Cofre visual de credenciais com criptografia local, biometria por dispositivo e sincronização pelo Google Drive do próprio usuário.

## O que mudou nesta versão

- Gavetas: os botões de mover (← →) saíram — agora é só arrastar o cabeçalho da gaveta para qualquer posição.
- Ícones padrão das gavetas trocados de emojis coloridos para símbolos geométricos consistentes (migração automática também corrige gavetas já existentes com os ícones antigos).
- Corrigido o real motivo do login com Google parecer travado por alguns segundos: o botão Enter era reabilitado antes da busca no Drive terminar, permitindo um clique duplo que reabria o seletor de conta. Agora vira um indicador de carregamento (bolinha azul-clara animada) até a tela de senha mestra aparecer.
- Título "Meu Keyron" bem menos evidente.
- Ordem dos botões do topo: Sincronizado, Bloqueio, Configurações, Hub Borion.
- Logo do topo trocado pela versão só com a escrita "KEYRON", sem o ícone.
- Verificador de senhas vazadas: "Alterar agora" passou a mostrar a senha exposta atual (visível, pronta pra revisar) em vez de já gerar uma senha nova por conta própria — a troca continua sendo escolha do usuário.
- Som de bloqueio/desbloqueio bem mais grave, com zumbido de "sabre de luz" (camadas de dente de serra + sub-grave), em vez do assobio agudo da v0.5.0.

- Chave de recuperação real: ao criar o cofre (ou migrar um cofre antigo), o Keyron gera um código de recuperação de alta entropia mostrado uma única vez. Com ele, dá para definir uma nova senha mestra sem perder nenhuma credencial, mesmo esquecendo a senha atual — sem perguntas pessoais e sem porta dos fundos.
- Trocar a senha mestra agora só re-embrulha a chave de dados do cofre (muito mais rápido) e não invalida a chave de recuperação.
- Opção em Configurações → Segurança para gerar uma nova chave de recuperação quando quiser (invalida a anterior).
- Correção do bug de notificação/toast aparecendo dentro do fluxo da página em vez de flutuar por cima.
- Botão "Alterar agora" nas senhas encontradas em vazamentos, já abrindo a credencial com uma senha forte nova gerada.
- Ícones das Configurações padronizados em SVG (sem emojis soltos).
- Som e animação de bloqueio/desbloqueio sintetizados localmente (sem arquivo de áudio).
- Ícone instalável com fundo transparente.
- Link para o Hub Borion no topo do app.
- Splash de entrada suave e pulso azul contínuo nas telas de Entrar/Desbloquear.
- Área de Atividade com rolagem maior.
- Login com Google simplificado para pedir apenas o escopo do Drive — remove telas de consentimento extras que exigiam mais de um clique para autenticar.

## Segurança

- AES-256-GCM com autenticação do conteúdo.
- PBKDF2-HMAC-SHA-256 com 600.000 iterações.
- Chave de dados (DEK) aleatória e independente da senha, embrulhada separadamente pela senha mestra e pela chave de recuperação — nenhuma delas decifra a outra.
- AAD vinculado ao identificador do cofre.
- Senha mestra e chave de recuperação nunca persistidas em texto puro.
- Conteúdo cifrado antes de ser enviado ao Drive.
- Escopo Google `drive.file` apenas.
- Biometria protegida localmente por WebAuthn/PRF quando o navegador oferece suporte.

## Verificação de vazamentos

O Keyron calcula SHA-1 localmente apenas porque esse é o protocolo de consulta da API Pwned Passwords. A senha e o hash completo não são enviados. Somente os 5 primeiros caracteres do hash são consultados; o restante é comparado dentro do aparelho.

Os resultados — identificador da credencial, quantidade conhecida e data — ficam salvos dentro do próprio cofre cifrado. Nenhuma senha ou hash é gravado na auditoria.

## Recuperação da senha mestra

O Keyron não usa CPF, CEP, telefone, nome da mãe ou perguntas pessoais para liberar o cofre — esses dados são descobríveis e criariam uma porta dos fundos.

Em vez disso, toda vez que um cofre é criado (ou um cofre antigo é migrado para essa versão), o Keyron gera uma **chave de recuperação** aleatória e mostra-a uma única vez, na tela, para o usuário guardar em local seguro fora do aparelho. Essa chave consegue destravar o cofre e definir uma nova senha mestra — sem apagar nenhuma credencial — mesmo que a senha atual seja esquecida. Sem a senha mestra e sem essa chave, o conteúdo permanece inacessível, inclusive para o próprio Keyron.

## Publicação

1. Configure `js/config.js` conforme `CONFIGURACAO.md`.
2. Publique todo o conteúdo desta pasta em um domínio HTTPS.
3. Autorize o domínio no cliente OAuth do Google.
4. Abra o Keyron, faça login uma vez e crie ou desbloqueie o cofre.

O projeto é HTML, CSS e JavaScript puros; não exige Node.js no servidor.
