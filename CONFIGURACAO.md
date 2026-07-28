# Configuração do Keyron v0.4.0

## 1. Google OAuth

Edite `js/config.js` e informe o Client ID do aplicativo Web criado no Google Cloud:

```js
window.KeyronConfig = {
  GOOGLE_CLIENT_ID: 'SEU_CLIENT_ID.apps.googleusercontent.com',
  MAX_LOGO_BYTES: 4194304
};
```

No Google Cloud, cadastre exatamente os domínios HTTPS em que o Keyron será aberto em **Origens JavaScript autorizadas**. Para produção, use o domínio final do Keyron.

O Keyron solicita:

- `openid email profile`, para identificar a conta escolhida;
- `https://www.googleapis.com/auth/drive.file`, para acessar somente arquivos criados ou abertos pelo próprio aplicativo.

No acesso normal, o aplicativo não força `select_account`. O seletor completo de conta é usado somente quando o usuário pede para trocar de conta ou sai da conta atual.

## 2. HTTPS obrigatório

Publique em HTTPS. Biometria/WebAuthn, Service Worker, PWA, área de transferência e vários recursos de segurança exigem contexto seguro.

## 3. Verificação de senhas vazadas

A Content Security Policy já permite conexão somente com:

- APIs do Google necessárias ao Drive e OAuth;
- `https://api.pwnedpasswords.com`, usado pela consulta k-anonymity.

A verificação semanal acontece ao abrir e desbloquear o Keyron quando:

- a opção está ativada nas Configurações;
- já passaram 7 dias desde a última verificação;
- existe conexão com a internet.

Não há tarefa em servidor nem verificação com o cofre bloqueado. O aplicativo precisa estar aberto e desbloqueado para calcular os hashes localmente.

## 4. Atualização da 0.3.9

Substitua os arquivos publicados pelos arquivos da 0.4.0. O Service Worker usa um cache novo e remove o cache antigo na ativação.

Ao desbloquear um cofre antigo, a migração para o schema 3 é automática. Ela adiciona a ordem interna das credenciais e a estrutura de auditoria sem alterar senhas, notas, logos ou categorias.

Antes de atualizar produção, mantenha uma cópia do arquivo `.keyron` atual.
