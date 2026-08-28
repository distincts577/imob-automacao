const crypto = require('crypto');
const prisma = require('../config/prisma');

/**
 * Armazenamento seguro de credenciais de integração (seção 14 — "Nunca
 * expor tokens ou chaves de API no frontend"). As credenciais são
 * criptografadas com AES-256-GCM antes de irem para o banco, e nunca
 * retornam em texto puro para o frontend (apenas os campos não
 * sensíveis, como "connected" e "lastCheckedAt").
 */

function getKey() {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY ausente/curta. Gere com: openssl rand -hex 32'
    );
  }
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function saveIntegrationConfig(provider, config) {
  const encryptedConfig = encrypt(config);
  return prisma.integration.upsert({
    where: { provider },
    update: { encryptedConfig, connected: false, lastError: null },
    create: { provider, encryptedConfig, connected: false },
  });
}

async function getIntegrationConfig(provider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  if (!row) return null;
  return decrypt(row.encryptedConfig);
}

/** Retorna apenas metadados seguros (nunca o token) para exibir no frontend. */
async function getIntegrationStatus(provider) {
  const row = await prisma.integration.findUnique({ where: { provider } });
  if (!row) return { provider, connected: false, configured: false };
  return {
    provider,
    connected: row.connected,
    configured: true,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
  };
}

module.exports = {
  saveIntegrationConfig,
  getIntegrationConfig,
  getIntegrationStatus,
};
