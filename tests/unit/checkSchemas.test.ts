import { describe, expect, it } from 'vitest';
import { checkRequestSchema, checkResultSchema } from '@shared/schemas';

describe('checkRequestSchema', () => {
  it('accepts a well-formed self-signed request', () => {
    expect(() =>
      checkRequestSchema.parse({
        credentials: { host: '203.0.113.10', port: 22, username: 'root', password: 'secret' },
        params: { distroHint: 'auto', tlsMode: 'self-signed' },
      }),
    ).not.toThrow();
  });

  it('rejects acme-domain without domain and acmeEmail', () => {
    expect(() =>
      checkRequestSchema.parse({
        credentials: { host: '203.0.113.10', port: 22, username: 'root', password: 'secret' },
        params: { distroHint: 'auto', tlsMode: 'acme-domain' },
      }),
    ).toThrow();
  });

  it('rejects an out-of-range port', () => {
    expect(() =>
      checkRequestSchema.parse({
        credentials: { host: '203.0.113.10', port: 70000, username: 'root', password: 'secret' },
        params: { distroHint: 'auto', tlsMode: 'self-signed' },
      }),
    ).toThrow();
  });
});

describe('checkResultSchema', () => {
  it('accepts a well-formed result', () => {
    const result = {
      sessionId: 's1',
      distro: {
        id: 'debian',
        versionId: '13',
        prettyName: 'Debian GNU/Linux 13 (trixie)',
        arch: 'x86_64',
        hasSystemd: true,
      },
      preflight: {
        items: [{ id: 'privileges', status: 'ok' }],
        passed: true,
      },
      protocols: [{ protocol: 'vless-reality', state: 'absent', serviceActive: false }],
    };
    expect(checkResultSchema.parse(result)).toEqual(result);
  });

  it('rejects an unknown protocol state', () => {
    expect(() =>
      checkResultSchema.parse({
        sessionId: 's1',
        distro: {
          id: 'debian',
          versionId: '13',
          prettyName: 'Debian',
          arch: 'x86_64',
          hasSystemd: true,
        },
        preflight: { items: [], passed: true },
        protocols: [{ protocol: 'vless-reality', state: 'bogus', serviceActive: false }],
      }),
    ).toThrow();
  });
});
