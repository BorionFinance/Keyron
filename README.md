# Keyron v0.4.0

Cofre visual de credenciais com criptografia local, biometria por dispositivo e sincronização pelo Google Drive do próprio usuário.

## O que mudou nesta versão

- Nova ordenação manual das credenciais dentro de cada gaveta.
- Arraste entre gavetas com indicador da posição exata.
- Rolagem automática nas bordas e suporte à roda do mouse durante o arraste.
- Novo ícone de expandir/retrair gavetas.
- Biblioteca maior de símbolos para gavetas.
- Edição de credencial preserva a posição da página ao fechar.
- No mobile, a biometria é tentada antes de mostrar o teclado da senha mestra.
- Animação de entrada ao desbloquear o cofre.
- Fluxo Google sem forçar a seleção da mesma conta duas vezes; o seletor completo aparece apenas ao escolher “Trocar conta Google” ou sair.
- Central de Configurações reorganizada em Segurança, Privacidade, Aparência, Dados, Atividade e Sobre.
- Área “Por que o Keyron foi criado”, contando a evolução da planilha EVA para um cofre cifrado.
- Verificação manual ou semanal de senhas encontradas em vazamentos usando HIBP Pwned Passwords com k-anonymity.

## Segurança mantida

A versão 0.4.0 não reduz a proteção criptográfica da 0.3.9:

- AES-256-GCM com autenticação do conteúdo.
- PBKDF2-HMAC-SHA-256 com 600.000 iterações.
- AAD vinculado ao identificador do cofre.
- Senha mestra nunca persistida em texto puro.
- Conteúdo cifrado antes de ser enviado ao Drive.
- Escopo Google `drive.file`.
- Biometria protegida localmente por WebAuthn/PRF quando o navegador oferece suporte.

## Verificação de vazamentos

O Keyron calcula SHA-1 localmente apenas porque esse é o protocolo de consulta da API Pwned Passwords. A senha e o hash completo não são enviados. Somente os 5 primeiros caracteres do hash são consultados; o restante é comparado dentro do aparelho.

Os resultados — identificador da credencial, quantidade conhecida e data — ficam salvos dentro do próprio cofre cifrado. Nenhuma senha ou hash é gravado na auditoria.

## Recuperação da senha mestra

O Keyron não usa CPF, CEP, telefone, nome da mãe ou perguntas pessoais para liberar o cofre. Esses dados são descobríveis e criariam uma porta dos fundos.

O e-mail identifica a conta Google e permite acessar o arquivo cifrado, mas não consegue descriptografá-lo. Guarde a senha mestra em local seguro e mantenha a biometria ativada nos dispositivos confiáveis.

## Publicação

1. Configure `js/config.js` conforme `CONFIGURACAO.md`.
2. Publique todo o conteúdo desta pasta em um domínio HTTPS.
3. Autorize o domínio no cliente OAuth do Google.
4. Abra o Keyron, faça login uma vez e crie ou desbloqueie o cofre.

O projeto é HTML, CSS e JavaScript puros; não exige Node.js no servidor.
