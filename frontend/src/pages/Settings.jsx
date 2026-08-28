import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(setSettings);
  }, []);

  async function save() {
    const updated = await api.put('/settings', settings);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <p>Carregando...</p>;

  return (
    <div>
      <div className="page-header"><h2>Configurações gerais</h2></div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="field">
          <label>Nome da imobiliária</label>
          <input
            value={settings.companyName || ''}
            onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>URL do logo</label>
          <input
            value={settings.logoUrl || ''}
            onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Fuso horário</label>
          <input
            value={settings.timezone || ''}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Horário de funcionamento — início</label>
            <input
              type="time"
              value={settings.businessHoursStart || ''}
              onChange={(e) => setSettings({ ...settings, businessHoursStart: e.target.value })}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Horário de funcionamento — fim</label>
            <input
              type="time"
              value={settings.businessHoursEnd || ''}
              onChange={(e) => setSettings({ ...settings, businessHoursEnd: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label>Máximo de mensagens por dia</label>
          <input
            type="number"
            value={settings.maxMessagesPerDay || ''}
            onChange={(e) => setSettings({ ...settings, maxMessagesPerDay: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Assinatura das mensagens</label>
          <textarea
            rows={2}
            value={settings.messageSignature || ''}
            onChange={(e) => setSettings({ ...settings, messageSignature: e.target.value })}
          />
        </div>
        <label className="toggle" style={{ marginBottom: 16 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={!!settings.automationsEnabled}
            onChange={(e) => setSettings({ ...settings, automationsEnabled: e.target.checked })}
          />
          Ativar automações globalmente
        </label>

        <button className="btn btn-primary" onClick={save}>Salvar configurações</button>
        {saved && <span style={{ marginLeft: 10, color: 'var(--success)', fontSize: 13 }}>Salvo!</span>}
      </div>
    </div>
  );
}
