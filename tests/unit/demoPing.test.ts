import { describe, expect, it } from 'vitest';
import { demoPingRequestSchema } from '@shared/schemas';

describe('demoPingRequestSchema', () => {
  it('accepts a well-formed payload', () => {
    const parsed = demoPingRequestSchema.parse({ message: 'ping' });
    expect(parsed.message).toBe('ping');
  });
});
