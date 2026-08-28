const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { action, clientId, from, to } = req.query;
  const logs = await prisma.automationLog.findMany({
    where: {
      ...(action && { action }),
      ...(clientId && { clientId }),
      ...(from || to
        ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
        : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(logs);
});

module.exports = router;
