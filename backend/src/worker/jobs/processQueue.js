const prisma = require('../../config/prisma');
const automationEngine = require('../../services/automationEngine');

/**
 * Processa a fila de mensagens (seção 11) que já venceram o horário
 * agendado, passando cada uma pelas 10 verificações do automationEngine.
 */
async function processQueue() {
  const dueMessages = await prisma.scheduledMessage.findMany({
    where: { status: 'AGUARDANDO', scheduledFor: { lte: new Date() } },
    take: 50, // processa em lotes para não sobrecarregar o provedor de WhatsApp
    orderBy: { scheduledFor: 'asc' },
  });

  const results = { sent: 0, skipped: 0, errors: 0 };
  for (const message of dueMessages) {
    const result = await automationEngine.processScheduledMessage(message);
    if (result.sent) results.sent += 1;
    else if (result.reason?.startsWith('Erro')) results.errors += 1;
    else results.skipped += 1;

    // Pequeno intervalo entre envios para respeitar limites de taxa do provedor
    await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

module.exports = processQueue;
