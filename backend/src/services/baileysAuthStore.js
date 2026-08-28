const {
  initAuthCreds,
  BufferJSON,
  proto,
} = require('@whiskeysockets/baileys');
const {
  saveEncryptedBlob,
  getEncryptedBlob,
  deleteEncryptedBlob,
} = require('./credentialsVault');

/**
 * Auth state do Baileys persistido no Postgres (tabela `Integration`,
 * reaproveitando o cofre criptografado de credentialsVault.js) em vez de
 * arquivos em disco.
 *
 * Isso é importante porque o deploy padrão deste projeto é Render (ver
 * render.yaml), cujo filesystem NÃO é persistente entre deploys/restarts
 * do serviço — se a sessão do Baileys (auth state + chaves de
 * criptografia de sinal) fosse salva com `useMultiFileAuthState` em
 * disco, qualquer redeploy derrubaria a conexão do WhatsApp e exigiria
 * escanear o QR code de novo.
 *
 * A store é dividida em duas chaves no cofre:
 *  - `whatsapp_baileys_creds`: as credenciais principais (identidade,
 *    chaves de sinal do dispositivo etc.)
 *  - `whatsapp_baileys_keys`: o restante do "signal key store"
 *    (pre-keys, session keys, sender keys...), guardado como um mapa
 *    { "<type>-<id>": valor }.
 *
 * O formato serializado usa BufferJSON (do próprio Baileys) para que
 * Buffers/Uint8Arrays sobrevivam ao round-trip JSON -> criptografia ->
 * JSON.
 */

const CREDS_KEY = 'whatsapp_baileys_creds';
const KEYS_KEY = 'whatsapp_baileys_keys';

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

async function useDbAuthState() {
  const savedCreds = await getEncryptedBlob(CREDS_KEY);
  const creds = savedCreds ? deserialize(savedCreds) : initAuthCreds();

  const savedKeys = (await getEncryptedBlob(KEYS_KEY)) || {};
  // Mapa em memória, sincronizado com o banco a cada `set`.
  const keyStore = deserialize(savedKeys);

  const persistKeys = () => saveEncryptedBlob(KEYS_KEY, serialize(keyStore));

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            let value = keyStore[`${type}-${id}`];
            if (value && type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            if (value !== undefined) result[id] = value;
          }
          return result;
        },
        set: async (data) => {
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                keyStore[key] = value;
              } else {
                delete keyStore[key];
              }
            }
          }
          await persistKeys();
        },
      },
    },
    saveCreds: async () => {
      await saveEncryptedBlob(CREDS_KEY, serialize(creds));
    },
    clearAll: async () => {
      await deleteEncryptedBlob(CREDS_KEY);
      await deleteEncryptedBlob(KEYS_KEY);
    },
  };
}

module.exports = { useDbAuthState };
