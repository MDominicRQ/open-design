import { describe, expect, it } from 'vitest';

import { resolveApiTokenRequiredForRequest } from '../src/server.js';

describe('resolveApiTokenRequiredForRequest', () => {
  it('does not require the browser token when a loopback-bound daemon already exempts a loopback caller', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: false,
        remoteAddress: '127.0.0.1',
        loopbackApiBypassAllowed: true,
      }),
    ).toBe(false);
  });

  it('requires the browser token for loopback peers when the daemon is publicly bound', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: false,
        remoteAddress: '127.0.0.1',
        loopbackApiBypassAllowed: false,
      }),
    ).toBe(true);
  });

  it('requires the browser token for non-loopback peers when trusted proxy auth is not enabled', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: false,
        remoteAddress: '203.0.113.10',
        loopbackApiBypassAllowed: true,
      }),
    ).toBe(true);
  });

  it('does not require the browser token when auth is delegated to a trusted proxy', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: true,
        remoteAddress: '203.0.113.10',
      }),
    ).toBe(false);
  });
});
