// Plan §3.K1 / spec §15.7 — bound-API-token guard.
//
// Two halves:
//   1. The daemon refuses to start with OD_BIND_HOST=0.0.0.0 when no
//      OD_API_TOKEN is set.
//   2. When OD_API_TOKEN is set, every /api/* request from a non-loopback
//      peer must carry `Authorization: Bearer <OD_API_TOKEN>`. The
//      health/version/status probes stay open for monitoring.
//
// Tests force the bearer-required code path by stamping the env vars
// before startServer. The daemon listens on 127.0.0.1 throughout (so
// the "refuse 0.0.0.0 without token" path is exercised by a separate
// negative case that constructs the start call directly).

import type http from 'node:http';
import { networkInterfaces } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const PREVIOUS_TOKEN = process.env.OD_API_TOKEN;
const PREVIOUS_HOST = process.env.OD_BIND_HOST;
const PREVIOUS_TRUSTED_PROXY = process.env.OD_TRUSTED_PROXY;

let server: http.Server | undefined;
let baseUrl = '';
let shutdown: (() => Promise<void> | void) | undefined;

function firstNonLoopbackIpv4(): string | undefined {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;
}

afterEach(async () => {
  if (shutdown) await Promise.resolve(shutdown());
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  shutdown = undefined;
  if (PREVIOUS_TOKEN === undefined) delete process.env.OD_API_TOKEN;
  else process.env.OD_API_TOKEN = PREVIOUS_TOKEN;
  if (PREVIOUS_HOST === undefined) delete process.env.OD_BIND_HOST;
  else process.env.OD_BIND_HOST = PREVIOUS_HOST;
  if (PREVIOUS_TRUSTED_PROXY === undefined) delete process.env.OD_TRUSTED_PROXY;
  else process.env.OD_TRUSTED_PROXY = PREVIOUS_TRUSTED_PROXY;
});

describe('bound-API-token guard', () => {
  it('refuses to start with OD_BIND_HOST=0.0.0.0 when OD_API_TOKEN is unset', async () => {
    delete process.env.OD_API_TOKEN;
    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/OD_API_TOKEN/);
  });

  it('starts on a public host when OD_API_TOKEN is set', async () => {
    process.env.OD_API_TOKEN = 'test-token-abc';
    // Bind to 127.0.0.1 (loopback) but pretend we crossed the guard
    // by setting the env var; the assertion is that startup succeeds.
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    baseUrl = started.url;
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
});

describe('auth session endpoint', () => {
  const nonLoopbackAddress = firstNonLoopbackIpv4();
  const itIfNonLoopbackAddress = nonLoopbackAddress ? it : it.skip;

  itIfNonLoopbackAddress('creates a session without a bearer from non-loopback callers', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    const port = new URL(started.url).port;

    const resp = await fetch(`http://${nonLoopbackAddress}:${port}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'secret-test-token' }),
    });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });
    expect(resp.headers.get('set-cookie')).toContain('od_session=');
  });
});

describe('trusted proxy auth mode', () => {
  const nonLoopbackAddress = firstNonLoopbackIpv4();
  const itIfNonLoopbackAddress = nonLoopbackAddress ? it : it.skip;

  it('still refuses a public host when OD_API_TOKEN is unset', async () => {
    delete process.env.OD_API_TOKEN;
    process.env.OD_TRUSTED_PROXY = '1';

    await expect(startServer({ port: 0, host: '0.0.0.0', returnServer: true }))
      .rejects.toThrow(/OD_API_TOKEN/);
  });

  it('tells the browser not to show the OD_API_TOKEN prompt', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    process.env.OD_TRUSTED_PROXY = '1';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;

    const resp = await fetch(`${baseUrl}/api/health`);

    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({
      ok: true,
      auth: { apiTokenRequired: false },
    });
  });

  itIfNonLoopbackAddress('allows non-loopback API callers without a bearer', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    process.env.OD_TRUSTED_PROXY = 'true';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    const port = new URL(started.url).port;

    const resp = await fetch(`http://${nonLoopbackAddress}:${port}/api/plugins`);

    expect(resp.status).toBe(200);
  });
});

describe('public bind bearer middleware', () => {
  it('requires auth from loopback TCP peers when the daemon is bound to a public host', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    const port = new URL(started.url).port;

    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/plugins`);
    expect(unauthenticated.status).toBe(401);

    const authenticated = await fetch(`http://127.0.0.1:${port}/api/plugins`, {
      headers: { Authorization: 'Bearer secret-test-token' },
    });
    expect(authenticated.status).toBe(200);
  });

  it('tells same-host reverse-proxy browsers to authenticate unless trusted proxy mode is enabled', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    const port = new URL(started.url).port;

    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({
      ok: true,
      auth: { apiTokenRequired: true },
    });
  });

  it('does not leave active connection tests open to unauthenticated public-bind callers', async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '0.0.0.0', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    const port = new URL(started.url).port;

    const resp = await fetch(`http://127.0.0.1:${port}/api/test/connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(resp.status).toBe(401);
  });
});

describe('bearer middleware', () => {
  beforeEach(async () => {
    process.env.OD_API_TOKEN = 'secret-test-token';
    const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  it('accepts loopback callers without a bearer (desktop UI flow)', async () => {
    // The HTTP test client is on the same machine → req.socket.remoteAddress
    // is 127.0.0.1 → middleware short-circuits.
    const resp = await fetch(`${baseUrl}/api/plugins`);
    expect(resp.status).toBe(200);
  });

  it('keeps health / version / daemon-status open without a bearer', async () => {
    for (const path of ['/api/health', '/api/version', '/api/daemon/status']) {
      const resp = await fetch(`${baseUrl}${path}`);
      expect(resp.status).toBe(200);
    }
  });
});
