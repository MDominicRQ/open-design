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

let _daemonOrigin: string | null = null;
function getDaemonOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  if (_daemonOrigin === null) {
    _daemonOrigin = `${window.location.protocol}//${window.location.host}`;
  }
  return _daemonOrigin;
}

function isDaemonApiRequest(url: string): boolean {
  const origin = getDaemonOrigin();
  return Boolean(origin && url.startsWith(origin + '/api/'));
}

function injectBearerHeaders(headers: Headers, token: string): void {
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
}

export function patchGlobalFetch(): void {
  if (typeof window === 'undefined') return;
  const raw = window.fetch;
  if (!raw) return;

  window.fetch = function patchedFetch(
    input: Request | string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const token = getStoredApiToken();

    if (token && isDaemonApiRequest(url)) {
      if (input instanceof Request && input.method !== 'GET' && input.method !== 'HEAD') {
        const clone = new Request(input);
        injectBearerHeaders(clone.headers, token);
        return raw(clone, init);
      }
      const reqInit: RequestInit = init ? { ...init } : {};
      const headers = new Headers(init?.headers);
      injectBearerHeaders(headers, token);
      reqInit.headers = headers;
      const dominated =
        input instanceof Request
          ? new Request(input.url, { ...input, ...reqInit, headers })
          : new Request(url, reqInit);
      return raw(dominated);
    }

    return raw(input, init);
  };
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await globalThis.fetch('/api/app-config', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkDaemonAuthRequired(): Promise<boolean> {
  try {
    const res = await globalThis.fetch('/api/health');
    if (!res.ok) return false;
    const data = (await res.json()) as { auth?: { apiTokenRequired?: boolean } };
    return data?.auth?.apiTokenRequired === true;
  } catch {
    return false;
  }
}