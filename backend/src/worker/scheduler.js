const prisma = require('../config/prisma');
const automationEngine = require('../services/automationEngine');
const { zonedTimeToday, startOfZonedDay, DEFAULT_TIMEZONE, getZonedParts } = require('../services/timezone');

/**
 * Cria AutomationSequence + ScheduledMessage para clientes elegíveis, de
 * acordo com a configuração de cada uma das 5 automações (seção 3).
 * As verificações finais (10 checks) só acontecem no envio — aqui apenas
 * agendamos, sem duplicar (seção 21: uma sequência ativa por cliente/etapa).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// CORRIGIDO: usava `new Date(); d.setHours(h, m, 0, 0);`, que interpreta
// h:m no fuso horário do PROCESSO Node (UTC no Render), não no fuso da
// imobiliária configurado em Configurações > Geral. Um template pra
// "09:00" acabava agendado 3h adiantado (ou atrasado, dependendo do TZ do
// host) do horário mostrado na tela de Mensagens.
function parseTimeToday(time, timeZone) {
  const [h, m] = time.split(':').map(Number);
  return zonedTimeToday(h, m, timeZone);
}

async function scheduleLeadAutomation(timeZone) {
  // CORRIGIDO: a etapa LEAD usava rule.steps (AutomationRuleStep), mas
  // nada no app (nem rota, nem tela) jamais cria esse registro — só
  // MessageTemplate (rule.templates) é gerenciável pelo painel
  // (Automations.jsx -> /messages/:stage/templates). Por isso a
  // automação de LEAD nunca agendava nada. Agora usa rule.templates,
  // igual às demais automações (ATENDIMENTO, VISITA_APROVACAO etc.).
  const rule = await prisma.automationRule.findUnique({
    where: { stage: 'LEAD' },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!rule || !rule.active || rule.templates.length === 0) return { scheduled: 0 };

  const clients = await prisma.client.findMany({
    where: {
      currentStage: 'LEAD',
      lastReplyAt: null,
      optedOut: false,
      automationSequences: { none: { stage: 'LEAD', status: { in: ['ATIVA', 'PAUSADA'] } } },
    },
  });

  let scheduled = 0;
  for (const client of clients) {
    const sequence = await prisma.automationSequence.create({
      data: { clientId: client.id, stage: 'LEAD', status: 'ATIVA' },
    });

    for (const template of rule.templates) {
      if (!template.time) continue; // template sem horário definido não é usado na sequência automática
      const scheduledFor = parseTimeToday(template.time, timeZone);
      if (scheduledFor < new Date()) scheduledFor.setTime(scheduledFor.getTime() + DAY_MS);

      const context = automationEngine.buildVariableContext({ client });
      await prisma.scheduledMessage.create({
        data: {
          clientId: client.id,
          automationSequenceId: sequence.id,
          templateId: template.id,
          renderedBody: automationEngine.renderTemplate(template.body, context),
          scheduledFor,
          status: 'AGUARDANDO',
        },
      });
    }
    scheduled += 1;
  }
  return { scheduled };
}

/** Usado por ATENDIMENTO / VISITA_APROVACAO / CLIENTE_APROVADO (frequência em dias). */
async function scheduleRecurringAutomation(stage, timeZone) {
  const rule = await prisma.automationRule.findUnique({
    where: { stage },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!rule || !rule.active || rule.templates.length === 0 || !rule.dailyTime) {
    return { scheduled: 0 };
  }

  const daysThreshold = rule.frequencyDays ?? 1;
  const thresholdDate = new Date(Date.now() - daysThreshold * DAY_MS);

  const clients = await prisma.client.findMany({
    where: {
      currentStage: stage,
      optedOut: false,
      OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lte: thresholdDate } }],
    },
  });

  let scheduled = 0;
  for (const client of clients) {
    let sequence = await prisma.automationSequence.findFirst({
      where: { clientId: client.id, stage, status: 'ATIVA' },
    });
    if (!sequence) {
      sequence = await prisma.automationSequence.create({
        data: { clientId: client.id, stage, status: 'ATIVA' },
      });
    }

    // Evita duplicidade: não agenda se já existe mensagem aguardando para hoje
    // (hoje = hoje no fuso da imobiliária, não no fuso do servidor).
    const alreadyQueued = await prisma.scheduledMessage.findFirst({
      where: {
        clientId: client.id,
        automationSequenceId: sequence.id,
        status: 'AGUARDANDO',
        scheduledFor: { gte: startOfZonedDay(timeZone) },
      },
    });
    if (alreadyQueued) continue;

    const template = rule.templates[sequence.currentStep % rule.templates.length];
    const scheduledFor = parseTimeToday(rule.dailyTime, timeZone);
    if (scheduledFor < new Date()) scheduledFor.setTime(scheduledFor.getTime() + DAY_MS);

    const context = automationEngine.buildVariableContext({ client });
    await prisma.scheduledMessage.create({
      data: {
        clientId: client.id,
        automationSequenceId: sequence.id,
        templateId: template.id,
        renderedBody: automationEngine.renderTemplate(template.body, context),
        scheduledFor,
        status: 'AGUARDANDO',
      },
    });
    scheduled += 1;
  }
  return { scheduled };
}

/** FECHAMENTO — semanal, dia/horário configuráveis. */
async function scheduleClosingAutomation(timeZone) {
  const rule = await prisma.automationRule.findUnique({
    where: { stage: 'FECHAMENTO' },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!rule || !rule.active || rule.templates.length === 0 || !rule.weeklyDayOfWeek || !rule.weeklyTime) {
    return { scheduled: 0 };
  }

  // CORRIGIDO: usava new Date().getDay() (dia da semana no fuso do
  // servidor) — perto da meia-noite isso podia acusar o dia errado.
  const isoDayToday = getZonedParts(new Date(), timeZone).isoWeekday;
  if (isoDayToday !== rule.weeklyDayOfWeek) return { scheduled: 0 };

  return scheduleRecurringAutomationCore('FECHAMENTO', rule, timeZone);
}

async function scheduleRecurringAutomationCore(stage, rule, timeZone) {
  const clients = await prisma.client.findMany({ where: { currentStage: stage, optedOut: false } });
  let scheduled = 0;
  for (const client of clients) {
    let sequence = await prisma.automationSequence.findFirst({
      where: { clientId: client.id, stage, status: 'ATIVA' },
    });
    if (!sequence) {
      sequence = await prisma.automationSequence.create({
        data: { clientId: client.id, stage, status: 'ATIVA' },
      });
    }
    const template = rule.templates[0];
    const scheduledFor = parseTimeToday(rule.weeklyTime, timeZone);
    if (scheduledFor < new Date()) scheduledFor.setTime(scheduledFor.getTime() + 7 * DAY_MS);

    const context = automationEngine.buildVariableContext({ client });
    await prisma.scheduledMessage.create({
      data: {
        clientId: client.id,
        automationSequenceId: sequence.id,
        templateId: template.id,
        renderedBody: automationEngine.renderTemplate(template.body, context),
        scheduledFor,
        status: 'AGUARDANDO',
      },
    });
    scheduled += 1;
  }
  return { scheduled };
}

async function runScheduler() {
  const settings = await prisma.generalSettings.findUnique({ where: { id: 'singleton' } });
  if (settings && !settings.automationsEnabled) return { skipped: true };

  const timeZone = settings?.timezone || DEFAULT_TIMEZONE;

  const results = {};
  results.lead = await scheduleLeadAutomation(timeZone);
  results.atendimento = await scheduleRecurringAutomation('ATENDIMENTO', timeZone);
  results.visita = await scheduleRecurringAutomation('VISITA_APROVACAO', timeZone);
  results.aprovado = await scheduleRecurringAutomation('CLIENTE_APROVADO', timeZone);
  results.fechamento = await scheduleClosingAutomation(timeZone);
  return results;
}

module.exports = { runScheduler };
