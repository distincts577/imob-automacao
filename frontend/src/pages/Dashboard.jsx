import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
const STAGE_LABELS_PT = {
  LEAD: 'Lead',
  ATENDIMENTO: 'Atendimento',
  VISITA_APROVACAO: 'Visita/Aprov.',
  CLIENTE_APROVADO: 'Aprovado',
  FECHAMENTO: 'Fechamento',
};
import { api } from '../api/client';

const COLORS = ['#4f46e5', '#16a34a', '#d97706', '#dc2626', '#0ea5e9', '#a855f7'];

const CARD_DEFS = [
  ['totalLeads', 'Total de leads'],
  ['awaitingFirstContact', 'Aguardando 1º contato'],
  ['inAtendimento', 'Em atendimento'],
  ['awaitingVisita', 'Aguardando visita'],
  ['inAprovacao', 'Em aprovação'],
  ['aprovados', 'Clientes aprovados'],
  ['fechamento', 'Em fechamento'],
  ['sentToday', 'Mensagens enviadas hoje'],
  ['pending', 'Mensagens pendentes'],
  ['withError', 'Mensagens com erro'],
  ['repliedClients', 'Clientes que responderam'],
  ['activeAutomations', 'Automações ativas'],
];

function toSeries(map) {
  return Object.entries(map || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: date.slice(5), value }));
}

export default function Dashboard() {
  const [summary, setSummary] = useState({});
  const [charts, setCharts] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    api.get('/dashboard/summary').then(setSummary);
    api.get('/dashboard/charts').then(setCharts);
    api.get('/dashboard/recent-activity').then(setActivity);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>

      <div className="grid-cards">
        {CARD_DEFS.map(([key, label]) => (
          <div key={key} className="card metric-card">
            <div className="label">{label}</div>
            <div className="value">{summary[key] ?? '—'}</div>
          </div>
        ))}
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Leads por dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={toSeries(charts?.leadsByDay)}>
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Mensagens enviadas por dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={toSeries(charts?.messagesByDay)}>
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Respostas dos clientes</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={toSeries(charts?.repliesByDay)}>
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#d97706" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Conversão por etapa</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(charts?.conversionByStage || []).map((c) => ({ ...c, label: STAGE_LABELS_PT[c.stage] || c.stage }))}>
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} unit="%" />
              <Tooltip formatter={(value, name, item) => [`${value}% (${item.payload.reached} clientes)`, 'Conversão']} />
              <Bar dataKey="rate" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Clientes por etapa do funil</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={charts?.stageDistribution || []}
                dataKey="count"
                nameKey="stage"
                outerRadius={80}
                label
              >
                {(charts?.stageDistribution || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Atividades recentes</h3>
        <table>
          <tbody>
            {activity.map((log) => (
              <tr key={log.id}>
                <td style={{ width: 140, color: 'var(--text-muted)' }}>
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </td>
                <td>{describeLog(log)}</td>
              </tr>
            ))}
            {activity.length === 0 && (
              <tr>
                <td colSpan={2} style={{ color: 'var(--text-muted)' }}>
                  Nenhuma atividade ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeLog(log) {
  const map = {
    MESSAGE_SENT: 'Mensagem enviada',
    MESSAGE_SKIPPED: `Mensagem não enviada (${log.details?.reason || ''})`,
    MESSAGE_ERROR: `Erro ao enviar mensagem (${log.details?.error || ''})`,
    CLIENT_REPLIED: 'Cliente respondeu',
    STAGE_CHANGED: `Cliente mudou de etapa: ${log.details?.fromStage || '—'} → ${log.details?.toStage}`,
    AUTOMATION_PAUSED: `Automação pausada${log.user?.name ? ' por ' + log.user.name : ''}`,
    AUTOMATION_RESUMED: 'Automação retomada',
    AUTOMATION_CANCELLED: 'Automação cancelada',
  };
  return map[log.action] || log.action;
}
