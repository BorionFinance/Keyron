# Segurança — Keyron v0.6.3

## Modelo do cofre

O Keyron é um cofre zero-knowledge no sentido de que o conteúdo legível é cifrado localmente antes da sincronização. O Google Drive funciona como transporte e armazenamento do bundle cifrado.

### Criptografia

- Cifra: AES-GCM de 256 bits.
- Tag de autenticação: 128 bits.
- KDF: PBKDF2-HMAC-SHA-256.
- Iterações: 600.000.
- Salt aleatório: 16 bytes.
- IV aleatório: 12 bytes por cifragem.
- AAD: contexto e identificador do cofre.

### Chave de dados (v0.5.0)

O cofre é cifrado com uma chave de dados (DEK) de 256 bits, gerada aleatoriamente e independente de qualquer senha. Essa DEK é "embrulhada" (cifrada) duas vezes, separadamente:

1. Por uma chave derivada da senha mestra (PBKDF2, salt e iterações próprios).
2. Por uma chave derivada da chave de recuperação (PBKDF2, salt e iterações próprios).

Nenhum dos dois embrulhos decifra o outro — cada um só devolve a mesma DEK a partir do seu próprio segredo. Trocar a senha mestra re-embrulha apenas o primeiro (a DEK e o conteúdo cifrado não mudam), e por isso a chave de recuperação continua válida depois da troca.

## Biometria

Quando disponível, o Keyron usa WebAuthn/PRF para proteger localmente o material necessário ao desbloqueio biométrico. Esse registro:

- pertence somente ao dispositivo e navegador atual;
- não é enviado ao Google Drive;
- pode ser apagado nas Configurações;
- não substitui a criptografia do arquivo.

No mobile, a tentativa biométrica vem primeiro. A senha mestra aparece como fallback se a biometria falhar, for cancelada ou estiver indisponível.

## Senhas vazadas

A consulta usa o endpoint Pwned Passwords por prefixo:

1. O SHA-1 da senha é calculado localmente.
2. Apenas os 5 primeiros caracteres do hash são enviados.
3. O serviço devolve vários sufixos possíveis, com padding.
4. O navegador compara o sufixo completo localmente.
5. O Keyron salva somente o resultado por credencial e a data, dentro do cofre cifrado.

O SHA-1 não é usado para cifrar nem armazenar senhas. Ele é usado exclusivamente porque faz parte do protocolo de k-anonymity dessa base.

## Recuperação e ausência de porta dos fundos

Não existe recuperação por CPF, CEP, telefone, nome da mãe, perguntas secretas ou simples confirmação por e-mail. Esses mecanismos reduziriam a segurança e permitiriam ataques com dados pessoais vazados.

Em vez disso, o Keyron gera uma chave de recuperação aleatória de alta entropia (30 caracteres, ≈150 bits) na criação do cofre — ou na migração de um cofre anterior — e mostra-a uma única vez para o usuário guardar fora do aparelho. Essa chave consegue destravar a DEK e permitir a definição de uma nova senha mestra, exatamente como a senha faria, sem nenhum atalho baseado em dados pessoais. O Keyron nunca guarda uma cópia legível dela: só o embrulho cifrado da DEK.

Sem a senha mestra e sem essa chave de recuperação, o cofre deve permanecer inacessível. Essa limitação é uma propriedade de segurança, não um erro.

## Dados que o Google ainda pode ver

O Google pode ver metadados do arquivo, como nome, tamanho e datas. O conteúdo interno — credenciais, ordem das gavetas, notas, logos, preferências e auditorias — permanece cifrado.

## Recomendações

- Use uma frase mestra longa, exclusiva e não reutilizada.
- Guarde a chave de recuperação exibida na criação do cofre em um local seguro e diferente deste aparelho.
- Ative biometria apenas em dispositivos confiáveis.
- Exporte backups `.keyron` periodicamente.
- Apague CSVs em texto puro após importá-los.
- Troque imediatamente qualquer senha sinalizada pela verificação de vazamentos.
