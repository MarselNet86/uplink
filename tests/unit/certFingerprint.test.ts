import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCertFingerprint } from '../../src/main/domain/parsers/certFingerprint';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../fixtures', name), 'utf8');

describe('parseCertFingerprint', () => {
  it('strips colons and upper-cases the fingerprint', () => {
    const result = parseCertFingerprint(fixture('cert-fingerprint.txt'));
    expect(result).toBe('123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0');
    expect(result).not.toContain(':');
  });

  it('throws on unrecognized output instead of returning garbage', () => {
    expect(() => parseCertFingerprint('nonsense output\n')).toThrow(/unrecognized/);
  });
});
