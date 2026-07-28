# Relatório de testes — Keyron v0.5.0

## Testes automatizados de núcleo: 14/14 aprovados

1. Criação de cofre no schema 3.
2. Inclusão de nova credencial no topo.
3. Reordenação para cima e para baixo na mesma gaveta.
4. Mudança entre gavetas na posição escolhida.
5. Edição sem alterar a ordem manual.
6. Migração da versão 0.3.9/schema 2 preservando a ordem visual anterior.
7. Exclusão com reindexação e limpeza da auditoria relacionada.
8. Cifragem e abertura real com AES-256-GCM e PBKDF2 de 600.000 iterações; rejeição de senha errada; ausência do segredo no bundle.
9. SHA-1 local conhecido e parser da resposta k-anonymity.
10. Regra semanal de sete dias.
11. Cofre novo gera chave de recuperação própria (independente da senha) e a chave errada é rejeitada.
12. Trocar a senha mestra preserva a mesma chave de dados (DEK) — senha antiga passa a ser rejeitada, chave de recuperação original continua válida.
13. Gerar uma nova chave de recuperação invalida a anterior sem afetar a senha mestra atual.
14. Cofre antigo (formato v2, sem chave de dados própria) ainda destrava normalmente e a migração gera DEK + chave de recuperação preservando o identificador do cofre.

## Validações estáticas aprovadas

- Sintaxe de todos os arquivos JavaScript (incluindo `crypto.js` reescrito e o novo `sound.js`).
- Todos os IDs usados pelo `app.js` existem no HTML.
- Nenhum ID duplicado no HTML.
- Todos os scripts, estilos e recursos do Service Worker existem.
- Cache do PWA atualizado para v0.5.0.
- CSP contém o domínio do Pwned Passwords e continua restritiva.
- Fluxo normal do Google não força seletor de conta; escopo reduzido a `drive.file`.
- Ordenação manual, animação de desbloqueio e biometria-primeiro presentes no código final.

## Testes que exigem ambiente externo

Google OAuth, Google Drive, WebAuthn/PRF e a resposta ao vivo do Pwned Passwords dependem de domínio HTTPS autorizado, conta Google, dispositivo com biometria e internet. Esses serviços não podem ser simulados integralmente no ambiente isolado de empacotamento; devem ser confirmados no domínio final após a publicação. Isso inclui confirmar, no domínio real, que a autenticação Google passou a exigir apenas um clique.
