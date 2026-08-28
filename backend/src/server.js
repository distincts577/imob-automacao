require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const clientsRoutes = require('./routes/clients.routes');
const automationsRoutes = require('./routes/automations.routes');
const messagesRoutes = require('./routes/messages.routes');
const queueRoutes = require('./routes/queue.routes');
const logsRoutes = require('./routes/logs.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const integrationsRoutes = require('./routes/integrations.routes');
const settingsRoutes = require('./routes/settings.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();

// Em produção, restringe o CORS ao(s) domínio(s) do frontend (Vercel/Netlify).
// Configure FRONTEND_URL com a URL publicada (ex.: https://seu-projeto.vercel.app).
// Aceita múltiplas URLs separadas por vírgula (útil para preview deployments).
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true, // sem FRONTEND_URL definido, libera geral (uso em dev)
    credentials: true,
  })
);
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/webhooks', webhookRoutes); // fora de /api — o provedor de WhatsApp chama diretamente

// Handler de erro genérico
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno.' });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
