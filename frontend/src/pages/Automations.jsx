import { useEffect, useState } from 'react';
import { api } from '../api/client';

const STAGES = [
  { key: 'LEAD', label: 'Lead', kind: 'sequence' },
  { key: 'ATENDIMENTO', label: 'Atendimento', kind: 'frequency' },
  { key: 'VISITA_APROVACAO', label: 'Visita / Aprovação', kind: 'daily' },
  { key: 'CLIENTE_APROVADO', label: 'Cliente aprovado', kind: 'daily' },
  { key: 'FECHAMENTO', label: 'Fechamento', kind: 'weekly' },
];

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function Automations() {
  const [active, setActive] = useState('LEAD');
  const [rule, setRule] = useState(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runNowResult, setRunNowResult] = useState(null);

  async function load(stage) {
    try {
      const data = await api.get(`/automations/${stage}`);
      setRule(data);
    } catch {
      setRule({ stage, active: false, allowedDaysOfWeek: [1, 2, 3, 4, 5, 6, 7], quietHoursStart: '22:00', quietHoursEnd: '08:00' });
    }
  }

  useEffect(() => { load(active); }, [active]);

  async function save() {
    await api.put(`/automations/${active}`, rule);
    load(active);
  }

  // Roda o agendamento na hora (não espera o cron, que roda a cada 15 min).
  // Respeita as mesmas regras de elegibilidade — não força nada.
  async function runNow() {
    setRunningNow(true);
    setRunNowResult(null);
    try {
      const data = await api.post('/automations/run-now');
      setRunNowResult(data.results);
    } catch (err) {
      setRunNowResult({ error: err.message });
    } finally {
      setRunningNow(false);
    }
  }

  if (!rule) return <p>Carregando...</p>;
  const stageDef = STAGES.find((s) => s.key === active);

  return (
    <div>
      <div className="page-header"><h2>Automações</h2></div>

      <div className="tabs">
        {STAGES.map((s) => (
          <button key={s.key} className={active === s.key ? 'active' : ''} onClick={() => setActive(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toggle" style={{ marginBottom: 18 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={!!rule.active}
            onChange={(e) => setRule({ ...rule, active: e.target.checked })}
          />
          <strong>Ativar automação "{stageDef.label}"</strong>
        </div>

        {stageDef.kind === 'sequence' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            A sequência de mensagens (quantidade e horário de cada uma) é configurada na aba
            "Mensagens". Aqui você define as regras gerais de envio abaixo.
          </p>
        )}

        {stageDef.kind === 'frequency' && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Dias sem contato para reenviar</label>
              <input
                type="number"
                value={rule.frequencyDays ?? ''}
                onChange={(e) => setRule({ ...rule, frequencyDays: Number(e.target.value) })}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Horário do envio</label>
              <input
                type="time"
                value={rule.dailyTime ?? ''}
                onChange={(e) => setRule({ ...rule, dailyTime: e.target.value })}
              />
            </div>
          </div>
        )}

        {stageDef.kind === 'daily' && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Frequência (dias sem interação)</label>
              <input
                type="number"
                value={rule.frequencyDays ?? 1}
                onChange={(e) => setRule({ ...rule, frequencyDays: Number(e.target.value) })}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Horário</label>
              <input
                type="time"
                value={rule.dailyTime ?? ''}
                onChange={(e) => setRule({ ...rule, dailyTime: e.target.value })}
              />
            </div>
          </div>
        )}

        {stageDef.kind === 'weekly' && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Dia da semana</label>
              <select
                value={rule.weeklyDayOfWeek ?? ''}
                onChange={(e) => setRule({ ...rule, weeklyDayOfWeek: Number(e.target.value) })}
              >
                <option value="">Selecione</option>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Horário</label>
              <input
                type="time"
                value={rule.weeklyTime ?? ''}
                onChange={(e) => setRule({ ...rule, weeklyTime: e.target.value })}
              />
            </div>
          </div>
        )}

        <h4>Regras de envio</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="field">
            <label>Máx. de mensagens por cliente</label>
            <input
              type="number"
              value={rule.maxMessagesPerClient ?? 3}
              onChange={(e) => setRule({ ...rule, maxMessagesPerClient: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Intervalo mínimo entre mensagens (min)</label>
            <input
              type="number"
              value={rule.minIntervalMinutes ?? 60}
              onChange={(e) => setRule({ ...rule, minIntervalMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Não enviar mensagens entre</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="time"
                value={rule.quietHoursStart ?? '22:00'}
                onChange={(e) => setRule({ ...rule, quietHoursStart: e.target.value })}
              />
              <input
                type="time"
                value={rule.quietHoursEnd ?? '08:00'}
                onChange={(e) => setRule({ ...rule, quietHoursEnd: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
          <label className="toggle">
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={rule.stopOnReply ?? true}
              onChange={(e) => setRule({ ...rule, stopOnReply: e.target.checked })}
            />
            Parar quando cliente responder
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={rule.stopOnStageChange ?? true}
              onChange={(e) => setRule({ ...rule, stopOnStageChange: e.target.checked })}
            />
            Parar quando mudar de etapa
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={rule.stopOnDealClosed ?? true}
              onChange={(e) => setRule({ ...rule, stopOnDealClosed: e.target.checked })}
            />
            Parar quando negócio for fechado
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={save}>
            Salvar automação
          </button>
          <button className="btn btn-secondary" onClick={runNow} disabled={runningNow}>
            {runningNow ? 'Rodando...' : '⚡ Rodar agendamento agora'}
          </button>
        </div>

        {runNowResult && (
          <p style={{ color: runNowResult.error ? 'var(--danger, red)' : 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
            {runNowResult.error
              ? `Erro: ${runNowResult.error}`
              : `Lead: ${runNowResult.lead?.scheduled ?? 0} · Atendimento: ${runNowResult.atendimento?.scheduled ?? 0} · Visita: ${runNowResult.visita?.scheduled ?? 0} · Aprovado: ${runNowResult.aprovado?.scheduled ?? 0} · Fechamento: ${runNowResult.fechamento?.scheduled ?? 0} novas mensagens agendadas. Confira a Fila.`}
          </p>
        )}
      </div>

      <TestPanel stage={active} />
    </div>
  );
}

/** Modo de teste da automação — seção 18: simular sem enviar, ou enviar um teste real. */
function TestPanel({ stage }) {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/clients').then((data) => setClients(data || []));
  }, []);

  useEffect(() => {
    setResult(null);
    setTemplateId('');
    api.get(`/messages/${stage}/templates`).then((data) => setTemplates(data || []));
  }, [stage]);

  async function simulate() {
    if (!clientId) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await api.post(`/automations/${stage}/simulate`, { clientId });
      setResult({ type: 'simulate', data });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!clientId || !templateId) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await api.post(`/automations/${stage}/test-send`, { clientId, templateId });
      setResult({ type: 'sent', data });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Modo de teste</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: -8 }}>
        "Simular" mostra exatamente o que o sistema faria, sem enviar nada de verdade.
        "Enviar teste" dispara uma mensagem real para o cliente selecionado.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Cliente de teste</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecione um cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Mensagem (para envio de teste real)</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Selecione uma mensagem</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={simulate} disabled={!clientId || busy}>
            Simular automação
          </button>
          <button className="btn btn-primary" onClick={sendTest} disabled={!clientId || !templateId || busy}>
            Enviar mensagem de teste
          </button>
        </div>
      </div>

      {result?.type === 'simulate' && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{result.data.note}</p>
          {result.data.wouldSend.map((m, i) => (
            <div key={i} className="whatsapp-preview" style={{ marginBottom: 8 }}>
              <div className="whatsapp-bubble">
                {m.rendered}
                <span className="time">{m.time || '--:--'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {result?.type === 'sent' && (
        <p style={{ marginTop: 12, color: 'var(--success)', fontSize: 13 }}>
          🟢 Mensagem de teste enviada: "{result.data.rendered}"
        </p>
      )}
      {result?.type === 'error' && (
        <p style={{ marginTop: 12, color: 'var(--danger)', fontSize: 13 }}>🔴 {result.message}</p>
      )}
    </div>
  );
}
