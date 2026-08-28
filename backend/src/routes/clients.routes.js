const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Listagem com filtros — seção 2
router.get('/', async (req, res) => {
  const { name, phone, brokerId, stage, automationStatus, from, to } = req.query;

  const where = {
    ...(name && { name: { contains: name, mode: 'insensitive' } }),
    ...(phone && { phone: { contains: phone } }),
    ...(brokerId && { brokerId }),
    ...(stage && { currentStage: stage }),
    ...(from || to
      ? {
          updatedAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }
      : {}),
  };

  const clients = await prisma.client.findMany({
    where,
    include: {
      broker: true,
      deals: { where: { active: true }, take: 1, include: { property: true } },
      automationSequences: { orderBy: { updatedAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  const filtered = automationStatus
    ? clients.filter((c) => c.automationSequences[0]?.status === automationStatus)
    : clients;

  res.json(filtered);
});

// Criação manual de cliente (ex.: cliente de teste, sem vir do Vista)
router.post('/', async (req, res) => {
  const { name, phone, email, brokerId, currentStage } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'name e phone são obrigatórios.' });
  }

  const normalizedPhone = String(phone).replace(/[^\d+]/g, '');

  const existing = await prisma.client.findFirst({ where: { phone: normalizedPhone } });
  if (existing) {
    return res.status(409).json({ error: 'Já existe um cliente com esse telefone.', client: existing });
  }

  const client = await prisma.client.create({
    data: {
      name,
      phone: normalizedPhone,
      email: email || null,
      brokerId: brokerId || null,
      currentStage: currentStage || 'LEAD',
    },
  });

  await prisma.automationLog.create({
    data: { clientId: client.id, action: 'CLIENT_CREATED_MANUAL', userId: req.user.sub, details: { origin: 'manual' } },
  });

  res.status(201).json(client);
});

// Detalhe do cliente — seção 2
router.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      broker: true,
      deals: { include: { property: true } },
      stageHistory: { orderBy: { changedAt: 'desc' } },
      whatsappMessages: { orderBy: { createdAt: 'desc' }, take: 100 },
      messages: { orderBy: { scheduledFor: 'desc' }, take: 50 },
      automationSequences: { orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(client);
});

// Controles individuais de automação — seção 17
router.post('/:id/automation/pause', async (req, res) => {
  await prisma.automationSequence.updateMany({
    where: { clientId: req.params.id, status: 'ATIVA' },
    data: { status: 'PAUSADA', pausedByUserId: req.user.sub },
  });
  await prisma.automationLog.create({
    data: { clientId: req.params.id, action: 'AUTOMATION_PAUSED', userId: req.user.sub },
  });
  res.json({ ok: true });
});

router.post('/:id/automation/resume', async (req, res) => {
  await prisma.automationSequence.updateMany({
    where: { clientId: req.params.id, status: 'PAUSADA' },
    data: { status: 'ATIVA', pausedByUserId: null },
  });
  await prisma.automationLog.create({
    data: { clientId: req.params.id, action: 'AUTOMATION_RESUMED', userId: req.user.sub },
  });
  res.json({ ok: true });
});

router.post('/:id/automation/cancel', async (req, res) => {
  await prisma.$transaction([
    prisma.automationSequence.updateMany({
      where: { clientId: req.params.id, status: { in: ['ATIVA', 'PAUSADA'] } },
      data: { status: 'CANCELADA' },
    }),
    prisma.scheduledMessage.updateMany({
      where: { clientId: req.params.id, status: 'AGUARDANDO' },
      data: { status: 'CANCELADA' },
    }),
    prisma.automationLog.create({
      data: { clientId: req.params.id, action: 'AUTOMATION_CANCELLED', userId: req.user.sub },
    }),
  ]);
  res.json({ ok: true });
});

// Enviar mensagem manual — seção 17
router.post('/:id/messages/manual', async (req, res) => {
  const { body } = req.body;
  const whatsappClient = require('../services/whatsappClient');
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

  try {
    const result = await whatsappClient.sendMessage({ toPhone: client.phone, body });
    await prisma.whatsappMessage.create({
      data: {
        clientId: client.id,
        direction: 'OUTBOUND',
        body,
        providerMsgId: result.providerMessageId,
        status: 'ENVIADA',
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
