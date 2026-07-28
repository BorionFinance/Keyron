# Keyron v0.3.0 — configuração do Google Drive

O Keyron é um aplicativo estático. Não existe servidor próprio recebendo suas senhas. O navegador cifra o cofre e só então envia o arquivo cifrado ao seu Google Drive.

## 1. Criar o projeto no Google Cloud

1. Acesse o Google Cloud Console.
2. Crie ou selecione um projeto dedicado ao Keyron.
3. Em **APIs e serviços > Biblioteca**, ative a **Google Drive API**.
4. Em **Tela de consentimento OAuth**, configure o aplicativo. Para uso pessoal, mantenha como teste e adicione seu próprio e-mail como usuário de teste.
5. Em **Credenciais**, crie um **ID do cliente OAuth 2.0** do tipo **Aplicativo da Web**.

## 2. Informar as origens autorizadas

Em **Origens JavaScript autorizadas**, adicione exatamente os endereços onde o app será aberto. Exemplos:

- `https://keyron.borionfinance.com.br`
- `http://localhost:8000` para teste local

Não coloque caminhos como `/index.html` nessa lista.

## 3. Client ID já configurado nesta versão

A versão v0.3.0 já utiliza o mesmo Client ID OAuth da versão estável do Borion. Não é necessário editar `js/config.js`.

O Keyron não utiliza nem precisa da API Key do Borion: a autenticação e o acesso restrito ao Drive funcionam apenas com o Client ID OAuth e o escopo `drive.file`.

## 4. Publicar

Publique todo o conteúdo desta pasta na raiz do site. O Keyron precisa ser servido por HTTPS para Web Crypto, PWA e autenticação funcionarem de forma confiável.

Para teste local:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Estrutura criada no Drive

O app cria somente esta estrutura:

```text
Keyron/
├── vault.keyron
└── Backups/
    └── <identificador-aleatorio>.keyron
```

O conteúdo de `vault.keyron` e dos snapshots é cifrado com AES-256-GCM. Nomes, tamanho e datas dos arquivos continuam sendo metadados visíveis ao Google Drive; o conteúdo do cofre, incluindo senhas, notas, categorias e logos, não é enviado em texto puro.

## Importante sobre a senha mestra

- Ela não é armazenada no navegador nem no Drive.
- Ela não é enviada ao Google.
- Ela é usada localmente com PBKDF2-HMAC-SHA-256 e 600.000 iterações para derivar a chave AES-256.
- Não existe recuperação da senha mestra. Perder essa senha significa perder o acesso ao conteúdo cifrado.
- Guarde um backup `.keyron` e a senha mestra em locais separados.


## Correção obrigatória no Google Cloud para o subdomínio

Na mesma credencial OAuth usada pelo Borion, abra **Origens JavaScript autorizadas** e confirme que existe exatamente:

```text
https://keyron.borionfinance.com.br
```

Sem caminho, sem barra final e sem `www`. O Google não aceita curingas para subdomínios. Por isso, autorizar `https://www.borionfinance.com.br` não autoriza automaticamente `https://keyron.borionfinance.com.br`.

Depois de publicar esta versão, faça uma atualização forçada com `Ctrl + F5`. A v0.3.0 também corrige o cache antigo do PWA que podia continuar entregando o `config.js` com o valor de exemplo.
