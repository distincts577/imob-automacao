const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalLeads,
    awaitingFirstContact,
    inAtendimento,
    awaitingVisita,
    inAprovacao,
    aprovados,
    fechamento,
    sentToday,
    pending,
    withError,
    repliedClients,
    activeAutomations,
  ] = await Promise.all([
    prisma.client.count({ where: { currentStage: 'LEAD' } }),
    prisma.client.count({ where: { currentStage: 'LEAD', lastInteractionAt: null } }),
    prisma.client.count({ where: { currentStage: 'ATENDIMENTO' } }),
    // Etapa "Visita / Aprovação" cobre dois momentos do funil no mesmo
    // FunnelStage: aguardando a visita (negócio ativo ainda sem visitDate)
    // e já visitado, aguardando aprovação (visitDate preenchido, ainda sem
    // approvedAt). Distinguimos pelos campos do Deal ativo do cliente.
    prisma.client.count({
      where: {
        currentStage: 'VISITA_APROVACAO',
        deals: { some: { active: true, visitDate: null } },
      },
    }),
    prisma.client.count({
      where: {
        currentStage: 'VISITA_APROVACAO',
        deals: { some: { active: true, visitDate: { not: null }, approvedAt: null } },
      },
    }),
    prisma.client.count({ where: { currentStage: 'CLIENTE_APROVADO' } }),
    prisma.client.count({ where: { currentStage: 'FECHAMENTO' } }),
    prisma.scheduledMessage.count({ where: { status: 'ENVIADA', sentAt: { gte: startOfDay } } }),
    prisma.scheduledMessage.count({ where: { status: 'AGUARDANDO' } }),
    prisma.scheduledMessage.count({ where: { status: 'ERRO' } }),
    prisma.client.count({ where: { lastReplyAt: { not: null } } }),
    prisma.automationRule.count({ where: { active: true } }),
  ]);

  res.json({
    totalLeads,
    awaitingFirstContact,
    inAtendimento,
    awaitingVisita,
    inAprovacao,
    aprovados,
    fechamento,
    sentToday,
    pending,
    withError,
    repliedClients,
    activeAutomations,
  });
});

router.get('/charts', async (_req, res) => {
  // Séries dos últimos 14 dias — leads criados, mensagens enviadas, respostas
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const [leads, sent, replies] = await Promise.all([
    prisma.client.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.scheduledMessage.findMany({
      where: { status: 'ENVIADA', sentAt: { gte: since } },
      select: { sentAt: true },
    }),
    prisma.whatsappMessage.findMany({
      where: { direction: 'INBOUND', createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const byDay = (rows, field) => {
    const map = {};
    rows.forEach((r) => {
      const day = r[field].toISOString().slice(0, 10);
      map[day] = (map[day] || 0) + 1;
    });
    return map;
  };

  const stageCounts = await prisma.client.groupBy({ by: ['currentStage'], _count: true });

  // Conversão por etapa: para cada etapa do funil, quantos clientes já
  // passaram por ela (currentStage atual OU alguma vez registrada no
  // histórico) versus quantos avançaram para a etapa seguinte.
  const FUNNEL_ORDER = ['LEAD', 'ATENDIMENTO', 'VISITA_APROVACAO', 'CLIENTE_APROVADO', 'FECHAMENTO'];
  const reachedCounts = await Promise.all(
    FUNNEL_ORDER.map((stage) =>
      prisma.client.count({
        where: {
          OR: [{ currentStage: stage }, { stageHistory: { some: { toStage: stage } } }],
        },
      })
    )
  );
  const conversionByStage = FUNNEL_ORDER.map((stage, i) => {
    const reached = reachedCounts[i];
    const base = reachedCounts[0] || 1; // taxa relativa ao total de leads
    return { stage, reached, rate: Math.round((reached / base) * 100) };
  });

  res.json({
    leadsByDay: byDay(leads, 'createdAt'),
    messagesByDay: byDay(sent, 'sentAt'),
    repliesByDay: byDay(replies, 'createdAt'),
    stageDistribution: stageCounts.map((s) => ({ stage: s.currentStage, count: s._count })),
    conversionByStage,
  });
});

router.get('/recent-activity', async (_req, res) => {
  const logs = await prisma.automationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { name: true } } },
  });
  res.json(logs);
});

module.exports = router;
