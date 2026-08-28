const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('troque-esta-senha', 10);
  await prisma.user.upsert({
    where: { email: 'admin@imobiliaria.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@imobiliaria.com',
      passwordHash,
      role: 'ADMINISTRADOR',
    },
  });

  await prisma.generalSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', companyName: 'Minha Imobiliária' },
  });

  const stages = [
    { stage: 'LEAD', quietHoursStart: '22:00', quietHoursEnd: '08:00' },
    { stage: 'ATENDIMENTO', frequencyDays: 2, dailyTime: '10:00' },
    { stage: 'VISITA_APROVACAO', frequencyDays: 1, dailyTime: '10:00' },
    { stage: 'CLIENTE_APROVADO', frequencyDays: 1, dailyTime: '10:00' },
    { stage: 'FECHAMENTO', weeklyDayOfWeek: 1, weeklyTime: '09:00' },
  ];

  for (const s of stages) {
    await prisma.automationRule.upsert({
      where: { stage: s.stage },
      update: {},
      create: { active: false, ...s },
    });
  }

  console.log('Seed concluído. Login inicial: admin@imobiliaria.com / troque-esta-senha');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
