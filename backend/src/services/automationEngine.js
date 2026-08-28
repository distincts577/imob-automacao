const prisma = require('../config/prisma');
const whatsappClient = require('./whatsappClient');
const { buildVariableContext, renderTemplate } = require('./messageRenderer');
const { getZonedParts, startOfZonedDay, DEFAULT_TIMEZONE } = require('./timezone');

/**
 * Motor de automação — implementa as verificações de segurança da seção 16
 * antes de qualquer envio, e os mecanismos anti-duplicidade da seção 21.
 *
 * Este arquivo é chamado pelo worker (cron), nunca pelo navegador do
 * usuário — as automações continuam rodando com o painel fechado.
 */

// CORRIGIDO: usava now.getHours()/now.getDay() (hora do processo Node,
// UTC no Render) em vez do fuso configurado em Configurações > Geral.
function isWithinQuietHours(now, quietStart, quietEnd, timeZone = DEFAULT_TIMEZONE) {
  const [qsH, qsM] = quietStart.split(':').map(Number);
  const [qeH, qeM] = quietEnd.split(':').map(Number);
  const zoned = getZonedParts(now, timeZone);
  const nowMin = zoned.hour * 60 + zoned.minute;
  const startMin = qsH * 60 + qsM;
  const endMin = qeH * 60 + qeM;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // intervalo cruza a meia-noite, ex. 22:00 -> 08:00
  return nowMin >= startMin || nowMin < endMin;
}

function isAllowedDay(now, allowedDaysOfWeek, timeZone = DEFAULT_TIMEZONE) {
  const isoDay = getZonedParts(now, timeZone).isoWeekday;
  return allowedDaysOfWeek.includes(isoDay);
}

/**
 * As 10 verificações da seção 16, na ordem do escopo. Retorna
 * { allowed: boolean, reason?: string } — nunca lança exceção para o
 * fluxo normal, para que o worker possa registrar o motivo no log.
 */
async function verifyBeforeSend(scheduledMessage) {
  const client = await prisma.client.findUnique({
    where: { id: scheduledMessage.clientId },
    include: { deals: true },
  });

  // 1. O cliente ainda existe?
  if (!client) return { allowed: false, reason: 'Cliente não encontrado.' };

  // 2. O telefone é válido?
  if (!client.phone || client.phone.replace(/\D/g, '').length < 10) {
    return { allowed: false, reason: 'Telefone inválido ou ausente.' };
  }
  if (client.optedOut) {
    return { allowed: false, reason: 'Cliente optou por não receber mensagens.' };
  }

  // 3. O cliente já respondeu (desde que a mensagem foi agendada)?
  if (client.lastReplyAt && client.lastReplyAt > scheduledMessage.createdAt) {
    return { allowed: false, reason: 'Cliente já respondeu — sequência interrompida.' };
  }

  const sequence = scheduledMessage.automationSequenceId
    ? await prisma.automationSequence.findUnique({
        where: { id: scheduledMessage.automationSequenceId },
      })
    : null;

  // 4. A etapa ainda é a mesma que originou esta automação?
  if (sequence && sequence.stage !== client.currentStage) {
    return { allowed: false, reason: 'Etapa do cliente mudou — automação encerrada.' };
  }

  // 5. O negócio ainda está ativo?
  // CORRIGIDO: a query antiga já filtrava `deals: { where: { active: true } }`,
  // então "nenhum negócio ativo encontrado" e "cliente nunca teve negócio
  // aberto no Vista" chegavam como o mesmo array vazio — e as DUAS situações
  // cancelavam a mensagem com "Negócio não está mais ativo". Só que um lead
  // recém-chegado (etapa LEAD) normalmente AINDA NÃO TEM negócio no Vista
  // (o Deal só é criado quando o registro sincronizado traz vistaDealId —
  // ver syncVista.js) — isso é o estado normal do começo do funil, não um
  // negócio encerrado. Na prática TODA mensagem de LEAD sem negócio ainda
  // aberto era cancelada bem na hora de enviar.
  // Agora só cancela quando o cliente TEM pelo menos um negócio registrado
  // e nenhum deles está ativo (ou seja, foi realmente fechado/perdido).
  // Se o cliente simplesmente ainda não tem negócio, a automação segue.
  const hasAnyDeal = client.deals.length > 0;
  const hasActiveDeal = client.deals.some((d) => d.active);
  if (sequence && hasAnyDeal && !hasActiveDeal) {
    return { allowed: false, reason: 'Negócio não está mais ativo.' };
  }

  // 6. Já foi enviada uma mensagem semelhante (mesmo template) recentemente?
  const duplicate = await prisma.whatsappMessage.findFirst({
    where: {
      clientId: client.id,
      direction: 'OUTBOUND',
      body: scheduledMessage.renderedBody,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (duplicate) return { allowed: false, reason: 'Mensagem duplicada detectada.' };

  // 7. Dentro do horário/dia permitido?
  const rule = sequence
    ? await prisma.automationRule.findUnique({ where: { stage: sequence.stage } })
    : null;
  const now = new Date();
  if (rule) {
    const settings = await prisma.generalSettings.findUnique({ where: { id: 'singleton' } });
    const timeZone = settings?.timezone || DEFAULT_TIMEZONE;

    if (isWithinQuietHours(now, rule.quietHoursStart, rule.quietHoursEnd, timeZone)) {
      return { allowed: false, reason: 'Fora do horário permitido para envio.' };
    }
    if (!isAllowedDay(now, rule.allowedDaysOfWeek, timeZone)) {
      return { allowed: false, reason: 'Dia da semana não permitido.' };
    }

    // 8. A automação está ativa (globalmente e para a etapa)?
    if (!rule.active) return { allowed: false, reason: 'Automação da etapa está desativada.' };

    if (settings && !settings.automationsEnabled) {
      return { allowed: false, reason: 'Automações desativadas globalmente.' };
    }

    // 9b. Limite máximo de mensagens por dia, configurado em Configurações > Geral.
    if (settings?.maxMessagesPerDay) {
      const startOfDay = startOfZonedDay(timeZone);
      const sentToday = await prisma.scheduledMessage.count({
        where: { status: 'ENVIADA', sentAt: { gte: startOfDay } },
      });
      if (sentToday >= settings.maxMessagesPerDay) {
        return { allowed: false, reason: 'Limite máximo de mensagens por dia atingido.' };
      }
    }

    // 9. Existe algum bloqueio manual (sequência pausada/cancelada)?
    if (sequence && sequence.status !== 'ATIVA') {
      return { allowed: false, reason: `Automação está ${sequence.status}.` };
    }

    // 10. Dentro do limite configurado de mensagens?
    if (sequence && sequence.messagesSentCount >= rule.maxMessagesPerClient) {
      return { allowed: false, reason: 'Limite máximo de mensagens atingido.' };
    }
    if (
      rule.minIntervalMinutes &&
      client.lastMessageSentAt &&
      now.getTime() - client.lastMessageSentAt.getTime() < rule.minIntervalMinutes * 60000
    ) {
      return { allowed: false, reason: 'Intervalo mínimo entre mensagens não respeitado.' };
    }
  }

  return { allowed: true, client, sequence };
}

/**
 * Processa uma ScheduledMessage: roda as 10 verificações, envia (ou não),
 * registra log e atualiza estado — usado pelo worker (seção 20).
 */
async function processScheduledMessage(scheduledMessage) {
  const check = await verifyBeforeSend(scheduledMessage);

  if (!check.allowed) {
    await prisma.$transaction([
      prisma.scheduledMessage.update({
        where: { id: scheduledMessage.id },
        data: { status: 'CANCELADA', lastError: check.reason },
      }),
      prisma.automationLog.create({
        data: {
          clientId: scheduledMessage.clientId,
          action: 'MESSAGE_SKIPPED',
          details: { reason: check.reason, scheduledMessageId: scheduledMessage.id },
        },
      }),
    ]);
    return { sent: false, reason: check.reason };
  }

  await prisma.scheduledMessage.update({
    where: { id: scheduledMessage.id },
    data: { status: 'PROCESSANDO' },
  });

  try {
    const result = await whatsappClient.sendMessage({
      toPhone: check.client.phone,
      body: scheduledMessage.renderedBody,
    });

    await prisma.$transaction([
      prisma.scheduledMessage.update({
        where: { id: scheduledMessage.id },
        data: { status: 'ENVIADA', sentAt: new Date() },
      }),
      prisma.whatsappMessage.create({
        data: {
          clientId: check.client.id,
          direction: 'OUTBOUND',
          body: scheduledMessage.renderedBody,
          providerMsgId: result.providerMessageId,
          status: 'ENVIADA',
        },
      }),
      prisma.client.update({
        where: { id: check.client.id },
        data: { lastMessageSentAt: new Date() },
      }),
      ...(check.sequence
        ? [
            prisma.automationSequence.update({
              where: { id: check.sequence.id },
              data: {
                messagesSentCount: { increment: 1 },
                currentStep: { increment: 1 },
              },
            }),
          ]
        : []),
      prisma.automationLog.create({
        data: {
          clientId: check.client.id,
          action: 'MESSAGE_SENT',
          details: { scheduledMessageId: scheduledMessage.id },
        },
      }),
    ]);

    return { sent: true };
  } catch (err) {
    await prisma.$transaction([
      prisma.scheduledMessage.update({
        where: { id: scheduledMessage.id },
        data: {
          status: 'ERRO',
          attempts: { increment: 1 },
          lastError: err.message,
        },
      }),
      prisma.automationLog.create({
        data: {
          clientId: scheduledMessage.clientId,
          action: 'MESSAGE_ERROR',
          details: { error: err.message, scheduledMessageId: scheduledMessage.id },
        },
      }),
    ]);
    return { sent: false, reason: err.message };
  }
}

/**
 * Chamado quando o webhook do WhatsApp recebe uma resposta do cliente.
 * Interrompe automaticamente qualquer sequência ativa (seção 8, 21).
 */
async function handleClientReply({ fromPhone, body, providerMessageId }) {
  const client = await prisma.client.findFirst({ where: { phone: fromPhone } });
  if (!client) return null;

  await prisma.$transaction([
    prisma.whatsappMessage.create({
      data: {
        clientId: client.id,
        direction: 'INBOUND',
        body,
        providerMsgId: providerMessageId,
        status: 'ENVIADA',
      },
    }),
    prisma.client.update({
      where: { id: client.id },
      data: { lastReplyAt: new Date(), lastInteractionAt: new Date() },
    }),
    prisma.automationSequence.updateMany({
      where: { clientId: client.id, status: 'ATIVA' },
      data: { status: 'CLIENTE_RESPONDEU' },
    }),
    // Cancela mensagens ainda não enviadas para este cliente
    prisma.scheduledMessage.updateMany({
      where: { clientId: client.id, status: 'AGUARDANDO' },
      data: { status: 'CLIENTE_RESPONDEU' },
    }),
    prisma.automationLog.create({
      data: {
        clientId: client.id,
        action: 'CLIENT_REPLIED',
        details: { body },
      },
    }),
  ]);

  return client;
}

/** Interrompe a sequência de um cliente quando a etapa muda no Vista. */
async function handleStageChange(clientId, fromStage, toStage) {
  await prisma.$transaction([
    prisma.client.update({ where: { id: clientId }, data: { currentStage: toStage } }),
    prisma.stageHistory.create({
      data: { clientId, fromStage, toStage, source: 'vista_sync' },
    }),
    prisma.automationSequence.updateMany({
      where: { clientId, status: 'ATIVA', stage: fromStage },
      data: { status: 'CONCLUIDA' },
    }),
    prisma.scheduledMessage.updateMany({
      where: { clientId, status: 'AGUARDANDO' },
      data: { status: 'CANCELADA' },
    }),
    prisma.automationLog.create({
      data: {
        clientId,
        action: 'STAGE_CHANGED',
        details: { fromStage, toStage },
      },
    }),
  ]);
}

module.exports = {
  verifyBeforeSend,
  processScheduledMessage,
  handleClientReply,
  handleStageChange,
  isWithinQuietHours,
  isAllowedDay,
};

// Reexporta o renderizador para os controllers de mensagens/preview.
module.exports.buildVariableContext = buildVariableContext;
module.exports.renderTemplate = renderTemplate;
