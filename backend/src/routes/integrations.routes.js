const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveIntegrationConfig, getIntegrationStatus } = require('../services/credentialsVault');
const vistaClient = require('../services/vistaClient');
const whatsappClient = require('../services/whatsappClient');

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

module.exports = router;
