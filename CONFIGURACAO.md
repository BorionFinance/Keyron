# Configuração — Borion Senhas

Só falta uma coisa antes de usar: um **Client ID OAuth** do Google, pra o app poder
pedir permissão de acessar (só) os arquivos que ele mesmo cria no seu Drive.
Não precisa de API Key separada — o app fala com a Drive API usando o próprio
token OAuth do login.

## 1. Criar o projeto no Google Cloud

1. Acesse https://console.cloud.google.com/
2. Crie um projeto novo (ex.: "Borion Senhas")

## 2. Ativar a Drive API

1. Menu lateral → **APIs e serviços** → **Biblioteca**
2. Busque **Google Drive API** → **Ativar**

## 3. Configurar a tela de consentimento OAuth

1. **APIs e serviços** → **Tela de permissão OAuth**
2. Tipo de usuário: **Externo**
3. Preencha nome do app ("Borion Senhas"), e-mail de suporte e e-mail de contato
   (pode usar o seu mesmo)
4. Em **Escopos**, não precisa adicionar nada manualmente (o app já pede
   `drive.file` diretamente)
5. Em **Usuários de teste**, adicione seu próprio e-mail do Google
   (enquanto o app não passa por verificação do Google, só e-mails cadastrados
   aqui conseguem logar — perfeito pra uso pessoal, não precisa publicar)

## 4. Criar o Client ID

1. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**
2. Tipo de aplicativo: **Aplicativo da Web**
3. Em **Origens JavaScript autorizadas**, adicione as URLs de onde o app vai rodar, por exemplo:
   - `https://SEU-USUARIO.github.io` (seu GitHub Pages)
   - `http://localhost:5500` (se quiser testar local, ajuste a porta do que você usar)
4. Não precisa preencher "URIs de redirecionamento" — este fluxo não usa redirect
5. Clique em **Criar** e copie o **Client ID** gerado (termina em `.apps.googleusercontent.com`)

## 5. Colar no app

Abra `js/config.js` e troque:

```js
GOOGLE_CLIENT_ID: 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com'
```

pelo Client ID que você copiou.

## 6. Publicar

Suba a pasta inteira pro GitHub Pages, do jeito que você já faz com os outros
apps da Constelação. Depois é só abrir o link, criar sua senha mestra e
conectar o Drive.

---

**Nota de segurança:** o escopo usado é `drive.file`, o mais restrito que existe
pra isso — o app só consegue ver/editar o próprio arquivo que ele cria
(`borion-senhas-vault.json`), nunca o resto do seu Drive.
