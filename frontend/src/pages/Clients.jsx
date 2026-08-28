import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateTime } from '../lib/datetime';

const STAGE_LABELS = {
  LEAD: 'Lead',
  ATENDIMENTO: 'Atendimento',
  VISITA_APROVACAO: 'Visita / Aprovação',
  CLIENTE_APROVADO: 'Cliente aprovado',
  FECHAMENTO: 'Fechamento',
  PERDIDO: 'Perdido',
};

const STAGE_BADGE = {
  LEAD: 'gray',
  ATENDIMENTO: 'blue',
  VISITA_APROVACAO: 'yellow',
  CLIENTE_APROVADO: 'green',
  FECHAMENTO: 'purple',
  PERDIDO: 'red',
};

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState({ name: '', phone: '', stage: '' });

  async function load() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const data = await api.get(`/clients?${params.toString()}`);
    setClients(data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Clientes</h2>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Nome</label>
            <input value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Telefone</label>
            <input value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Etapa</label>
            <select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-primary" onClick={load}>Filtrar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Corretor</th>
              <th>Imóvel</th>
              <th>Etapa</th>
              <th>Última interação</th>
              <th>Automação</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.broker?.name || '—'}</td>
                <td>{c.deals?.[0]?.property?.title || '—'}</td>
                <td>
                  <span className={`badge ${STAGE_BADGE[c.currentStage]}`}>
                    {STAGE_LABELS[c.currentStage]}
                  </span>
                </td>
                <td>{c.lastInteractionAt ? formatDateTime(c.lastInteractionAt) : '—'}</td>
                <td>{c.automationSequences?.[0]?.status || '—'}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--text-muted)' }}>Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
