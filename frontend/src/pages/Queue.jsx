import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDateTime } from '../lib/datetime';

const STATUS_BADGE = {
  AGUARDANDO: ['yellow', '🟡 Aguardando'],
  PROCESSANDO: ['blue', '🔵 Processando'],
  ENVIADA: ['green', '🟢 Enviada'],
  ERRO: ['red', '🔴 Erro'],
  CANCELADA: ['gray', '⚫ Cancelada'],
  CLIENTE_RESPONDEU: ['purple', '🟣 Cliente respondeu'],
};

export default function Queue() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('');

  async function load() {
    const params = status ? `?status=${status}` : '';
    const data = await api.get(`/queue${params}`);
    setMessages(data || []);
  }

  useEffect(() => { load(); }, [status]);

  async function cancel(id) {
    await api.post(`/queue/${id}/cancel`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h2>Fila de mensagens</h2>
        <select style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.keys(STATUS_BADGE).map((s) => (
            <option key={s} value={s}>{STATUS_BADGE[s][1]}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>Mensagem</th>
              <th>Data prevista</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td>{m.client?.name}</td>
                <td>{m.client?.phone}</td>
                <td>{m.renderedBody?.slice(0, 50)}...</td>
                <td>{formatDateTime(m.scheduledFor)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[m.status]?.[0] || 'gray'}`}>
                    {STATUS_BADGE[m.status]?.[1] || m.status}
                  </span>
                </td>
                <td>
                  {m.status === 'AGUARDANDO' && (
                    <button className="btn btn-danger" onClick={() => cancel(m.id)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Fila vazia.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
