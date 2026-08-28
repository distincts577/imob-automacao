const prisma = require('../../config/prisma');
const automationEngine = require('../../services/automationEngine');

/**
 * Cria AutomationSequence + ScheduledMessage para clientes elegíveis, de
 * acordo com a configuração de cada uma das 5 automações (seção 3).
 * As verificações finais (10 checks) só acontecem no envio — aqui apenas
 * agendamos, sem duplicar (seção 21: uma sequência ativa por cliente/etapa).
 */

function parseTimeToday(time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function scheduleLeadAutomation() {
  const rule = await prisma.automationRule.findUnique({
    where: { stage: 'LEAD' },
    include: { steps: { orderBy: { order: 'asc' }, include: { template: true } } },
  });
  if (!rule || !rule.active || rule.steps.length === 0) return { scheduled: 0 };

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

    for (const step of rule.steps) {
      if (!step.template) continue;
      const scheduledFor = parseTimeToday(step.time);
      if (scheduledFor < new Date()) scheduledFor.setDate(scheduledFor.getDate() + 1);

      const context = automationEngine.buildVariableContext({ client });
      await prisma.scheduledMessage.create({
        data: {
          clientId: client.id,
          automationSequenceId: sequence.id,
          templateId: step.template.id,
          renderedBody: automationEngine.renderTemplate(step.template.body, context),
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
async function scheduleRecurringAutomation(stage) {
  const rule = await prisma.automationRule.findUnique({
    where: { stage },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!rule || !rule.active || rule.templates.length === 0 || !rule.dailyTime) {
    return { scheduled: 0 };
  }

  const daysThreshold = rule.frequencyDays ?? 1;
  const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

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
    const alreadyQueued = await prisma.scheduledMessage.findFirst({
      where: {
        clientId: client.id,
        automationSequenceId: sequence.id,
        status: 'AGUARDANDO',
        scheduledFor: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    if (alreadyQueued) continue;

    const template = rule.templates[sequence.currentStep % rule.templates.length];
    const scheduledFor = parseTimeToday(rule.dailyTime);
    if (scheduledFor < new Date()) scheduledFor.setDate(scheduledFor.getDate() + 1);

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
async function scheduleClosingAutomation() {
  const rule = await prisma.automationRule.findUnique({
    where: { stage: 'FECHAMENTO' },
    include: { templates: { orderBy: { order: 'asc' } } },
  });
  if (!rule || !rule.active || rule.templates.length === 0 || !rule.weeklyDayOfWeek || !rule.weeklyTime) {
    return { scheduled: 0 };
  }

  const isoDayToday = ((new Date().getDay() + 6) % 7) + 1;
  if (isoDayToday !== rule.weeklyDayOfWeek) return { scheduled: 0 };

  return scheduleRecurringAutomationCore('FECHAMENTO', rule);
}

async function scheduleRecurringAutomationCore(stage, rule) {
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
    const scheduledFor = parseTimeToday(rule.weeklyTime);
    if (scheduledFor < new Date()) scheduledFor.setDate(scheduledFor.getDate() + 7);

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

  const results = {};
  results.lead = await scheduleLeadAutomation();
  results.atendimento = await scheduleRecurringAutomation('ATENDIMENTO');
  results.visita = await scheduleRecurringAutomation('VISITA_APROVACAO');
  results.aprovado = await scheduleRecurringAutomation('CLIENTE_APROVADO');
  results.fechamento = await scheduleClosingAutomation();
  return results;
}

module.exports = { runScheduler };
