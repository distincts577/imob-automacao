const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const settings = await prisma.generalSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  res.json(settings);
});

router.put('/', requireRole('ADMINISTRADOR'), async (req, res) => {
  const {
    companyName,
    logoUrl,
    timezone,
    businessHoursStart,
    businessHoursEnd,
    maxMessagesPerDay,
    messageSignature,
    automationsEnabled,
  } = req.body;

  const settings = await prisma.generalSettings.upsert({
    where: { id: 'singleton' },
    update: {
      companyName,
      logoUrl,
      timezone,
      businessHoursStart,
      businessHoursEnd,
      maxMessagesPerDay,
      messageSignature,
      automationsEnabled,
    },
    create: { id: 'singleton', companyName, logoUrl, timezone },
  });

  res.json(settings);
});

module.exports = router;
