import { describe, expect, it } from 'vitest';

import { resolveApiTokenRequiredForRequest } from '../src/server';

describe('resolveApiTokenRequiredForRequest', () => {
  it('does not require the browser token when the daemon already exempts a loopback proxy', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: false,
        remoteAddress: '127.0.0.1',
      }),
    ).toBe(false);
  });

  it('requires the browser token for non-loopback peers when trusted proxy auth is not enabled', () => {
    expect(
      resolveApiTokenRequiredForRequest({
        apiToken: 'configured-token',
        trustedProxyAuth: false,
        remoteAddress: '203.0.113.10',
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
