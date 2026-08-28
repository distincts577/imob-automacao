const router = require('express').Router();
const whatsappClient = require('../services/whatsappClient');
const automationEngine = require('../services/automationEngine');
const { getIntegrationConfig } = require('../services/credentialsVault');

// Verificação do webhook (padrão Meta Cloud API — GET com hub.challenge)
router.get('/whatsapp', async (req, res) => {
  const config = await getIntegrationConfig('whatsapp').catch(() => null);
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && config && token === config.webhookVerifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recebimento de mensagens/respostas — seção 8: interrompe automação
router.post('/whatsapp', async (req, res) => {
  try {
    const event = await whatsappClient.parseWebhookEvent(req.body);
    if (event?.type === 'INBOUND_MESSAGE') {
      await automationEngine.handleClientReply({
        fromPhone: event.fromPhone,
        body: event.body,
        providerMessageId: event.providerMessageId,
      });
    }
    res.sendStatus(200);
  } catch (err) {
    // Sempre responde 200 para o provedor não reenfileirar indefinidamente;
    // o erro fica registrado nos logs do servidor.
    console.error('Erro processando webhook do WhatsApp:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
