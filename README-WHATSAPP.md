# Integração com WhatsApp (API oficial) — o que falta para ativar

`backend/src/services/whatsappClient.js` implementa uma interface única
(`sendMessage`, `receiveWebhook`, `testConnection`) por trás de um
adaptador de provedor, para você poder trocar de provedor sem mexer no
resto do sistema.

Já vem com um adaptador de exemplo para a **Meta WhatsApp Cloud API**
(a API oficial mais comum), pois seu formato é público e documentado
oficialmente pela Meta. Para ativá-lo de verdade você precisa apenas
preencher em Configurações > Integrações > WhatsApp:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Se você usa outro provedor oficial (Twilio WhatsApp Business API,
360dialog, Zenvia, Gupshup etc.), me diga qual e eu implemento o
adaptador equivalente em `backend/src/services/providers/` seguindo a
mesma interface — sem precisar alterar automationEngine, filas ou
frontend.

**Importante sobre templates**: a API oficial do WhatsApp exige que a
*primeira* mensagem de uma conversa fora da janela de 24h use um
**template pré-aprovado pela Meta**. As mensagens configuradas na aba
"Mensagens" do painel são o *conteúdo*, mas você precisará cadastrar os
templates correspondentes no WhatsApp Business Manager e mapear o nome
do template em `Configurações > Integrações > WhatsApp > Templates`
(campo já criado na interface, `templateName` no schema de
`MessageTemplate`).
