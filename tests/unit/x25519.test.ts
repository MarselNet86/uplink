import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseX25519Output } from '../../src/main/domain/parsers/x25519';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../fixtures', name), 'utf8');

describe('parseX25519Output', () => {
  it('parses the old "Private key:"/"Public key:" format', () => {
    const result = parseX25519Output(fixture('x25519-old.txt'));
    expect(result).toEqual({
      privateKey: '8CqM3hyBcCVn6UwsPeC5H2sIVfIn2ihcgOsIm6X7-Wo',
      publicKey: 'iXTgpxaqUAETSGxeetEfLpq_2r0N2CGssPRfnpwR6Bg',
    });
  });

  it('parses the v25.3.6+ "PrivateKey:"/"Password:" format and ignores Hash32', () => {
    const result = parseX25519Output(fixture('x25519-new.txt'));
    expect(result).toEqual({
      privateKey: 'gK-kaFsAVDgpqxs3rzuAOVI9pF-YSC5Y7GK8s0LMDkY',
      publicKey: 'p8MIhWYnijydf3ofqPlnf3p7OquIyXn99yU5WB5y0zo',
    });
    expect(Object.values(result)).not.toContain('3wZ2xkxT7O6qYb1DcZjBw3Sk9NcVoV1eZTGqDxHUV6E');
  });

  it('throws on unrecognized output instead of returning a partial pair', () => {
    expect(() => parseX25519Output('nonsense output\n')).toThrow(/unrecognized/);
  });
});
