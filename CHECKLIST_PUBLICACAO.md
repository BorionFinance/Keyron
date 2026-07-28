# Checklist de publicação — Keyron v0.3.0

Use credenciais fictícias até concluir este teste.

1. Substitua todos os arquivos da versão antiga pelos arquivos desta pasta.
2. Confirme no Google Cloud a origem exata `https://keyron.borionfinance.com.br`.
3. Abra o site e pressione `Ctrl + F5`.
4. Confirme que a tela mostra `v0.3.0`.
5. Entre com a conta Google correta e crie ou abra o cofre.
6. Cadastre uma credencial fictícia e observe os estados `Protegendo` → `Salvo local` → `Sincronizado`.
7. Altere rapidamente nome, categoria e gaveta; aguarde o estado `Sincronizado`.
8. Feche a aba imediatamente após outra alteração e abra novamente. A última alteração deve continuar presente.
9. Desligue a internet, faça uma alteração e confirme `Somente local` ou `Pendente`; religue a internet e aguarde `Sincronizado`.
10. No Drive, confirme a estrutura `Keyron/vault.keyron` e `Keyron/Backups/`.
11. Abra o Keyron em outro dispositivo, entre com a mesma conta Google e use a mesma senha mestra.
12. Exporte um `.keyron`, teste a senha do arquivo e guarde o backup separado da senha mestra.

Não use senhas reais se qualquer etapa falhar.
