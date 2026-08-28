/**
 * Configuração dos endpoints do Vista CRM.
 *
 * ATENÇÃO: Estes valores NÃO foram inventados — são placeholders.
 * Preencha com base na documentação oficial da API do Vista disponível
 * para a sua conta (o formato pode variar por plano/versão). Veja
 * README-VISTA.md na raiz do projeto para o que exatamente é preciso
 * confirmar antes de ativar a sincronização real.
 *
 * Nenhuma chamada é feita para estes endpoints enquanto eles não forem
 * revisados e confirmados — o vistaClient.testConnection() falha de
 * forma explícita (🔴) até isso ser configurado.
 */

module.exports = {
  // Ex.: 'https://SEUCRM.vistahost.com.br/api/v1'
  baseUrlEnvVar: 'VISTA_API_URL',

  // Como o token deve ser enviado — ajuste conforme a doc oficial:
  // 'header:Authorization' | 'header:key' | 'query:key' | 'oauth2'
  authMode: 'PENDENTE_CONFIRMACAO',

  endpoints: {
    // Preencher com os paths reais documentados pela Vista.
    listLeads: null,       // ex.: '/leads'
    listClients: null,     // ex.: '/clientes'
    listDeals: null,       // ex.: '/negocios'
    getProperty: null,     // ex.: '/imoveis/:id'
    updateDealStage: null, // se o Vista permitir escrita
    webhook: null,         // se o Vista suportar push de eventos
  },

  // Mapeamento das etapas do Vista para o enum interno FunnelStage.
  // Preencher com os nomes/IDs reais usados no funil do cliente.
  stageMapping: {
    // 'nome_ou_id_no_vista': 'LEAD' | 'ATENDIMENTO' | 'VISITA_APROVACAO' | 'CLIENTE_APROVADO' | 'FECHAMENTO'
  },
};
