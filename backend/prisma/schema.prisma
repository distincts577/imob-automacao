// Modelo de dados — seção 19 do escopo
// Banco alvo: PostgreSQL (ajuste "provider" se usar outro SGBD)

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  // URL usada em runtime pela aplicação — na Neon, use a connection string
  // com o pooler (host termina em "-pooler") e o parâmetro ?pgbouncer=true.
  url       = env("DATABASE_URL")
  // URL direta (sem pooler), necessária para "prisma migrate". Na Neon é a
  // mesma connection string, mas com o host SEM o sufixo "-pooler".
  directUrl = env("DIRECT_URL")
}

// ---------------------------------------------------------------------
// USUÁRIOS / SEGURANÇA (seção 14)
// ---------------------------------------------------------------------

enum UserRole {
  ADMINISTRADOR
  OPERADOR
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         UserRole @default(OPERADOR)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  logs AutomationLog[]
}

// ---------------------------------------------------------------------
// FUNIL / ETAPAS
// ---------------------------------------------------------------------

enum FunnelStage {
  LEAD
  ATENDIMENTO
  VISITA_APROVACAO
  CLIENTE_APROVADO
  FECHAMENTO
  PERDIDO
}

enum AutomationStatus {
  ATIVA
  PAUSADA
  CANCELADA
  CLIENTE_RESPONDEU
  CONCLUIDA
}

// ---------------------------------------------------------------------
// CORRETORES / IMÓVEIS / CLIENTES / NEGÓCIOS
// ---------------------------------------------------------------------

model Broker {
  id           String   @id @default(uuid())
  vistaId      String?  @unique // ID do corretor no Vista, quando aplicável
  name         String
  email        String?
  phone        String?
  createdAt    DateTime @default(now())

  clients Client[]
  deals   Deal[]
}

model Property {
  id            String   @id @default(uuid())
  vistaId       String?  @unique // ID do imóvel no Vista
  code          String?
  title         String
  address       String?
  neighborhood  String?
  city          String?
  price         Decimal? @db.Decimal(14, 2)
  link          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  deals Deal[]
}

model Client {
  id                 String      @id @default(uuid())
  vistaId            String?     @unique // ID do cliente/lead no Vista
  name               String
  phone              String      // E.164, único índice de deduplicação
  email              String?
  brokerId           String?
  broker             Broker?     @relation(fields: [brokerId], references: [id])
  currentStage       FunnelStage @default(LEAD)
  optedOut           Boolean     @default(false) // cliente pediu para não receber mais
  lastInteractionAt  DateTime?
  lastMessageSentAt  DateTime?
  lastReplyAt        DateTime?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  deals              Deal[]
  messages           ScheduledMessage[]
  whatsappMessages    WhatsappMessage[]
  automationSequences AutomationSequence[]
  stageHistory        StageHistory[]

  @@index([phone])
  @@index([currentStage])
}

model Deal {
  id           String      @id @default(uuid())
  vistaId      String?     @unique // ID do negócio no Vista
  clientId     String
  client       Client      @relation(fields: [clientId], references: [id])
  propertyId   String?
  property     Property?   @relation(fields: [propertyId], references: [id])
  brokerId     String?
  broker       Broker?     @relation(fields: [brokerId], references: [id])
  stage        FunnelStage @default(LEAD)
  active       Boolean     @default(true)
  visitDate    DateTime?
  approvedAt   DateTime?
  closedAt     DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  stageHistory StageHistory[]
}

model StageHistory {
  id        String      @id @default(uuid())
  clientId  String
  client    Client      @relation(fields: [clientId], references: [id])
  dealId    String?
  deal      Deal?       @relation(fields: [dealId], references: [id])
  fromStage FunnelStage?
  toStage   FunnelStage
  changedAt DateTime    @default(now())
  source    String      @default("vista_sync") // vista_sync | manual
}

// ---------------------------------------------------------------------
// AUTOMAÇÕES (seção 3, 7, 16, 17)
// ---------------------------------------------------------------------

model AutomationRule {
  id     String      @id @default(uuid())
  stage  FunnelStage @unique // uma regra "mestre" por etapa
  active Boolean     @default(false)

  // Regras gerais de envio (seção 7)
  maxMessagesPerClient   Int      @default(3)
  minIntervalMinutes     Int      @default(60)
  minMinutesSinceReply   Int      @default(0)
  minMinutesSinceContact Int      @default(0)
  stopOnReply            Boolean  @default(true)
  stopOnStageChange      Boolean  @default(true)
  stopOnDealClosed       Boolean  @default(true)
  allowedDaysOfWeek      Int[]    @default([1, 2, 3, 4, 5, 6, 7]) // 1=segunda
  quietHoursStart        String   @default("22:00")
  quietHoursEnd          String   @default("08:00")

  // Configuração específica por tipo de etapa
  // LEAD: sequência fixa (usa AutomationRuleStep)
  // ATENDIMENTO / VISITA_APROVACAO / CLIENTE_APROVADO: frequência em dias
  frequencyDays Int?     // ex.: a cada 2 dias (Atendimento)
  dailyTime     String?  // horário do envio diário, ex. "09:00"

  // FECHAMENTO: semanal
  weeklyDayOfWeek Int?    // 1=segunda ... 7=domingo
  weeklyTime      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  steps     AutomationRuleStep[]
  templates MessageTemplate[]
}

// Passos da sequência (usado principalmente pela automação LEAD: msg 1/2/3)
model AutomationRuleStep {
  id               String         @id @default(uuid())
  automationRuleId String
  automationRule   AutomationRule @relation(fields: [automationRuleId], references: [id])
  order            Int            // 1, 2, 3...
  time             String         // "08:00"
  templateId       String?
  template         MessageTemplate? @relation(fields: [templateId], references: [id])

  @@unique([automationRuleId, order])
}

// Sequência de automação ativa PARA UM CLIENTE (estado individual)
model AutomationSequence {
  id               String            @id @default(uuid())
  clientId         String
  client           Client            @relation(fields: [clientId], references: [id])
  stage            FunnelStage
  status           AutomationStatus  @default(ATIVA)
  messagesSentCount Int              @default(0)
  currentStep      Int               @default(0)
  nextMessageAt    DateTime?
  startedAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  pausedByUserId   String?

  scheduledMessages ScheduledMessage[]

  @@index([clientId, stage])
}

// ---------------------------------------------------------------------
// MENSAGENS (seções 4, 5, 6)
// ---------------------------------------------------------------------

model MessageTemplate {
  id               String          @id @default(uuid())
  automationRuleId String
  automationRule   AutomationRule  @relation(fields: [automationRuleId], references: [id])
  order            Int             // posição dentro da automação (1, 2, 3...)
  name             String          // ex. "Mensagem 1"
  body             String          @db.Text // texto com {{variaveis}}
  templateName     String?         // nome do template aprovado no provedor de WhatsApp
  time             String?         // horário configurado (para exibição/edição)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  steps AutomationRuleStep[]
}

model ScheduledMessage {
  id                    String             @id @default(uuid())
  clientId              String
  client                Client             @relation(fields: [clientId], references: [id])
  automationSequenceId  String?
  automationSequence    AutomationSequence? @relation(fields: [automationSequenceId], references: [id])
  templateId            String?
  renderedBody           String             @db.Text
  scheduledFor           DateTime
  status                  String             @default("AGUARDANDO")
  // AGUARDANDO | PROCESSANDO | ENVIADA | ERRO | CANCELADA | CLIENTE_RESPONDEU
  attempts                Int                @default(0)
  lastError               String?
  sentAt                  DateTime?
  createdAt               DateTime           @default(now())

  @@index([status, scheduledFor])
}

model WhatsappMessage {
  id           String   @id @default(uuid())
  clientId     String
  client       Client   @relation(fields: [clientId], references: [id])
  direction    String   // OUTBOUND | INBOUND
  body         String   @db.Text
  providerMsgId String?
  status       String   @default("ENVIADA") // ENVIADA | ENTREGUE | LIDA | ERRO
  createdAt    DateTime @default(now())
}

// ---------------------------------------------------------------------
// INTEGRAÇÕES (seções 9, 10)
// ---------------------------------------------------------------------

model Integration {
  id            String   @id @default(uuid())
  provider      String   @unique // "vista" | "whatsapp"
  // Credenciais ficam criptografadas no backend — nunca expostas ao frontend
  encryptedConfig String @db.Text
  connected     Boolean  @default(false)
  lastCheckedAt DateTime?
  lastError     String?
  updatedAt     DateTime @updatedAt
}

// ---------------------------------------------------------------------
// LOGS (seção 12)
// ---------------------------------------------------------------------

model AutomationLog {
  id        String   @id @default(uuid())
  clientId  String?
  action    String   // MESSAGE_SENT | MESSAGE_ERROR | CLIENT_REPLIED | STAGE_CHANGED | AUTOMATION_PAUSED | ...
  details   Json?
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())

  @@index([action, createdAt])
}

// ---------------------------------------------------------------------
// CONFIGURAÇÕES GERAIS (seção 13)
// ---------------------------------------------------------------------

model GeneralSettings {
  id                  String  @id @default("singleton")
  companyName         String  @default("")
  logoUrl             String?
  timezone            String  @default("America/Sao_Paulo")
  businessHoursStart  String  @default("08:00")
  businessHoursEnd    String  @default("20:00")
  maxMessagesPerDay   Int     @default(1000)
  messageSignature    String?
  automationsEnabled  Boolean @default(true)
}
