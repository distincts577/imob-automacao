import { useEffect, useState } from 'react';
import { api } from '../api/client';

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

  async function loadStatus() {
    const data = await api.get('/integrations/status');
    setStatus(data);
  }

  useEffect(() => { loadStatus(); }, []);

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
            <select value={waForm.provider} onChange={(e) => setWaForm({ ...waForm, provider: e.target.value })}>
              <option value="meta_cloud_api">Meta WhatsApp Cloud API (oficial)</option>
            </select>
          </div>
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
        </div>
      </div>
    </div>
  );
}
