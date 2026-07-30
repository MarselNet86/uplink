import { describe, expect, it } from 'vitest';
import { appendCapped } from '../../src/main/ssh/outputBuffer';

describe('appendCapped', () => {
  it('appends without truncation while under the cap', () => {
    expect(appendCapped('foo', 'bar', 256)).toBe('foobar');
  });

  it('drops from the start once the cap is exceeded', () => {
    const result = appendCapped('12345', '6789', 6);
    expect(result).toBe('456789');
    expect(Buffer.byteLength(result, 'utf8')).toBe(6);
  });

  it('never exceeds maxBytes even for a single oversized chunk', () => {
    const result = appendCapped('', 'x'.repeat(1000), 256);
    expect(Buffer.byteLength(result, 'utf8')).toBe(256);
  });
});
