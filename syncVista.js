const axios = require('axios');

/**
 * Adaptador para a API oficial da Meta (WhatsApp Business Cloud API).
 * Documentação oficial: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Campos esperados em `config` (salvos criptografados via
 * Configurações > Integrações > WhatsApp):
 *   - phoneNumberId
 *   - businessAccountId
 *   - accessToken
 *   - apiVersion (opcional, ex. "v20.0")
 */

const GRAPH_BASE = 'https://graph.facebook.com';

function client(config) {
  const version = config.apiVersion || 'v20.0';
  return axios.create({
    baseURL: `${GRAPH_BASE}/${version}`,
    headers: { Authorization: `Bearer ${config.accessToken}` },
    timeout: 15000,
  });
}

async function testConnection(config) {
  if (!config.phoneNumberId || !config.accessToken) {
    return { connected: false, error: 'phoneNumberId e accessToken são obrigatórios.' };
  }
  try {
    const http = client(config);
    await http.get(`/${config.phoneNumberId}`);
    return { connected: true };
  } catch (err) {
    return {
      connected: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
}

async function sendMessage(config, { toPhone, body, templateName, variables }) {
  const http = client(config);
  const payload = templateName
    ? {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: variables
            ? [
                {
                  type: 'body',
                  parameters: Object.values(variables).map((v) => ({
                    type: 'text',
                    text: String(v),
                  })),
                },
              ]
            : undefined,
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body },
      };

  const { data } = await http.post(`/${config.phoneNumberId}/messages`, payload);
  return { providerMessageId: data.messages?.[0]?.id ?? null, raw: data };
}

/** Converte o payload de webhook da Meta em um evento normalizado. */
function parseWebhookEvent(_config, rawBody) {
  const entry = rawBody?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  if (!message) return null;

  return {
    type: 'INBOUND_MESSAGE',
    fromPhone: message.from,
    body: message.text?.body ?? '',
    providerMessageId: message.id,
    timestamp: message.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date(),
  };
}

module.exports = { testConnection, sendMessage, parseWebhookEvent };
