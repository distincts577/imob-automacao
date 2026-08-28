import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const BAILEYS_POLL_MS = 2000;

export default function Integrations() {
  const [status, setStatus] = useState({ vista: {}, whatsapp: {} });

  const [vistaForm, setVistaForm] = useState({ apiUrl: '', apiToken: '', apiKey: '', companyId: '' });
  const [vistaTesting, setVistaTesting] = useState(false);
  const [vistaResult, setVistaResult] = useState(null);

  const [waForm, setWaForm] = useState({
    provider: 'meta_cloud_api',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    connectedNumber: '',
    webhookVerifyToken: '',
  });
  const [waTesting, setWaTesting] = useState(false);
  const [waResult, setWaResult] = useState(null);

  // Baileys (QR code) — estado do fluxo de pareamento.
  const [baileysStatus, setBaileysStatus] = useState(null); // { status, connected, qr, error, connectedNumber }
  const [baileysConnecting, setBaileysConnecting] = useState(false);
  const [baileysDisconnecting, setBaileysDisconnecting] = useState(false);
  const pollRef = useRef(null);

  async function loadStatus() {
    const data = await api.get('/integrations/status');
    setStatus(data);
  }

  useEffect(() => { loadStatus(); }, []);

  function stopBaileysPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function fetchBaileysStatus() {
    try {
      const data = await api.get('/integrations/whatsapp/baileys/status');
      setBaileysStatus(data);
      if (data.status === 'connected' || data.status === 'disconnected') {
        stopBaileysPoll();
        loadStatus();
      }
      return data;
    } catch (err) {
      stopBaileysPoll();
      setBaileysStatus({ status: 'disconnected', connected: false, qr: null, error: err.message, connectedNumber: null });
    }
  }

  function startBaileysPoll() {
    stopBaileysPoll();
    pollRef.current = setInterval(fetchBaileysStatus, BAILEYS_POLL_MS);
  }

  // Ao entrar na tela com "baileys" já selecionado, busca o status atual
  // (pode já estar conectado, restaurado pelo server.js na subida do processo)
  // e, se estiver aguardando QR, retoma o polling.
  useEffect(() => {
    if (waForm.provider !== 'baileys') return;
    fetchBaileysStatus().then((data) => {
      if (data?.status === 'connecting' || data?.status === 'qr_pending') {
        startBaileysPoll();
      }
    });
    return () => stopBaileysPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waForm.provider]);

  async function connectBaileys() {
    setBaileysConnecting(true);
    try {
      await api.post('/integrations/whatsapp/baileys/connect');
      await fetchBaileysStatus();
      startBaileysPoll();
    } catch (err) {
      setBaileysStatus((s) => ({ ...(s || {}), status: 'disconnected', connected: false, error: err.message }));
    } finally {
      setBaileysConnecting(false);
    }
  }

  async function disconnectBaileys() {
    setBaileysDisconnecting(true);
    stopBaileysPoll();
    try {
      await api.post('/integrations/whatsapp/baileys/disconnect');
      await fetchBaileysStatus();
      loadStatus();
    } finally {
      setBaileysDisconnecting(false);
    }
  }

  async function changeProvider(provider) {
    setWaForm({ ...waForm, provider });
    stopBaileysPoll();
    setBaileysStatus(null);
    if (provider === 'baileys') {
      await api.put('/integrations/whatsapp', { provider: 'baileys' });
      loadStatus();
    }
  }

  async function saveVista() {
    await api.put('/integrations/vista', vistaForm);
    loadStatus();
  }

  async function testVista() {
    setVistaTesting(true);
    setVistaResult(null);
    try {
      const result = await api.post('/integrations/vista/test');
      setVistaResult(result);
    } finally {
      setVistaTesting(false);
      loadStatus();
    }
  }

  async function saveWhatsapp() {
    await api.put('/integrations/whatsapp', waForm);
    loadStatus();
  }

  async function testWhatsapp() {
    setWaTesting(true);
    setWaResult(null);
    try {
      const result = await api.post('/integrations/whatsapp/test');
      setWaResult(result);
    } finally {
      setWaTesting(false);
      loadStatus();
    }
  }

  return (
    <div>
      <div className="page-header"><h2>Integrações</h2></div>

      <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Vista CRM</h3>
            <span className={`badge ${status.vista?.connected ? 'green' : 'red'}`}>
              {status.vista?.connected ? '🟢 Conectado' : '🔴 Não conectado'}
            </span>
          </div>

          <div className="field">
            <label>API URL</label>
            <input
              placeholder="https://SEUCRM.vistahost.com.br/api/v1"
              value={vistaForm.apiUrl}
              onChange={(e) => setVistaForm({ ...vistaForm, apiUrl: e.target.value })}
            />
          </div>
          <div className="field">
            <label>API Token</label>
            <input
              type="password"
              value={vistaForm.apiToken}
              onChange={(e) => setVistaForm({ ...vistaForm, apiToken: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Chave da API</label>
            <input
              type="password"
              value={vistaForm.apiKey}
              onChange={(e) => setVistaForm({ ...vistaForm, apiKey: e.target.value })}
            />
          </div>
          <div className="field">
            <label>ID da empresa</label>
            <input
              value={vistaForm.companyId}
              onChange={(e) => setVistaForm({ ...vistaForm, companyId: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={saveVista}>Salvar</button>
            <button className="btn btn-secondary" onClick={testVista} disabled={vistaTesting}>
              {vistaTesting ? 'Testando...' : 'Testar conexão'}
            </button>
          </div>
          {vistaResult && (
            <p style={{ fontSize: 13, marginTop: 10, color: vistaResult.connected ? 'var(--success)' : 'var(--danger)' }}>
              {vistaResult.connected ? '🟢 Conectado com sucesso.' : `🔴 ${vistaResult.error}`}
            </p>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
            Os endpoints reais do Vista precisam ser confirmados na sua documentação —
            veja <code>README-VISTA.md</code> na raiz do projeto.
          </p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>WhatsApp</h3>
            <span className={`badge ${status.whatsapp?.connected ? 'green' : 'red'}`}>
              {status.whatsapp?.connected ? '🟢 WhatsApp conectado' : '🔴 Não conectado'}
            </span>
          </div>

          <div className="field">
            <label>Provedor</label>
            <select value={waForm.provider} onChange={(e) => changeProvider(e.target.value)}>
              <option value="meta_cloud_api">Meta WhatsApp Cloud API (oficial)</option>
              <option value="baileys">Baileys (QR code) — não-oficial</option>
            </select>
          </div>

          {waForm.provider === 'meta_cloud_api' && (
            <>
              <div className="field">
                <label>Phone Number ID</label>
                <input
                  value={waForm.phoneNumberId}
                  onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Business Account ID</label>
                <input
                  value={waForm.businessAccountId}
                  onChange={(e) => setWaForm({ ...waForm, businessAccountId: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Access Token</label>
                <input
                  type="password"
                  value={waForm.accessToken}
                  onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Número conectado</label>
                <input
                  placeholder="+55 11 99999-9999"
                  value={waForm.connectedNumber}
                  onChange={(e) => setWaForm({ ...waForm, connectedNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Verify Token do Webhook</label>
                <input
                  placeholder="Mesmo valor cadastrado no painel da Meta"
                  value={waForm.webhookVerifyToken}
                  onChange={(e) => setWaForm({ ...waForm, webhookVerifyToken: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveWhatsapp}>Salvar</button>
                <button className="btn btn-secondary" onClick={testWhatsapp} disabled={waTesting}>
                  {waTesting ? 'Testando...' : 'Testar conexão'}
                </button>
              </div>
              {waResult && (
                <p style={{ fontSize: 13, marginTop: 10, color: waResult.connected ? 'var(--success)' : 'var(--danger)' }}>
                  {waResult.connected ? '🟢 Conectado com sucesso.' : `🔴 ${waResult.error}`}
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                Usa outro provedor (Twilio, 360dialog, Zenvia)? Veja <code>README-WHATSAPP.md</code> —
                o adaptador pode ser trocado sem alterar o resto do sistema.
              </p>
            </>
          )}

          {waForm.provider === 'baileys' && (
            <div>
              <div
                style={{
                  background: 'var(--btn-secondary-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--warning)' }}>⚠️ Método não-oficial.</strong> O número
                conecta como "WhatsApp Web" via QR code, sem passar pela Cloud API da Meta. O WhatsApp
                pode banir ou bloquear números com volume alto de mensagens automáticas por essa via.
                Use um número secundário enquanto testa — trate como plano B, não como o número
                principal da imobiliária.
              </div>

              {(!baileysStatus || baileysStatus.status === 'disconnected') && (
                <button className="btn btn-primary" onClick={connectBaileys} disabled={baileysConnecting}>
                  {baileysConnecting ? 'Conectando...' : 'Conectar'}
                </button>
              )}

              {baileysStatus?.status === 'connecting' && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Iniciando sessão…</p>
              )}

              {baileysStatus?.status === 'qr_pending' && baileysStatus.qr && (
                <div>
                  <p style={{ fontSize: 13, marginBottom: 10 }}>
                    Abra o WhatsApp no celular do número que vai enviar as mensagens →
                    <strong> Aparelhos conectados → Conectar um aparelho</strong> e escaneie o código abaixo.
                  </p>
                  <img
                    src={baileysStatus.qr}
                    alt="QR code para conectar o WhatsApp"
                    style={{ width: 220, height: 220, border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Aguardando leitura do QR code…
                  </p>
                </div>
              )}

              {baileysStatus?.status === 'connected' && (
                <div>
                  <span className="badge green" style={{ marginBottom: 10, display: 'inline-block' }}>
                    🟢 Conectado{baileysStatus.connectedNumber ? `: ${baileysStatus.connectedNumber}` : ''}
                  </span>
                  <div>
                    <button className="btn btn-danger" onClick={disconnectBaileys} disabled={baileysDisconnecting}>
                      {baileysDisconnecting ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </div>
                </div>
              )}

              {baileysStatus?.error && baileysStatus.status !== 'qr_pending' && (
                <p style={{ fontSize: 13, marginTop: 10, color: 'var(--danger)' }}>🔴 {baileysStatus.error}</p>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                Detalhes do fluxo em <code>README-WHATSAPP-BAILEYS.md</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
