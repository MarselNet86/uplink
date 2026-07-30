import { describe, expect, it } from 'vitest';
import { hostKeyPromptEventSchema, hostkeyConfirmRequestSchema } from '@shared/schemas';

describe('hostkeyConfirmRequestSchema', () => {
  it('accepts a well-formed confirm payload', () => {
    const parsed = hostkeyConfirmRequestSchema.parse({ promptId: 'p1', accepted: true });
    expect(parsed).toEqual({ promptId: 'p1', accepted: true });
  });

  it('rejects a payload missing accepted', () => {
    expect(() => hostkeyConfirmRequestSchema.parse({ promptId: 'p1' })).toThrow();
  });
});

describe('hostKeyPromptEventSchema', () => {
  it('accepts a well-formed prompt event', () => {
    const parsed = hostKeyPromptEventSchema.parse({
      promptId: 'p1',
      host: '203.0.113.10',
      fingerprint: 'AABBCC',
      known: false,
    });
    expect(parsed.known).toBe(false);
  });

  it('rejects an empty fingerprint', () => {
    expect(() =>
      hostKeyPromptEventSchema.parse({ promptId: 'p1', host: 'h', fingerprint: '', known: true }),
    ).toThrow();
  });
});
