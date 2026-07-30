import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shellQuote } from '../../src/main/security/shellQuote';

describe('shellQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellQuote('hello')).toBe("'hello'");
  });

  it('escapes embedded single quotes', () => {
    expect(shellQuote("it's a test")).toBe("'it'\\''s a test'");
  });

  const dangerous = [
    "it's a test",
    "'; rm -rf / #",
    '$(echo pwned)',
    '`echo pwned`',
    'a && echo pwned',
    'a | echo pwned',
    '\n echo pwned',
  ];

  it.each(dangerous)('round-trips %j through sh -c as a single literal argument', (value) => {
    // The only reliable check for shell-quoting correctness is asking a real
    // shell to parse it back: echo "$1" with our quoted value spliced in as
    // the whole command must reproduce the original string byte for byte,
    // proving nothing inside it was interpreted as shell syntax.
    const output = execFileSync('/bin/sh', ['-c', `echo ${shellQuote(value)}`]).toString();
    expect(output).toBe(`${value}\n`);
  });
});
