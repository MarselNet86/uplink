import { describe, expect, it } from 'vitest';
import { parseIsActive } from '../../src/main/domain/parsers/systemctl';

describe('parseIsActive', () => {
  it.each([
    ['active\n', 'active'],
    ['inactive\n', 'inactive'],
    ['failed\n', 'failed'],
    ['activating\n', 'activating'],
    ['deactivating\n', 'deactivating'],
  ] as const)('parses %j as %s', (stdout, expected) => {
    expect(parseIsActive(stdout)).toBe(expected);
  });

  it('falls back to unknown for unrecognized output', () => {
    expect(parseIsActive('bogus\n')).toBe('unknown');
    expect(parseIsActive('')).toBe('unknown');
  });
});
