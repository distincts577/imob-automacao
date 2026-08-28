# ---------------------------------------------------------------------
# Banco de dados — Neon (Postgres serverless, free tier permanente)
# ---------------------------------------------------------------------
# 1. Crie um projeto em https://neon.tech (sem cartão de crédito).
# 2. No painel do projeto, copie a "Connection string" (modo "Pooled connection")
#    para DATABASE_URL — o host vem com sufixo "-pooler" e você deve adicionar
#    "?pgbouncer=true&connection_limit=1" no final.
# 3. Copie a "Direct connection" (host SEM "-pooler") para DIRECT_URL — é usada
#    apenas para rodar "prisma migrate deploy".
DATABASE_URL="postgresql://usuario:senha@ep-exemplo-pooler.sa-east-1.aws.neon.tech/imob_automacao?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://usuario:senha@ep-exemplo.sa-east-1.aws.neon.tech/imob_automacao?sslmode=require"

# ---------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------
JWT_SECRET="troque-por-um-segredo-forte"
JWT_EXPIRES_IN="8h"

# Chave usada para criptografar credenciais de integração (Vista/WhatsApp)
# armazenadas no banco. Gere com: openssl rand -hex 32
CREDENTIALS_ENCRYPTION_KEY=""

PORT=3333

# ---------------------------------------------------------------------
# CORS — domínio(s) do frontend publicado (Vercel/Netlify)
# ---------------------------------------------------------------------
# Ex.: https://imob-automacao.vercel.app
# Pode listar mais de um, separado por vírgula (ex.: produção + preview).
FRONTEND_URL=""

# URL pública deste backend, usada para montar o {{link_atendimento}}
APP_URL=""

# As credenciais reais de Vista/WhatsApp NÃO ficam aqui — são cadastradas
# pela interface em Configurações > Integrações e salvas criptografadas
# na tabela Integration. Este .env guarda apenas segredos de infraestrutura.
