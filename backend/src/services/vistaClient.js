const axios = require('axios');
const vistaConfig = require('../config/vista.endpoints');
const { getIntegrationConfig } = require('./credentialsVault');

/**
 * Cliente de integração com o Vista CRM.
 *
 * Estrutura pronta para produção (auth configurável, retry, normalização
 * de dados). Os endpoints reais vêm de `config/vista.endpoints.js`, que
 * o administrador preenche a partir da documentação oficial do Vista —
 * ver README-VISTA.md. Enquanto isso não estiver configurado, todas as
 * chamadas falham de forma explícita, e a UI mostra 🔴 no painel de
 * Integrações — o sistema nunca finge estar sincronizado.
 */
class VistaClient {
  constructor() {
    this._http = null;
  }

  async _getHttpClient() {
    const config = await getIntegrationConfig('vista');
    if (!config || !config.apiUrl || !config.apiToken) {
      throw new Error(
        'Integração com o Vista não configurada. Preencha URL da API e token em ' +
          'Configurações > Integrações > Vista CRM.'
      );
    }
    if (vistaConfig.authMode === 'PENDENTE_CONFIRMACAO') {
      throw new Error(
        'O modo de autenticação da API do Vista ainda não foi confirmado ' +
          '(config/vista.endpoints.js). Veja README-VISTA.md.'
      );
    }

    const headers = { 'Content-Type': 'application/json' };
    if (vistaConfig.authMode === 'header:Authorization') {
      headers.Authorization = `Bearer ${config.apiToken}`;
    } else if (vistaConfig.authMode.startsWith('header:')) {
      const headerName = vistaConfig.authMode.split(':')[1];
      headers[headerName] = config.apiToken;
    }

    return axios.create({
      baseURL: config.apiUrl,
      headers,
      timeout: 15000,
      params:
        vistaConfig.authMode === 'query:key' ? { key: config.apiToken } : undefined,
    });
  }

  async _requestWithRetry(fn, retries = 2) {
    try {
      return await fn();
    } catch (err) {
      if (retries > 0 && (!err.response || err.response.status >= 500)) {
        await new Promise((r) => setTimeout(r, 500));
        return this._requestWithRetry(fn, retries - 1);
      }
      throw err;
    }
  }

  async testConnection() {
    try {
      const http = await this._getHttpClient();
      const path = vistaConfig.endpoints.listClients;
      if (!path) {
        return {
          connected: false,
          error:
            'Endpoints do Vista ainda não configurados em config/vista.endpoints.js.',
        };
      }
      await this._requestWithRetry(() => http.get(path, { params: { limit: 1 } }));
      return { connected: true };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  /** Busca leads/clientes/negócios atualizados desde a última sincronização. */
  async fetchUpdatedRecords(since) {
    const http = await this._getHttpClient();
    const path = vistaConfig.endpoints.listDeals;
    if (!path) throw new Error('Endpoint listDeals não configurado.');

    const { data } = await this._requestWithRetry(() =>
      http.get(path, { params: { updated_since: since ? since.toISOString() : undefined } })
    );

    // Normalização: adapte os nomes de campo reais do Vista aqui assim que
    // a documentação for confirmada. Estrutura de saída esperada pelo
    // restante do sistema:
    return (Array.isArray(data) ? data : data.results || []).map((raw) =>
      this._normalizeDeal(raw)
    );
  }

  _normalizeDeal(raw) {
    return {
      vistaDealId: raw.id ?? raw.negocio_id ?? null,
      client: {
        vistaId: raw.cliente_id ?? raw.client_id ?? null,
        name: raw.cliente_nome ?? raw.client_name ?? null,
        phone: raw.cliente_telefone ?? raw.client_phone ?? null,
        email: raw.cliente_email ?? raw.client_email ?? null,
      },
      property: raw.imovel
        ? {
            vistaId: raw.imovel.id ?? null,
            title: raw.imovel.titulo ?? raw.imovel.title ?? null,
            code: raw.imovel.codigo ?? null,
            address: raw.imovel.endereco ?? null,
            neighborhood: raw.imovel.bairro ?? null,
            city: raw.imovel.cidade ?? null,
            price: raw.imovel.valor ?? null,
            link: raw.imovel.link ?? null,
          }
        : null,
      broker: raw.corretor
        ? { vistaId: raw.corretor.id ?? null, name: raw.corretor.nome ?? null }
        : null,
      stageRaw: raw.etapa ?? raw.stage ?? null,
      stage: vistaConfig.stageMapping[raw.etapa ?? raw.stage] ?? null,
      updatedAt: raw.atualizado_em ?? raw.updated_at ?? null,
    };
  }
}

module.exports = new VistaClient();
