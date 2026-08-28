# Sistema de Automação de Atendimento — Imobiliária

Plataforma para acompanhar leads/clientes vindos do **Vista CRM** e enviar
mensagens de **WhatsApp** (API oficial) conforme a etapa do funil, com
regras de segurança, personalização de mensagens e execução em segundo
plano (worker), independente do painel estar aberto.

## Arquitetura

```
imob-automacao/
├── backend/          # API REST (Node.js + Express + Prisma/PostgreSQL)
│   ├── prisma/schema.prisma      # Modelo de dados (seção 19 do escopo)
│   └── src/
│       ├── routes/               # Endpoints REST
│       ├── services/
│       │   ├── vistaClient.js        # Integração com Vista CRM (ver README-VISTA.md)
│       │   ├── whatsappClient.js     # Integração com API oficial de WhatsApp
│       │   ├── automationEngine.js   # Motor de regras/verificações (seção 16)
│       │   ├── messageRenderer.js    # Variáveis {{nome}}, {{imovel}}, etc.
│       │   └── credentialsVault.js   # Armazenamento seguro de tokens
│       ├── middleware/auth.js    # JWT + RBAC (ADMIN/OPERADOR)
│       └── worker/               # Cron/worker independente do navegador
├── frontend/         # Painel React (Dashboard, Clientes, Automações, Mensagens, Fila, Logs, Integrações, Configurações)
├── README-VISTA.md   # O que preciso de você para ativar a integração real com o Vista
└── README-WHATSAPP.md# O que preciso de você para ativar a integração real com WhatsApp
```

## Por que partes da integração estão "preparadas, não conectadas"

Você pediu explicitamente para **não inventar** endpoints do Vista nem da
API de WhatsApp. Eu segui essa instrução à risca:

- `vistaClient.js` e `whatsappClient.js` têm toda a estrutura (autenticação
  configurável, retry, normalização de dados, logging) pronta para
  produção, mas os **paths de endpoint específicos** ficam em um arquivo
  de configuração (`vista.endpoints.js` / provider config) que você
  preenche com base na documentação oficial que a Vista/seu provedor de
  WhatsApp te fornecer — cada conta Vista pode ter uma URL base e escopo
  de API diferentes (Vista tem múltiplos produtos: Vista CRM, Vista Site,
  etc.), e o provedor oficial de WhatsApp (Meta Cloud API, Twilio,
  360dialog, Zenvia etc.) muda o formato de payload.
- Nada é simulado silenciosamente: se as credenciais não estiverem
  configuradas, o sistema mostra 🔴 no painel de Integrações e o worker
  **não** tenta enviar mensagens (evita disparos "fake" para clientes
  reais).

Todo o resto — banco de dados, motor de automação, verificações de
segurança, fila, logs, editor de mensagens com variáveis e preview,
dashboard, autenticação — está implementado e funcional.

## Como rodar (local)

```bash
# Backend
cd backend
cp .env.example .env      # preencha DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev
npm run seed               # cria usuário admin inicial
npm run dev                # API em http://localhost:3333
npm run worker             # worker de automação (processo separado)

# Frontend
cd frontend
npm install
npm run dev                 # painel em http://localhost:5173
```

## Deploy em produção (100% gratuito): Neon + Render + Vercel/Netlify

Essa combinação não pede cartão de crédito em nenhuma das três plataformas.

### 1. Banco de dados — Neon

1. Crie uma conta em [neon.tech](https://neon.tech) e um novo projeto (ex.: `imob-automacao`).
2. No painel do projeto, copie duas connection strings:
   - **Pooled connection** (host termina em `-pooler`) → vai em `DATABASE_URL`. Acrescente `?sslmode=require&pgbouncer=true&connection_limit=1` no final se o painel não já incluir.
   - **Direct connection** (host sem `-pooler`) → vai em `DIRECT_URL`. Usada só pelo `prisma db push`/`migrate`.
3. Guarde as duas — vão para as variáveis de ambiente do Render no próximo passo.

### 2. Backend + worker — Render

1. Suba este repositório no GitHub (ou GitLab).
2. No painel do Render: **New > Blueprint**, selecione o repositório. O Render lê o `render.yaml` da raiz e cria automaticamente os dois serviços: `imob-automacao-api` (web) e `imob-automacao-worker` (background worker), ambos no plano free.
3. Preencha manualmente os campos marcados como secretos no painel de cada serviço:
   - **imob-automacao-api**: `DATABASE_URL` e `DIRECT_URL` (as da Neon), `FRONTEND_URL` (deixe em branco por enquanto, você volta aqui depois do passo 3), `APP_URL` (a própria URL do serviço, ex.: `https://imob-automacao-api.onrender.com`). `JWT_SECRET` e `CREDENTIALS_ENCRYPTION_KEY` são gerados automaticamente pelo Render.
   - **imob-automacao-worker**: `DATABASE_URL`, `DIRECT_URL` (mesmas da Neon) e `CREDENTIALS_ENCRYPTION_KEY` — **copie exatamente o mesmo valor** que o Render gerou para o serviço da API (Environment > `imob-automacao-api` > copie o valor). Se os dois valores forem diferentes, o worker não consegue descriptografar as credenciais do Vista/WhatsApp salvas pela API.
4. Depois do primeiro deploy da API, rode a criação do usuário admin uma única vez: no painel do serviço `imob-automacao-api`, abra o **Shell** e rode `npm run seed`. Login inicial: `admin@imobiliaria.com` / `troque-esta-senha` (troque depois de entrar).

> **Sobre o plano free do Render:** o worker precisa ficar sempre ativo para disparar os crons (a cada 1, 5 e 10 minutos), e o plano free dá um total de 750 horas de instância por mês **compartilhadas entre todos os seus serviços gratuitos**. Rodando API + worker o mês inteiro isso pode chegar perto do limite. Para uma demonstração ou uso com poucos clientes tende a caber; se passar do limite, os serviços ficam suspensos até o mês seguinte (ou você migra para um plano pago, US$7/mês por serviço).

### 3. Frontend — Vercel ou Netlify

**Vercel:**
1. Importe o mesmo repositório no [vercel.com](https://vercel.com).
2. Configure **Root Directory** para `frontend`.
3. Framework preset: Vite (detecta sozinho pelo `package.json`).
4. Em **Environment Variables**, adicione `VITE_API_URL` = `https://imob-automacao-api.onrender.com/api` (a URL do seu serviço no Render, com `/api` no final).
5. Deploy. O `vercel.json` incluído já configura o rewrite de rotas do React Router.

**Netlify (alternativa):**
1. Importe o repositório em [netlify.com](https://netlify.com).
2. **Base directory**: `frontend`. O `netlify.toml` já define build (`npm run build`) e publish dir (`dist`).
3. Em **Environment variables**, adicione `VITE_API_URL` da mesma forma.
4. Deploy.

### 4. Fechar o CORS

Depois que o frontend estiver publicado (você terá uma URL tipo `https://imob-automacao.vercel.app`), volte no Render, serviço `imob-automacao-api` → Environment → preencha `FRONTEND_URL` com essa URL e clique em **Manual Deploy > Deploy latest commit** (ou aguarde o redeploy automático) para aplicar.

A partir daí o backend só aceita requisições vindas do domínio do seu frontend.

### 5. Configurar Vista e WhatsApp

Com tudo no ar, entre no painel publicado, vá em **Integrações** e preencha as credenciais reais do Vista e do provedor de WhatsApp (ver `README-VISTA.md` e `README-WHATSAPP.md`). Nada disso fica no `.env` — é criptografado e salvo no banco pela própria interface.

