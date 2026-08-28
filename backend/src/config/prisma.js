const { PrismaClient } = require('@prisma/client');

// Singleton do Prisma Client — evita esgotar conexões em dev com hot-reload
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
