# Configuração do Keyron v1.0.0

## 1. Google OAuth

O Client ID em `js/config.js` deve ser de um aplicativo OAuth do tipo Web. Esse identificador é público e precisa existir no frontend; nunca coloque `client_secret`, chave privada ou token fixo no projeto.

Cadastre, nas origens JavaScript autorizadas, o endereço HTTPS exato em que o Keyron será publicado, incluindo protocolo e porta quando houver. Exemplo:

```text
https://keyron.exemplo.com.br
```

O aplicativo solicita somente:

```text
https://www.googleapis.com/auth/drive.file
```

A conta é vinculada pelo `permissionId` estável retornado pela API do Drive. Nome e e-mail são usados apenas para identificação visual.

## 2. HTTPS e cabeçalhos

Publique exclusivamente em HTTPS. WebAuthn, Service Worker, PWA e área de transferência exigem contexto seguro.

O HTML possui CSP e o Service Worker adiciona cabeçalhos defensivos nas respostas que controla. Na primeira visita, antes de o Service Worker assumir a página, os cabeçalhos precisam vir do servidor/CDN sempre que a hospedagem permitir. Priorize:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://api.pwnedpasswords.com; img-src 'self' data: blob:; style-src 'self'; style-src-attr 'unsafe-inline'; frame-src https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), publickey-credentials-create=(self), publickey-credentials-get=(self)
```

`same-origin-allow-popups` é necessário para não quebrar o fluxo OAuth em popup.

## 3. Limites configuráveis

`js/config.js` define limites de logo, bundle, CSV, quantidade de backups, bloqueio em segundo plano e intervalo de snapshots. Aumentar esses valores amplia consumo de memória e superfície de negação de serviço; reduzi-los pode impedir a abertura de cofres legítimos grandes.

## 4. Atualização para v1.0.0

Substitua todos os arquivos publicados juntos. O cache do PWA usa `keyron-shell-v1.0.0` e remove caches antigos na ativação.

Cofres legados compatíveis são migrados após um desbloqueio válido. A migração cria o formato v4, adiciona o selo de integridade e vincula o cofre à conta Google verificada. Antes do primeiro deploy, mantenha uma cópia cifrada do `.keyron` atual fora da pasta publicada.

## 5. Checklist após publicar

- Confirmar que o Google abre uma única seleção de conta.
- Confirmar que a conta exibida é a correta.
- Criar uma credencial de teste, fechar a aba e reabrir em outro dispositivo.
- Testar senha errada, senha correta e chave de recuperação.
- Testar biometria em um dispositivo compatível.
- Testar conflito real com dois dispositivos sem sobrescrever dados.
- Confirmar no DevTools que `vault.keyron` não contém nomes, usuários ou senhas legíveis.
- Confirmar que o domínio entrega os cabeçalhos de segurança também na primeira navegação.
