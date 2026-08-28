const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { AVAILABLE_VARIABLES, buildVariableContext, renderTemplate } = require('../services/messageRenderer');

router.use(requireAuth);

router.get('/variables', (_req, res) => res.json(AVAILABLE_VARIABLES));

router.get('/:stage/templates', async (req, res) => {
  const rule = await prisma.automationRule.findUnique({
    where: { stage: req.params.stage },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  res.json(rule?.templates || []);
});

router.post('/:stage/templates', requireRole('ADMINISTRADOR'), async (req, res) => {
  const { name, body, time, templateName, order } = req.body;
  const rule = await prisma.automationRule.upsert({
    where: { stage: req.params.stage },
    update: {},
    create: { stage: req.params.stage },
  });
  const template = await prisma.messageTemplate.create({
    data: { automationRuleId: rule.id, name, body, time, templateName, order: order ?? 1 },
  });
  res.status(201).json(template);
});

router.put('/templates/:id', requireRole('ADMINISTRADOR'), async (req, res) => {
  const { name, body, time, templateName } = req.body;
  const template = await prisma.messageTemplate.update({
    where: { id: req.params.id },
    data: { name, body, time, templateName },
  });
  res.json(template);
});

router.delete('/templates/:id', requireRole('ADMINISTRADOR'), async (req, res) => {
  await prisma.messageTemplate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Preview no estilo WhatsApp — seção 6. Usa um cliente de exemplo ou real.
router.post('/preview', async (req, res) => {
  const { body, clientId } = req.body;

  let context;
  if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { deals: { where: { active: true }, take: 1, include: { property: true, broker: true } } },
    });
    const settings = await prisma.generalSettings.findUnique({ where: { id: 'singleton' } });
    const deal = client?.deals[0];
    context = buildVariableContext({
      client,
      deal,
      property: deal?.property,
      broker: deal?.broker,
      company: settings,
    });
  } else {
    // Dados de exemplo, quando nenhum cliente é selecionado
    context = {
      nome: 'João Silva',
      primeiro_nome: 'João',
      imovel: 'Apartamento 302',
      cidade: 'São Paulo',
      bairro: 'Moema',
      corretor: 'Ana Souza',
      etapa: 'Lead',
    };
  }

  res.json({ rendered: renderTemplate(body || '', context) });
});

module.exports = router;
