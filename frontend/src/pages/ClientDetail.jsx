import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateTime } from '../lib/datetime';

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [manualMsg, setManualMsg] = useState('');
  const [tab, setTab] = useState('historico');

  async function load() {
    const data = await api.get(`/clients/${id}`);
    setClient(data);
  }

  useEffect(() => { load(); }, [id]);

  async function runAction(action) {
    await api.post(`/clients/${id}/automation/${action}`);
    load();
  }

  async function sendManual() {
    if (!manualMsg.trim()) return;
    await api.post(`/clients/${id}/messages/manual`, { body: manualMsg });
    setManualMsg('');
    load();
  }

  if (!client) return <p>Carregando...</p>;

  const activeDeal = client.deals?.[0];
  const activeSeq = client.automationSequences?.find((s) => s.status === 'ATIVA') || client.automationSequences?.[0];
  const nextMessage = client.messages?.find((m) => m.status === 'AGUARDANDO');

  return (
    <div>
      <div className="page-header">
        <h2>{client.name}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => runAction('resume')}>▶ Ativar</button>
          <button className="btn btn-secondary" onClick={() => runAction('pause')}>⏸ Pausar</button>
          <button className="btn btn-danger" onClick={() => runAction('cancel')}>⛔ Cancelar</button>
        </div>
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dados do cliente</h3>
          <p><strong>Telefone:</strong> {client.phone}</p>
          <p><strong>E-mail:</strong> {client.email || '—'}</p>
          <p><strong>Imóvel de interesse:</strong> {activeDeal?.property?.title || '—'}</p>
          <p><strong>ID no Vista:</strong> {client.vistaId || '—'}</p>
          <p><strong>ID do negócio:</strong> {activeDeal?.vistaId || '—'}</p>
          <p><strong>Corretor responsável:</strong> {client.broker?.name || '—'}</p>
          <p><strong>Etapa atual:</strong> {client.currentStage}</p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Automação</h3>
          <p><strong>Status:</strong> {activeSeq?.status || 'Nenhuma automação'}</p>
          <p><strong>Mensagens enviadas:</strong> {activeSeq?.messagesSentCount ?? 0}</p>
          <p><strong>Próxima mensagem:</strong> {nextMessage ? formatDateTime(nextMessage.scheduledFor) : '—'}</p>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Enviar mensagem manual</label>
            <textarea rows={3} value={manualMsg} onChange={(e) => setManualMsg(e.target.value)} />
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={sendManual}>
              ✉ Enviar mensagem manual
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={tab === 'historico' ? 'active' : ''} onClick={() => setTab('historico')}>Mensagens</button>
          <button className={tab === 'etapas' ? 'active' : ''} onClick={() => setTab('etapas')}>Alterações de etapa</button>
          <button className={tab === 'fila' ? 'active' : ''} onClick={() => setTab('fila')}>Fila deste cliente</button>
        </div>

        {tab === 'historico' && (
          <table>
            <thead><tr><th>Direção</th><th>Mensagem</th><th>Data</th></tr></thead>
            <tbody>
              {client.whatsappMessages?.map((m) => (
                <tr key={m.id}>
                  <td>{m.direction === 'OUTBOUND' ? 'Enviada' : 'Recebida'}</td>
                  <td>{m.body}</td>
                  <td>{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'etapas' && (
          <table>
            <thead><tr><th>De</th><th>Para</th><th>Quando</th></tr></thead>
            <tbody>
              {client.stageHistory?.map((h) => (
                <tr key={h.id}>
                  <td>{h.fromStage || '—'}</td>
                  <td>{h.toStage}</td>
                  <td>{formatDateTime(h.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'fila' && (
          <table>
            <thead><tr><th>Mensagem</th><th>Previsão</th><th>Status</th></tr></thead>
            <tbody>
              {client.messages?.map((m) => (
                <tr key={m.id}>
                  <td>{m.renderedBody?.slice(0, 60)}...</td>
                  <td>{formatDateTime(m.scheduledFor)}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
