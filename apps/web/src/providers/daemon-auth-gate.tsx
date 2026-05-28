'use client';

import { type ReactNode, useEffect, useState } from 'react';

const STORAGE_KEY = 'od-api-token';

export function getStoredApiToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredApiToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  if (token.trim()) {
    localStorage.setItem(STORAGE_KEY, token.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearStoredApiToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

function ApiTokenInput({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value.trim() }),
        credentials: 'include',
      });
      setLoading(false);
      if (res.ok) {
        setStoredApiToken(value.trim());
        onSubmit(value.trim());
      } else {
        setError('Token inválido o denegado por el daemon. Verificá OD_API_TOKEN en tu despliegue.');
      }
    } catch {
      setLoading(false);
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
  authenticated: boolean;
}

export interface DaemonAuthGateProps {
  children: ReactNode;
}

export function DaemonAuthGate({ children }: DaemonAuthGateProps) {
  const [auth, setAuth] = useState<AuthState>({ checked: false, requiresAuth: false, authenticated: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/health', { credentials: 'include' });
        if (cancelled) return;
        const data = (await res.json()) as { auth?: { apiTokenRequired?: boolean } };
        const requiresAuth = data?.auth?.apiTokenRequired === true;
        if (cancelled) return;
        if (!requiresAuth) {
          setAuth({ checked: true, requiresAuth: false, authenticated: true });
          return;
        }
        const token = getStoredApiToken();
        if (!token) {
          setAuth({ checked: true, requiresAuth: true, authenticated: false });
          return;
        }
        const validateRes = await fetch('/api/app-config', {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (validateRes.ok) {
          setAuth({ checked: true, requiresAuth: true, authenticated: true });
        } else if (validateRes.status === 401) {
          setAuth({ checked: true, requiresAuth: true, authenticated: false });
        } else {
          setAuth({ checked: true, requiresAuth: true, authenticated: false });
        }
      } catch {
        if (!cancelled) {
          setAuth({ checked: true, requiresAuth: false, authenticated: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!auth.checked) return <LoadingScreen />;

  if (auth.requiresAuth && !auth.authenticated) {
    return <ApiTokenInput onSubmit={() => {
      setAuth({ checked: true, requiresAuth: true, authenticated: true });
    }} />;
  }

  return <>{children}</>;
}