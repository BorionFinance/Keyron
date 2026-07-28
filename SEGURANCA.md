# Segurança — Keyron v0.4.0

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

A senha mestra é usada para derivar a chave e não é gravada no bundle.

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

Sem a senha mestra ou uma biometria válida já registrada naquele dispositivo, o cofre deve permanecer inacessível. Essa limitação é uma propriedade de segurança, não um erro.

## Dados que o Google ainda pode ver

O Google pode ver metadados do arquivo, como nome, tamanho e datas. O conteúdo interno — credenciais, ordem das gavetas, notas, logos, preferências e auditorias — permanece cifrado.

## Recomendações

- Use uma frase mestra longa, exclusiva e não reutilizada.
- Ative biometria apenas em dispositivos confiáveis.
- Exporte backups `.keyron` periodicamente.
- Apague CSVs em texto puro após importá-los.
- Troque imediatamente qualquer senha sinalizada pela verificação de vazamentos.
