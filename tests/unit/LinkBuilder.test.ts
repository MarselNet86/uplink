import { describe, expect, it } from 'vitest';
import {
  buildHysteria2AcmeLink,
  buildHysteria2SelfSignedLink,
  buildVlessLink,
} from '../../src/main/domain/LinkBuilder';

describe('buildVlessLink', () => {
  it('matches the exact format from tech.md 5.9', () => {
    const link = buildVlessLink({
      uuid: '8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90',
      host: '203.0.113.7',
      sni: 'www.microsoft.com',
      publicKey: 'p8MIhWYnijydf3ofqPlnf3p7OquIyXn99yU5WB5y0zo',
      shortId: 'a1b2c3d4e5f60718',
    });

    expect(link).toBe(
      'vless://8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90@203.0.113.7:443?' +
        'type=tcp&security=reality&encryption=none&flow=xtls-rprx-vision&' +
        'sni=www.microsoft.com&fp=firefox&pbk=p8MIhWYnijydf3ofqPlnf3p7OquIyXn99yU5WB5y0zo&' +
        'sid=a1b2c3d4e5f60718&spx=%2F#Uplink-VLESS',
    );
  });

  it('percent-encodes special characters instead of breaking the URL', () => {
    const link = buildVlessLink({
      uuid: 'uuid with spaces',
      host: '203.0.113.7',
      sni: 'donor.example',
      publicKey: 'pk',
      shortId: 'sid',
    });

    expect(link).toContain('vless://uuid%20with%20spaces@');
    expect(link).not.toContain(' ');
  });

  it('is a pure function: same params always produce the same link', () => {
    const params = {
      uuid: 'u',
      host: 'h',
      sni: 's',
      publicKey: 'pk',
      shortId: 'sid',
    };
    expect(buildVlessLink(params)).toBe(buildVlessLink(params));
  });
});

describe('buildHysteria2SelfSignedLink', () => {
  const params = {
    password: 'p@ss/word',
    host: '203.0.113.7',
    sni: 'bing.com',
    fingerprintSha256: '123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0',
  };

  it('matches the exact format from tech.md 5.9', () => {
    const link = buildHysteria2SelfSignedLink(params);
    expect(link).toBe(
      'hy2://p%40ss%2Fword@203.0.113.7:443?' +
        'sni=bing.com&pinSHA256=123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0' +
        '#Uplink-HY2',
    );
  });

  // Xray-core refuses the entire config, not just this outbound, when it
  // sees allowInsecure past its 2026-06-01 removal date - so the parameter
  // must never reach INCY/Happ/v2rayN.
  it('never emits insecure, which Xray-core rejects outright', () => {
    expect(buildHysteria2SelfSignedLink(params)).not.toContain('insecure');
  });

  // The pin is the only thing that makes a nobody-issued certificate
  // acceptable once insecure is gone; a link without it cannot connect.
  it('always carries the pin', () => {
    expect(buildHysteria2SelfSignedLink(params)).toContain(`pinSHA256=${params.fingerprintSha256}`);
  });

  it('percent-encodes the password as the user-info component', () => {
    const link = buildHysteria2SelfSignedLink({ ...params, password: 'a b/c' });
    expect(link).toContain('hy2://a%20b%2Fc@');
  });
});

describe('buildHysteria2AcmeLink', () => {
  it('matches the exact format from tech.md 5.9: trusted cert, no pin', () => {
    const link = buildHysteria2AcmeLink({ password: 'secret', domain: 'vpn.example.com' });
    expect(link).toBe('hy2://secret@vpn.example.com:443?sni=vpn.example.com&insecure=0#Uplink-HY2');
  });

  it('percent-encodes the password', () => {
    const link = buildHysteria2AcmeLink({ password: 'a b', domain: 'vpn.example.com' });
    expect(link).toContain('hy2://a%20b@');
  });
});
