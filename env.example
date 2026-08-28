const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveIntegrationConfig, getIntegrationStatus } = require('../services/credentialsVault');
const vistaClient = require('../services/vistaClient');
const whatsappClient = require('../services/whatsappClient');
const baileysAdapter = require('../services/providers/baileysAdapter');

router.use(requireAuth);

router.get('/status', async (_req, res) => {
  const [vista, whatsapp] = await Promise.all([
    getIntegrationStatus('vista'),
    getIntegrationStatus('whatsapp'),
  ]);
  res.json({ vista, whatsapp });
});

// Configurações > Integrações > Vista CRM — seção 9
router.put('/vista', requireRole('ADMINISTRADOR'), async (req, res) => {
  const { apiUrl, apiToken, apiKey, companyId } = req.body;
  await saveIntegrationConfig('vista', { apiUrl, apiToken, apiKey, companyId });
  res.json({ ok: true });
});

router.post('/vista/test', requireRole('ADMINISTRADOR'), async (_req, res) => {
  const result = await vistaClient.testConnection();
  await prisma.integration.update({
    where: { provider: 'vista' },
    data: {
      connected: result.connected,
      lastCheckedAt: new Date(),
      lastError: result.error || null,
    },
  });
  res.json(result);
});

// Configurações > Integrações > WhatsApp — seção 10
router.put('/whatsapp', requireRole('ADMINISTRADOR'), async (req, res) => {
  const {
    provider,
    phoneNumberId,
    businessAccountId,
    accessToken,
    apiVersion,
    connectedNumber,
    webhookVerifyToken,
  } = req.body;
  await saveIntegrationConfig('whatsapp', {
    provider,
    phoneNumberId,
    businessAccountId,
    accessToken,
    apiVersion,
    connectedNumber,
    webhookVerifyToken,
  });
  res.json({ ok: true });
});

router.post('/whatsapp/test', requireRole('ADMINISTRADOR'), async (_req, res) => {
  const result = await whatsappClient.testConnection();
  await prisma.integration.update({
    where: { provider: 'whatsapp' },
    data: {
      connected: result.connected,
      lastCheckedAt: new Date(),
      lastError: result.error || null,
    },
  });
  res.json(result);
});

// ---------------------------------------------------------------------
// WhatsApp via Baileys (QR code) — provedor alternativo, não-oficial.
// Ver aviso de risco em services/providers/baileysAdapter.js.
// Fluxo no frontend (ainda não implementado):
//   1. PUT  /whatsapp        { provider: 'baileys' }   — seleciona o provedor
//   2. POST /whatsapp/baileys/connect                  — inicia a sessão
//   3. GET  /whatsapp/baileys/status  (poll)            — busca o QR / status
//   4. usuário escaneia o QR no celular
//   5. GET  /whatsapp/baileys/status volta "connected"
// ---------------------------------------------------------------------

router.post('/whatsapp/baileys/connect', requireRole('ADMINISTRADOR'), async (_req, res) => {
  try {
    const result = await baileysAdapter.connect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/whatsapp/baileys/status', requireRole('ADMINISTRADOR'), async (_req, res) => {
  res.json(baileysAdapter.getStatus());
});

router.post('/whatsapp/baileys/disconnect', requireRole('ADMINISTRADOR'), async (_req, res) => {
  const result = await baileysAdapter.disconnect();
  res.json(result);
});

module.exports = router;
