const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { status, clientId } = req.query;
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      ...(status && { status }),
      ...(clientId && { clientId }),
    },
    include: { client: true, automationSequence: true },
    orderBy: { scheduledFor: 'asc' },
    take: 300,
  });
  res.json(messages);
});

// Cancelar mensagem ainda não enviada — seção 11
//
// CORRIGIDO: cancelar uma mensagem da fila também precisa encerrar a
// AutomationSequence vinculada (e qualquer outra mensagem AGUARDANDO dela).
// Antes, só a mensagem em si virava CANCELADA — a sequência ficava presa em
// ATIVA/PAUSADA para sempre, e como o scheduler só cria uma nova sequência
// quando o cliente não tem nenhuma ATIVA/PAUSADA naquela etapa, o cliente
// nunca mais recebia mensagem daquela automação (mesmo cancelando e
// tentando mandar outra).
router.post('/:id/cancel', async (req, res) => {
  const message = await prisma.scheduledMessage.findUnique({ where: { id: req.params.id } });
  if (!message) return res.status(404).json({ error: 'Não encontrada.' });
  if (message.status !== 'AGUARDANDO') {
    return res.status(400).json({ error: 'Só é possível cancelar mensagens aguardando envio.' });
  }

  await prisma.$transaction([
    prisma.scheduledMessage.update({ where: { id: req.params.id }, data: { status: 'CANCELADA' } }),
    ...(message.automationSequenceId
      ? [
          prisma.automationSequence.updateMany({
            where: { id: message.automationSequenceId, status: { in: ['ATIVA', 'PAUSADA'] } },
            data: { status: 'CANCELADA', pausedByUserId: null },
          }),
          prisma.scheduledMessage.updateMany({
            where: {
              automationSequenceId: message.automationSequenceId,
              status: 'AGUARDANDO',
              id: { not: req.params.id },
            },
            data: { status: 'CANCELADA' },
          }),
        ]
      : []),
    prisma.automationLog.create({
      data: { clientId: message.clientId, action: 'MESSAGE_CANCELLED', userId: req.user.sub },
    }),
  ]);

  res.json({ ok: true });
});

module.exports = router;
