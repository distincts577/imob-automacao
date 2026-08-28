const prisma = require('../../config/prisma');
const vistaClient = require('../../services/vistaClient');
const automationEngine = require('../../services/automationEngine');

/**
 * Sincroniza leads/clientes/negócios do Vista CRM (seção 9).
 * Roda periodicamente pelo worker — não depende do painel estar aberto.
 * Detecta mudança de etapa e aciona handleStageChange (que interrompe
 * automações da etapa anterior — seção 21).
 */
async function syncVista() {
  const integration = await prisma.integration.findUnique({ where: { provider: 'vista' } });
  if (!integration || !integration.connected) {
    return { skipped: true, reason: 'Integração com Vista não conectada.' };
  }

  const lastSync = integration.lastCheckedAt;
  let records;
  try {
    records = await vistaClient.fetchUpdatedRecords(lastSync);
  } catch (err) {
    await prisma.integration.update({
      where: { provider: 'vista' },
      data: { connected: false, lastError: err.message },
    });
    return { error: err.message };
  }

  let created = 0;
  let stageChanges = 0;

  for (const record of records) {
    if (!record.client?.vistaId || !record.client?.phone) continue;
    if (!record.stage) continue; // etapa não mapeada em vista.endpoints.js — pula com segurança

    const broker = record.broker?.vistaId
      ? await prisma.broker.upsert({
          where: { vistaId: record.broker.vistaId },
          update: { name: record.broker.name },
          create: { vistaId: record.broker.vistaId, name: record.broker.name },
        })
      : null;

    const property = record.property?.vistaId
      ? await prisma.property.upsert({
          where: { vistaId: record.property.vistaId },
          update: {
            title: record.property.title,
            code: record.property.code,
            address: record.property.address,
            neighborhood: record.property.neighborhood,
            city: record.property.city,
            price: record.property.price,
            link: record.property.link,
          },
          create: {
            vistaId: record.property.vistaId,
            title: record.property.title || 'Imóvel',
            code: record.property.code,
            address: record.property.address,
            neighborhood: record.property.neighborhood,
            city: record.property.city,
            price: record.property.price,
            link: record.property.link,
          },
        })
      : null;

    const existingClient = await prisma.client.findUnique({
      where: { vistaId: record.client.vistaId },
    });

    const client = await prisma.client.upsert({
      where: { vistaId: record.client.vistaId },
      update: {
        name: record.client.name || undefined,
        email: record.client.email || undefined,
        brokerId: broker?.id,
      },
      create: {
        vistaId: record.client.vistaId,
        name: record.client.name || 'Sem nome',
        phone: record.client.phone,
        email: record.client.email,
        brokerId: broker?.id,
        currentStage: record.stage,
      },
    });

    if (!existingClient) created += 1;

    if (existingClient && existingClient.currentStage !== record.stage) {
      await automationEngine.handleStageChange(client.id, existingClient.currentStage, record.stage);
      stageChanges += 1;
    }

    if (record.vistaDealId) {
      await prisma.deal.upsert({
        where: { vistaId: record.vistaDealId },
        update: {
          stage: record.stage,
          propertyId: property?.id,
          brokerId: broker?.id,
        },
        create: {
          vistaId: record.vistaDealId,
          clientId: client.id,
          propertyId: property?.id,
          brokerId: broker?.id,
          stage: record.stage,
        },
      });
    }
  }

  await prisma.integration.update({
    where: { provider: 'vista' },
    data: { lastCheckedAt: new Date(), lastError: null },
  });

  return { created, stageChanges, total: records.length };
}

module.exports = syncVista;
