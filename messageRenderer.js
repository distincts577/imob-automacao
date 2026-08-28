const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { useDbAuthState } = require('../baileysAuthStore');

/**
 * Adaptador alternativo para WhatsApp usando Baileys (protocolo do
 * WhatsApp Web, não-oficial — sem passar pela Cloud API da Meta).
 *
 * ATENÇÃO — leia antes de ativar em produção:
 *  - Este NÃO é o método oficial da Meta. O número conecta como se fosse
 *    o WhatsApp Web, escaneando um QR code.
 *  - O WhatsApp pode banir/bloquear números que enviam alto volume de
 *    mensagens automatizadas por essa via, especialmente para contatos
 *    que não iniciaram a conversa. Use um número secundário (não o
 *    principal da imobiliária) enquanto testa.
 *  - Diferente do adaptador Meta Cloud API (services/providers/
 *    metaCloudApiAdapter.js), aqui não existe "webhook" HTTP: a conexão
 *    é um socket persistente. Por isso este arquivo já injeta as
 *    mensagens recebidas direto em automationEngine.handleClientReply
 *    (equivalente ao que webhook.routes.js faz para a Meta).
 *
 * Interface exposta e usada por whatsappClient.js:
 *   testConnection(config), sendMessage(config, {...}), parseWebhookEvent
 *   (não se aplica aqui — mantido só para não quebrar a interface comum;
 *   nunca é chamado, pois não existe webhook.routes.js para Baileys).
 *
 * Interface extra, usada só pelas rotas de Integrações (integrations.
 * routes.js) para o fluxo de pareamento por QR code:
 *   connect(), disconnect(), getStatus()
 */

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

// Estado do socket em memória (um único processo/sessão por vez — este
// projeto roda o worker no mesmo processo da API, então um Map simples
// já resolve; não use múltiplas instâncias do servidor com Baileys sem
// adaptar isso para um lock distribuído).
let sock = null;
let currentStatus = 'disconnected'; // disconnected | connecting | qr_pending | connected
let currentQrDataUrl = null;
let lastError = null;
let connectingPromise = null;

function normalizeToJid(toPhone) {
  // Espera E.164 (+5511999999999). Baileys quer só dígitos + sufixo.
  const digits = String(toPhone).replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function jidToE164(jid) {
  const digits = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  return `+${digits}`;
}

async function connect() {
  if (connectingPromise) return connectingPromise;
  if (currentStatus === 'connected' && sock) return { status: currentStatus };

  connectingPromise = (async () => {
    currentStatus = 'connecting';
    lastError = null;
    currentQrDataUrl = null;

    const { state, saveCreds, clearAll } = await useDbAuthState();
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Imob Automação', 'Chrome', '1.0'],
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentStatus = 'qr_pending';
        currentQrDataUrl = await QRCode.toDataURL(qr);
      }

      if (connection === 'open') {
        currentStatus = 'connected';
        currentQrDataUrl = null;
        lastError = null;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          currentStatus = 'disconnected';
          currentQrDataUrl = null;
          sock = null;
          await clearAll();
        } else {
          // Queda de conexão (não foi logout manual) — tenta reconectar
          // reaproveitando a sessão salva no banco.
          currentStatus = 'connecting';
          sock = null;
          connectingPromise = null;
          connect().catch((err) => {
            lastError = err.message;
            currentStatus = 'disconnected';
          });
        }
      }
    });

    // Mensagens recebidas — equivalente ao POST /webhooks/whatsapp da Meta.
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          if (!msg.message || msg.key.fromMe) continue;
          // Ignora grupos e status — só atende conversas 1:1.
          if (msg.key.remoteJid?.endsWith('@g.us') || msg.key.remoteJid === 'status@broadcast') {
            continue;
          }
          const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            '';
          if (!body) continue;

          // Require tardio para evitar dependência circular
          // (automationEngine -> whatsappClient -> este arquivo).
          const automationEngine = require('../automationEngine');
          await automationEngine.handleClientReply({
            fromPhone: jidToE164(msg.key.remoteJid),
            body,
            providerMessageId: msg.key.id,
          });
        } catch (err) {
          console.error('Erro processando mensagem recebida (Baileys):', err.message);
        }
      }
    });

    // Espera a conexão abrir, o QR aparecer, ou dar erro — para a rota
    // HTTP que chamou connect() poder responder algo útil de imediato.
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (currentStatus === 'qr_pending' || currentStatus === 'connected' || currentStatus === 'disconnected') {
          clearInterval(check);
          resolve();
        }
      }, 250);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 15000);
    });

    connectingPromise = null;
    return { status: currentStatus };
  })();

  return connectingPromise;
}

async function disconnect() {
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      // já pode estar desconectado — ignora
    }
  }
  const { clearAll } = await useDbAuthState();
  await clearAll();
  sock = null;
  currentStatus = 'disconnected';
  currentQrDataUrl = null;
  lastError = null;
  return { status: currentStatus };
}

function getStatus() {
  return {
    status: currentStatus,
    connected: currentStatus === 'connected',
    qr: currentQrDataUrl,
    error: lastError,
    connectedNumber:
      currentStatus === 'connected' && sock?.user?.id ? jidToE164(sock.user.id) : null,
  };
}

/** Usado por whatsappClient.testConnection() — mantém a interface comum. */
async function testConnection(_config) {
  if (currentStatus === 'connected') return { connected: true };
  if (currentStatus === 'qr_pending') {
    return { connected: false, error: 'Aguardando leitura do QR code em Integrações > WhatsApp.' };
  }
  return { connected: false, error: lastError || 'Sessão do Baileys não conectada.' };
}

async function sendMessage(_config, { toPhone, body }) {
  if (currentStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp (Baileys) não está conectado. Escaneie o QR code em Integrações.');
  }
  const jid = normalizeToJid(toPhone);
  const result = await sock.sendMessage(jid, { text: body });
  return { providerMessageId: result?.key?.id ?? null, raw: result };
}

/** Não usado (Baileys não recebe via webhook HTTP) — mantido pela interface comum. */
function parseWebhookEvent() {
  return null;
}

module.exports = {
  // interface comum (whatsappClient.js / ADAPTERS map)
  testConnection,
  sendMessage,
  parseWebhookEvent,
  // interface extra, só para o fluxo de pareamento por QR code
  connect,
  disconnect,
  getStatus,
};
