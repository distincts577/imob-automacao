import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Logs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/logs').then(setLogs);
  }, []);

  return (
    <div>
      <div className="page-header"><h2>Logs</h2></div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Data</th><th>Ação</th><th>Detalhes</th><th>Usuário</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ width: 160 }}>{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                <td>{l.action}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {l.details ? JSON.stringify(l.details) : '—'}
                </td>
                <td>{l.user?.name || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>Nenhum log ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
