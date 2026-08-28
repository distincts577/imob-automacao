require('dotenv').config();
const cron = require('node-cron');
const syncVista = require('./jobs/syncVista');
const { runScheduler } = require('./jobs/scheduler');
const processQueue = require('./jobs/processQueue');
const prisma = require('../config/prisma');

/**
 * Processo de worker independente (seção 20). Roda em segundo plano,
 * separado do processo da API/frontend — as automações continuam
 * funcionando mesmo com o painel fechado ou o navegador do usuário sem
 * estar aberto. Em produção, execute com um process manager (pm2,
 * systemd, container dedicado) e mantenha rodando 24/7.
 */

async function safeRun(name, fn) {
  try {
    const result = await fn();
    console.log(`[worker] ${name}:`, JSON.stringify(result));
  } catch (err) {
    console.error(`[worker] erro em ${name}:`, err.message);
    await prisma.automationLog.create({
      data: { action: 'WORKER_ERROR', details: { job: name, error: err.message } },
    }).catch(() => {});
  }
}

// Sincroniza com o Vista a cada 5 minutos
cron.schedule('*/5 * * * *', () => safeRun('syncVista', syncVista));

// Gera as mensagens agendadas de cada automação a cada 10 minutos
cron.schedule('*/10 * * * *', () => safeRun('scheduler', runScheduler));

// Processa a fila (envia mensagens vencidas) a cada minuto
cron.schedule('* * * * *', () => safeRun('processQueue', processQueue));

console.log('[worker] iniciado — sync a cada 5min, agendamento a cada 10min, fila a cada 1min.');

// Execução inicial imediata ao subir o processo
safeRun('syncVista', syncVista);
safeRun('scheduler', runScheduler);
safeRun('processQueue', processQueue);
