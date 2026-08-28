# Integração com Vista CRM — o que falta para ativar

O código em `backend/src/services/vistaClient.js` já implementa:

- Cliente HTTP configurável (base URL, chave/token, headers de auth)
- Retry com backoff e tratamento de erro
- Normalização de payload do Vista para o modelo interno (`Lead`, `Client`,
  `Deal`, `Property`)
- Cache curto para reduzir chamadas repetidas
- Teste de conexão (`testConnection()`) usado pelo botão "Testar conexão"

O que eu **não posso inventar** e preciso que você me informe (com base na
documentação oficial da sua conta Vista — o formato varia por plano/versão):

1. **URL base da API** (ex.: `https://SEUCRM.vistahost.com.br/api/v1`)
2. **Método de autenticação exato** (token em header `Authorization`?
   query string `key=`? OAuth?)
3. **Endpoints e nomes de campo** para:
   - listar leads/clientes
   - listar negócios (deals) e suas etapas
   - obter telefone/e-mail normalizado do cliente
   - obter imóvel vinculado ao negócio
   - webhooks (se o Vista suporta notificação de mudança de etapa) ou se
     é necessário fazer polling
4. **Nomes/IDs das etapas do funil** no seu Vista, para eu mapear:
   `LEAD → ATENDIMENTO → VISITA_APROVACAO → CLIENTE_APROVADO → FECHAMENTO`

Assim que você tiver esses dados, preencha
`backend/src/config/vista.endpoints.js` (arquivo isolado, comentado,
pronto para receber os valores reais) — nenhuma outra parte do sistema
precisa mudar.
