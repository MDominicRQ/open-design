'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  checkDaemonAuthRequired,
  getStoredApiToken,
  patchGlobalFetch,
  setStoredApiToken,
  validateToken,
} from '../../src/utils/daemon-auth';

function ApiTokenInput({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setError('');
    setLoading(true);
    const valid = await validateToken(value.trim());
    setLoading(false);
    if (valid) {
      setStoredApiToken(value.trim());
      onSubmit(value.trim());
    } else {
      setError('Token inválido o denegado por el daemon. Verificá OD_API_TOKEN en tu despliegue.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px',
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Open Design</h1>
        <p style={{ color: '#a0a0a0', marginBottom: 32, fontSize: 14 }}>
          Este despliegue requiere un token de acceso. Configurá <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>OD_API_TOKEN</code> en tu{' '}
          <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>docker-compose.yml</code> y pegalo abajo.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="OD_API_TOKEN"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: error ? 8 : 16,
            }}
          />
          {error && (
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#1d4ed8' : '#2563eb',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verificando…' : 'Conectar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      gap: 12,
    }}>
      <span>Cargando Open Design…</span>
    </div>
  );
}

interface AuthState {
  checked: boolean;
  requiresAuth: boolean;
  tokenValid: boolean;
}

const App = dynamic(() => import('../../src/App').then((m) => m.App), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export function ClientApp() {
  const [auth, setAuth] = useState<AuthState>({ checked: false, requiresAuth: false, tokenValid: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const requiresAuth = await checkDaemonAuthRequired();
      if (cancelled) return;
      const token = getStoredApiToken();
      const tokenValid = token ? await validateToken(token) : false;
      if (cancelled) return;
      setAuth({ checked: true, requiresAuth, tokenValid });
    })();
    return () => { cancelled = true; };
  }, []);

  if (!auth.checked) return <LoadingScreen />;

  if (auth.requiresAuth && !auth.tokenValid) {
    return <ApiTokenInput onSubmit={() => {
      patchGlobalFetch();
      setAuth({ checked: true, requiresAuth: true, tokenValid: true });
    }} />;
  }

  patchGlobalFetch();

  return <App />;
}