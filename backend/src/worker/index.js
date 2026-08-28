require('dotenv').config();
const { startSchedules } = require('./schedules');

/**
 * Processo de worker independente (seção 20) — modo OPCIONAL.
 *
 * Por padrão este projeto roda os cron jobs dentro do próprio processo da
 * API (ver src/server.js + src/worker/schedules.js), pra não precisar de
 * um serviço "Background Worker" pago no Render.
 *
 * Este arquivo continua aqui caso você prefira voltar a rodar os jobs
 * separados (ex.: se a carga crescer e o processamento in-process começar
 * a atrapalhar o tempo de resposta da API). Nesse caso:
 *   1. Recrie o serviço "imob-automacao-worker" no Render (type: worker,
 *      startCommand: npm run worker) com as mesmas envs da API.
 *   2. Defina RUN_WORKER_IN_PROCESS=false nas envs da API, pra evitar
 *      rodar os jobs duas vezes (API + worker) ao mesmo tempo.
 */
startSchedules();
