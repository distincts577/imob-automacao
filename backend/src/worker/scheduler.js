const cron = require('node-cron');
const syncVista = require('./jobs/syncVista');
const { runScheduler } = require('./jobs/scheduler');
const processQueue = require('./jobs/processQueue');
const prisma = require('../config/prisma');

/**
 * Tarefas de automação (seção 20): sincronização com o Vista, geração das
 * mensagens agendadas e processamento da fila de envio. Ficam num módulo
 * separado pra poderem rodar tanto dentro do processo da API (padrão,
 * gratuito) quanto num processo de worker dedicado (src/worker/index.js),
 * caso você opte por separar depois.
 */

let started = false;

async function safeRun(name, fn) {
  try {
    const result = await fn();
    console.log(`[jobs] ${name}:`, JSON.stringify(result));
  } catch (err) {
    console.error(`[jobs] erro em ${name}:`, err.message);
    await prisma.automationLog.create({
      data: { action: 'WORKER_ERROR', details: { job: name, error: err.message } },
    }).catch(() => {});
  }
}

function startSchedules() {
  if (started) return; // evita registrar os crons duas vezes (ex.: hot-reload em dev)
  started = true;

  // Sincroniza com o Vista a cada 5 minutos
  cron.schedule('*/5 * * * *', () => safeRun('syncVista', syncVista));

  // Gera as mensagens agendadas de cada automação a cada 10 minutos
  cron.schedule('*/10 * * * *', () => safeRun('scheduler', runScheduler));

  // Processa a fila (envia mensagens vencidas) a cada minuto
  cron.schedule('* * * * *', () => safeRun('processQueue', processQueue));

  console.log('[jobs] agendamentos iniciados — sync a cada 5min, agendamento a cada 10min, fila a cada 1min.');

  // Execução inicial imediata ao subir o processo (não espera o primeiro tick do cron)
  safeRun('syncVista', syncVista);
  safeRun('scheduler', runScheduler);
  safeRun('processQueue', processQueue);
}

module.exports = { startSchedules };
