import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const MENU = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/clientes', label: 'Clientes', icon: '👥' },
  { to: '/automacoes', label: 'Automações', icon: '🤖' },
  { to: '/mensagens', label: 'Mensagens', icon: '💬' },
  { to: '/fila', label: 'Fila de mensagens', icon: '📨' },
  { to: '/logs', label: 'Logs', icon: '📋' },
  { to: '/integracoes', label: 'Integrações', icon: '🔌' },
  { to: '/configuracoes', label: 'Configurações', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
          <h1>🏠 Automação Imobiliária</h1>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            aria-label="Alternar tema"
            style={{
              background: 'var(--btn-secondary-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              marginBottom: 16,
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <nav>
          {MENU.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ position: 'absolute', bottom: 16, left: 12, right: 12, fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted)' }}>{user?.name}</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{user?.role}</div>
          <button className="btn btn-secondary" onClick={logout} style={{ width: '100%' }}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
