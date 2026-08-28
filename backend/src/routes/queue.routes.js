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
router.post('/:id/cancel', async (req, res) => {
  const message = await prisma.scheduledMessage.findUnique({ where: { id: req.params.id } });
  if (!message) return res.status(404).json({ error: 'Não encontrada.' });
  if (message.status !== 'AGUARDANDO') {
    return res.status(400).json({ error: 'Só é possível cancelar mensagens aguardando envio.' });
  }
  await prisma.scheduledMessage.update({ where: { id: req.params.id }, data: { status: 'CANCELADA' } });
  await prisma.automationLog.create({
    data: { clientId: message.clientId, action: 'MESSAGE_CANCELLED', userId: req.user.sub },
  });
  res.json({ ok: true });
});

module.exports = router;
