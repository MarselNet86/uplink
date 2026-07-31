import { describe, expect, it } from 'vitest';
import { buildVlessLink } from '../../src/main/domain/LinkBuilder';

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
        'sni=www.microsoft.com&fp=chrome&pbk=p8MIhWYnijydf3ofqPlnf3p7OquIyXn99yU5WB5y0zo&' +
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
