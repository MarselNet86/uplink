import { describe, expect, it } from 'vitest';
import {
  buildDeployParams,
  deriveAutoAcmeEmail,
  deriveAutoDomain,
  validateConnectForm,
} from '@renderer/features/connect/formValidation';
import type { ConnectFormValues } from '@renderer/features/connect/formValidation';

describe('deriveAutoDomain', () => {
  it('appends the sslip.io wildcard suffix to an IPv4 host', () => {
    expect(deriveAutoDomain('89.124.66.71')).toBe('89.124.66.71.sslip.io');
  });

  it('trims surrounding whitespace before checking the host', () => {
    expect(deriveAutoDomain('  89.124.66.71  ')).toBe('89.124.66.71.sslip.io');
  });

  it('reuses a host that is already a domain as-is', () => {
    expect(deriveAutoDomain('vpn.example.com')).toBe('vpn.example.com');
  });

  it('returns empty for an IPv6 host - sslip.io needs dash-encoding, out of scope', () => {
    expect(deriveAutoDomain('2001:db8::1')).toBe('');
  });

  it('returns empty for a bare hostname with no dot', () => {
    expect(deriveAutoDomain('localhost')).toBe('');
  });
});

describe('deriveAutoAcmeEmail', () => {
  it('builds a syntactically valid placeholder from the domain', () => {
    expect(deriveAutoAcmeEmail('89.124.66.71.sslip.io')).toBe('admin@89.124.66.71.sslip.io');
  });
});

describe('validateConnectForm - domain fields', () => {
  const base: ConnectFormValues = {
    host: '89.124.66.71',
    port: '22',
    username: 'root',
    password: 'secret',
    domainOverride: false,
    domain: '',
    acmeEmail: '',
    realitySni: '',
    hysteriaSni: '',
  };

  it('does not require domain/acmeEmail when domainOverride is off, even if both are empty', () => {
    const errors = validateConnectForm(base);
    expect(errors.domain).toBeUndefined();
    expect(errors.acmeEmail).toBeUndefined();
  });

  it('requires a valid domain and email once domainOverride is on', () => {
    const errors = validateConnectForm({ ...base, domainOverride: true });
    expect(errors.domain).toBeDefined();
    expect(errors.acmeEmail).toBeDefined();
  });

  it('accepts a well-formed custom domain and email', () => {
    const errors = validateConnectForm({
      ...base,
      domainOverride: true,
      domain: 'vpn.example.com',
      acmeEmail: 'you@example.com',
    });
    expect(errors.domain).toBeUndefined();
    expect(errors.acmeEmail).toBeUndefined();
  });
});

describe('buildDeployParams', () => {
  const base = {
    host: '89.124.66.71',
    port: '22',
    username: 'root',
    password: 'secret',
    domainOverride: false,
    domain: '',
    acmeEmail: '',
    realitySni: '',
    hysteriaSni: '',
  };

  it('defaults an IPv4 host to acme-domain on its sslip.io name', () => {
    expect(buildDeployParams(base)).toEqual({
      distroHint: 'auto',
      tlsMode: 'acme-domain',
      domain: '89.124.66.71.sslip.io',
      acmeEmail: 'admin@89.124.66.71.sslip.io',
    });
  });

  // BUG-07: the auto domain used to be computed regardless of the checkbox,
  // so a domain the user typed themselves never reached the server.
  it('uses the typed domain and email when the checkbox is on', () => {
    expect(
      buildDeployParams({
        ...base,
        domainOverride: true,
        domain: '  vpn.example.com  ',
        acmeEmail: ' me@example.com ',
      }),
    ).toEqual({
      distroHint: 'auto',
      tlsMode: 'acme-domain',
      domain: 'vpn.example.com',
      acmeEmail: 'me@example.com',
    });
  });

  it('falls back to self-signed when no domain can be derived', () => {
    expect(buildDeployParams({ ...base, host: '2001:db8::1' })).toEqual({
      distroHint: 'auto',
      tlsMode: 'self-signed',
    });
  });

  it('reuses a host that is already a domain rather than suffixing it', () => {
    expect(buildDeployParams({ ...base, host: 'vpn.example.com' })).toMatchObject({
      tlsMode: 'acme-domain',
      domain: 'vpn.example.com',
    });
  });

  it('passes both SNI overrides through and omits the empty ones', () => {
    expect(buildDeployParams({ ...base, realitySni: ' www.cloudflare.com ' })).toMatchObject({
      realitySni: 'www.cloudflare.com',
    });
    expect(buildDeployParams(base)).not.toHaveProperty('realitySni');
    expect(buildDeployParams(base)).not.toHaveProperty('hysteriaSni');
  });
});
