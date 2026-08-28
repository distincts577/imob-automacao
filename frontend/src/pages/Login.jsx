import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page" style={{ position: 'relative' }}>
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label="Alternar tema"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'var(--btn-secondary-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: 34,
          height: 34,
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <form className="card login-box" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>🏠 Automação Imobiliária</h2>
        <div className="field">
          <label>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
          Entrar
        </button>
      </form>
    </div>
  );
}
