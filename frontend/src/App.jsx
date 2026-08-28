import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Automations from './pages/Automations';
import Messages from './pages/Messages';
import Queue from './pages/Queue';
import Logs from './pages/Logs';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="automacoes" element={<Automations />} />
        <Route path="mensagens" element={<Messages />} />
        <Route path="fila" element={<Queue />} />
        <Route path="logs" element={<Logs />} />
        <Route path="integracoes" element={<Integrations />} />
        <Route path="configuracoes" element={<Settings />} />
      </Route>
    </Routes>
  );
}
