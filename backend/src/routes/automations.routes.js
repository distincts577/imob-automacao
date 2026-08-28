const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// Lista as 5 automações e suas configs — seção 3
router.get('/', async (_req, res) => {
  const rules = await prisma.automationRule.findMany({
    include: { steps: { orderBy: { order: 'asc' }, include: { template: true } }, templates: true },
    orderBy: { stage: 'asc' },
  });
  res.json(rules);
});

router.get('/:stage', async (req, res) => {
  const rule = await prisma.automationRule.findUnique({
    where: { stage: req.params.stage },
    include: { steps: { orderBy: { order: 'asc' }, include: { template: true } }, templates: true },
  });
  if (!rule) return res.status(404).json({ error: 'Automação não encontrada.' });
  res.json(rule);
});

// Atualiza configuração de uma automação — apenas ADMINISTRADOR
router.put('/:stage', requireAuth, requireRole('ADMINISTRADOR'), async (req, res) => {
  const {
    active,
    maxMessagesPerClient,
    minIntervalMinutes,
    minMinutesSinceReply,
    minMinutesSinceContact,
    stopOnReply,
    stopOnStageChange,
    stopOnDealClosed,
    allowedDaysOfWeek,
    quietHoursStart,
    quietHoursEnd,
    frequencyDays,
    dailyTime,
    weeklyDayOfWeek,
    weeklyTime,
  } = req.body;

  const rule = await prisma.automationRule.upsert({
    where: { stage: req.params.stage },
    update: {
      active,
      maxMessagesPerClient,
      minIntervalMinutes,
      minMinutesSinceReply,
      minMinutesSinceContact,
      stopOnReply,
      stopOnStageChange,
      stopOnDealClosed,
      allowedDaysOfWeek,
      quietHoursStart,
      quietHoursEnd,
      frequencyDays,
      dailyTime,
      weeklyDayOfWeek,
      weeklyTime,
    },
    create: {
      stage: req.params.stage,
      active: !!active,
      maxMessagesPerClient,
      minIntervalMinutes,
      allowedDaysOfWeek: allowedDaysOfWeek || [1, 2, 3, 4, 5, 6, 7],
      quietHoursStart: quietHoursStart || '22:00',
      quietHoursEnd: quietHoursEnd || '08:00',
      frequencyDays,
      dailyTime,
      weeklyDayOfWeek,
      weeklyTime,
    },
  });

  await prisma.automationLog.create({
    data: {
      action: 'AUTOMATION_RULE_UPDATED',
      userId: req.user.sub,
      details: { stage: req.params.stage },
    },
  });

  res.json(rule);
});

// Modo de teste / simulação — seção 18
router.post('/:stage/simulate', requireAuth, async (req, res) => {
  const { clientId } = req.body;
  const automationEngine = require('../services/automationEngine');
  const { buildVariableContext, renderTemplate } = automationEngine;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { deals: { where: { active: true }, take: 1, include: { property: true, broker: true } } },
  });
  const rule = await prisma.automationRule.findUnique({
    where: { stage: req.params.stage },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!client || !rule) return res.status(404).json({ error: 'Cliente ou automação não encontrada.' });

  const deal = client.deals[0];
  const settings = await prisma.generalSettings.findUnique({ where: { id: 'singleton' } });
  const context = buildVariableContext({
    client,
    deal,
    property: deal?.property,
    broker: deal?.broker,
    company: settings,
  });

  const preview = rule.templates.map((t) => ({
    templateName: t.name,
    time: t.time,
    rendered: renderTemplate(t.body, context),
  }));

  res.json({ wouldSend: preview, note: 'Simulação — nenhuma mensagem foi enviada.' });
});

router.post('/:stage/test-send', requireAuth, requireRole('ADMINISTRADOR'), async (req, res) => {
  const { clientId, templateId } = req.body;
  const whatsappClient = require('../services/whatsappClient');
  const automationEngine = require('../services/automationEngine');

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { deals: { where: { active: true }, take: 1, include: { property: true, broker: true } } },
  });
  const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
  if (!client || !template) return res.status(404).json({ error: 'Não encontrado.' });

  const settings = await prisma.generalSettings.findUnique({ where: { id: 'singleton' } });
  const deal = client.deals[0];
  const context = automationEngine.buildVariableContext({
    client,
    deal,
    property: deal?.property,
    broker: deal?.broker,
    company: settings,
  });
  const rendered = automationEngine.renderTemplate(template.body, context);

  try {
    await whatsappClient.sendMessage({ toPhone: client.phone, body: rendered });
    res.json({ ok: true, rendered });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Roda o agendamento na hora, sem esperar o próximo ciclo do cron (até
// 15 min) — útil depois de ativar/reconfigurar uma automação e querer
// ver o efeito imediatamente na fila. Reaproveita a mesma lógica do
// worker (worker/scheduler.js), então respeita as mesmas regras de
// elegibilidade — não força nada fora do que a automação permitiria.
router.post('/run-now', requireAuth, requireRole('ADMINISTRADOR'), async (_req, res) => {
  const { runScheduler } = require('../worker/scheduler');
  try {
    const results = await runScheduler();
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
