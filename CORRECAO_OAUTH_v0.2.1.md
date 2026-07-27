# Correção OAuth — Keyron v0.2.1

- Client ID OAuth reaproveitado da versão estável do Borion.
- Removido o valor de exemplo que causava o aviso “OAuth ainda não configurado”.
- Escopos ajustados para `openid`, `email`, `profile` e `drive.file`.
- Identificação da conta Google verificada na sessão.
- Mensagens específicas para pop-up bloqueado, acesso recusado, Client ID inválido e origem não autorizada.
- Cache do PWA alterado para não manter `config.js` antigo.
- Arquivos JavaScript e CSS versionados para atualização imediata após publicação.
- Nenhuma API Key do Borion foi copiada, pois o Keyron não precisa dela.

## Único ajuste externo que pode continuar necessário

Na credencial OAuth do Google Cloud, adicionar exatamente `https://keyron.borionfinance.com.br` em **Origens JavaScript autorizadas**.
