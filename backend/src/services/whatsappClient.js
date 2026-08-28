const { getIntegrationConfig } = require('./credentialsVault');
const metaCloudAdapter = require('./providers/metaCloudApiAdapter');
const baileysAdapter = require('./providers/baileysAdapter');

/**
 * Fachada de integração com WhatsApp. Delega para o adaptador do provedor
 * configurado, para permitir trocar de provedor (seção 10) sem alterar
 * automationEngine, worker ou frontend.
 *
 * Provedores suportados hoje:
 *  - "meta_cloud_api": API oficial da Meta (Cloud API).
 *  - "baileys": conexão não-oficial via QR code (WhatsApp Web). Só use
 *    com ciência do risco de ban do número — ver aviso no topo de
 *    services/providers/baileysAdapter.js. Diferente do meta_cloud_api,
 *    o pareamento/QR code é feito por rotas próprias em
 *    integrations.routes.js (POST /whatsapp/baileys/connect etc.), não
 *    pelo formulário padrão de credenciais.
 *
 * Para adicionar outro provedor oficial (Twilio, 360dialog, Zenvia...),
 * crie um novo arquivo em services/providers/ seguindo a mesma interface
 * (sendMessage, testConnection, parseWebhookEvent) e registre-o no mapa
 * abaixo.
 */

const ADAPTERS = {
  meta_cloud_api: metaCloudAdapter,
  baileys: baileysAdapter,
};

async function getAdapter() {
  const config = await getIntegrationConfig('whatsapp');
  if (!config || !config.provider) {
    throw new Error(
      'Integração com WhatsApp não configurada. Preencha em Configurações > Integrações > WhatsApp.'
    );
  }
  const adapter = ADAPTERS[config.provider];
  if (!adapter) {
    throw new Error(`Provedor de WhatsApp "${config.provider}" não implementado.`);
  }
  return { adapter, config };
}

async function testConnection() {
  try {
    const { adapter, config } = await getAdapter();
    return await adapter.testConnection(config);
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

async function sendMessage({ toPhone, body, templateName, variables }) {
  const { adapter, config } = await getAdapter();
  return adapter.sendMessage(config, { toPhone, body, templateName, variables });
}

/** Interpreta o payload cru do webhook do provedor em um evento normalizado. */
async function parseWebhookEvent(rawBody) {
  const { adapter, config } = await getAdapter();
  return adapter.parseWebhookEvent(config, rawBody);
}

module.exports = { testConnection, sendMessage, parseWebhookEvent };
