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

// Gera candidatos alternativos de dígitos para números brasileiros, cobrindo
// a ambiguidade do 9º dígito: o número pode estar salvo com ou sem ele, e o
// WhatsApp pode ter a conta cadastrada só em um dos dois formatos.
// Formato BR: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos).
function buildBrDigitCandidates(digits) {
  const candidates = [digits];
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) {
      // Tem o 9 -> também tenta sem ele
      candidates.push(`55${ddd}${rest.slice(1)}`);
    } else if (rest.length === 8) {
      // Não tem o 9 -> também tenta com ele
      candidates.push(`55${ddd}9${rest}`);
    }
  }
  return candidates;
}

// Confirma com os servidores do WhatsApp (via sock.onWhatsApp) qual variante
// do número realmente existe, em vez de só concatenar dígitos às cegas.
// Lança erro claro se nenhuma variante estiver no WhatsApp, para que a
// automação NÃO marque a mensagem como enviada quando na verdade não há
// ninguém do outro lado.
async function resolveJid(toPhone) {
  const digits = String(toPhone).replace(/\D/g, '');
  const candidates = buildBrDigitCandidates(digits);

  for (const candidate of candidates) {
    try {
      const [result] = (await sock.onWhatsApp(candidate)) || [];
      if (result?.exists) {
        return result.jid;
      }
    } catch (err) {
      // onWhatsApp pode falhar por instabilidade de rede — tenta o próximo
      // candidato antes de desistir.
    }
  }

  throw new Error(
    `Número ${toPhone} não foi encontrado no WhatsApp (verificado nos formatos: ${candidates.join(', ')}). Confira se o número está correto, incluindo o 9º dígito quando aplicável.`
  );
}

// IMPORTANTE: usada tanto para exibir o connectedNumber quanto para
// identificar de qual cliente veio uma resposta (handleClientReply compara
// isso com client.phone salvo no banco). NÃO reformatar dígitos aqui —
// isso quebraria esse casamento se o telefone estiver salvo no banco em
// outro formato. Para exibição "bonita", use jidToE164Display.
function jidToE164(jid) {
  const digits = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  return `+${digits}`;
}

// Só para exibição (tela de Integrações): o WhatsApp às vezes devolve o
// próprio número da sessão no formato antigo (sem o 9º dígito), mesmo
// quando o número real tem 9 dígitos. Isso não afeta o envio (resolveJid
// trata isso via onWhatsApp) — é só pra tela não parecer "errada" à toa.
function jidToE164Display(jid) {
  const digits = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  return `+${formatBrDigitsForDisplay(digits)}`;
}

function formatBrDigitsForDisplay(digits) {
  if (digits.startsWith('55') && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8 && /^[6-9]/.test(rest)) {
      return `55${ddd}9${rest}`;
    }
  }
  return digits;
}

let unhandledRejectionGuardInstalled = false;

// Erros que acontecem fora do fluxo normal de connection.update (ex.:
// timeout durante o handshake inicial, tipo "Timed Out" em
// uploadPreKeysToServerIfRequired, antes mesmo de existir um evento
// 'close') não podem derrubar o processo inteiro — sem isso, viram um
// unhandledRejection e matam o servidor Node inteiro.
function registerUnhandledRejectionGuard() {
  if (unhandledRejectionGuardInstalled) return;
  unhandledRejectionGuardInstalled = true;
  process.on('unhandledRejection', (err) => {
    const message = err?.message || String(err);
    console.error('Baileys: erro não tratado durante a conexão:', message);
    lastError = message;
    if (currentStatus !== 'connected') {
      currentStatus = 'disconnected';
      sock = null;
      connectingPromise = null;
    }
  });
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
      // Hospedagens em nuvem (Render, etc.) costumam ter handshake mais
      // lento com os servidores do WhatsApp do que uma rede residencial.
      // Os timeouts padrão da lib (bem mais curtos) derrubam a conexão
      // logo no início (ex.: "Timed Out" em uploadPreKeysToServerIfRequired)
      // mesmo sem nada de errado com as credenciais.
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
      retryRequestDelayMs: 2_000,
      qrTimeout: 60_000,
    });

    sock.ev.on('creds.update', saveCreds);
    registerUnhandledRejectionGuard();

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
      currentStatus === 'connected' && sock?.user?.id ? jidToE164Display(sock.user.id) : null,
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
  const jid = await resolveJid(toPhone);
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
