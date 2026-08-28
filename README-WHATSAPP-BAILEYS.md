# WhatsApp via Baileys (QR code) — adaptador alternativo

**Status: backend pronto, frontend ainda NÃO implementado.**

## ⚠️ Leia antes de ativar

Esse é um método **não-oficial**: o número conecta como "WhatsApp Web"
via QR code, sem passar pela Cloud API da Meta. Vantagem: não exige
aprovação de templates nem conta Business verificada. Risco: o WhatsApp
pode **banir ou bloquear o número** que envia volume alto de mensagens
automáticas por essa via, principalmente para contatos que não
iniciaram a conversa. Recomendações:

- Use um número secundário (chip novo) enquanto testa, não o número
  principal da imobiliária.
- Mantenha volume e frequência de envio parecidos com uso humano.
- Trate isso como plano B / contingência, com o adaptador oficial
  (`metaCloudApiAdapter.js`) como caminho principal.

## O que já foi implementado no backend

- `backend/src/services/providers/baileysAdapter.js` — adaptador
  seguindo a mesma interface dos outros provedores (`sendMessage`,
  `testConnection`, `parseWebhookEvent`), mais funções extras
  (`connect`, `disconnect`, `getStatus`) para o fluxo de QR code.
- `backend/src/services/baileysAuthStore.js` — guarda a sessão
  (credenciais + chaves) **criptografada no Postgres**, reaproveitando
  o cofre de `credentialsVault.js`, em vez de arquivos em disco. Isso é
  proposital: o deploy padrão deste projeto é Render (`render.yaml`),
  cujo filesystem não é persistente entre deploys — guardando em disco,
  cada novo deploy exigiria escanear o QR code de novo.
- Mensagens recebidas: como o Baileys não usa webhook HTTP (é um
  socket), o próprio adapter injeta as mensagens direto em
  `automationEngine.handleClientReply(...)` — equivalente ao que
  `webhook.routes.js` faz para a Meta.
- `whatsappClient.js` — registrado o provedor `"baileys"` no mapa de
  adaptadores.
- `integrations.routes.js` — novas rotas (todas exigem
  `ADMINISTRADOR`, mesmo padrão do resto do arquivo):
  - `PUT /api/integrations/whatsapp` com `{ "provider": "baileys" }` —
    seleciona o provedor (rota já existia, só precisa desse body).
  - `POST /api/integrations/whatsapp/baileys/connect` — inicia a
    sessão e gera o QR code (ou reconecta, se já houver sessão salva).
  - `GET /api/integrations/whatsapp/baileys/status` — retorna
    `{ status, connected, qr, error, connectedNumber }`, onde `qr` é
    uma **data URL de imagem PNG** (`data:image/png;base64,...`) pronta
    pra exibir num `<img src="...">`. Pensado para o frontend fazer
    polling (ex.: a cada 2s) enquanto `status === 'qr_pending'`.
  - `POST /api/integrations/whatsapp/baileys/disconnect` — faz logout
    e apaga a sessão salva no banco.
- `server.js` — ao subir o processo, se o provedor salvo for
  `"baileys"`, tenta restaurar a sessão automaticamente (sem exigir
  novo QR, a menos que a sessão tenha sido invalidada).
- `package.json` — adicionadas as dependências `@whiskeysockets/baileys`,
  `qrcode` e `pino`.

## O que falta (frontend — não implementado ainda)

Em **Configurações > Integrações > WhatsApp**, adicionar:

1. Um seletor de provedor (`Meta Cloud API` / `Baileys (QR code)`), com
   o aviso de risco acima visível quando "Baileys" for escolhido.
2. Ao escolher Baileys: botão "Conectar" → chama `POST
   .../baileys/connect` e começa a fazer polling em `GET
   .../baileys/status`.
3. Enquanto `status === 'qr_pending'`: exibir a imagem do campo `qr`
   (`<img src={qr} />`) para o usuário escanear com o celular
   (WhatsApp > Aparelhos conectados > Conectar um aparelho).
4. Quando `status === 'connected'`: mostrar o número conectado
   (`connectedNumber`) e um botão "Desconectar" (chama
   `.../baileys/disconnect`).

Quer que eu implemente essa tela agora?

## Rodar localmente

```bash
cd backend
npm install   # baixa @whiskeysockets/baileys, qrcode, pino
npm run dev
```

Nenhuma variável de ambiente nova é necessária — a sessão do Baileys
usa a mesma `CREDENTIALS_ENCRYPTION_KEY` já existente no `.env`.
