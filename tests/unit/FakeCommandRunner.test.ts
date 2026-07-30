import { describe, expect, it } from 'vitest';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

describe('FakeCommandRunner', () => {
  it('returns a scripted result for an exact command match', async () => {
    const runner = new FakeCommandRunner();
    runner.script('uname -m', { stdout: 'x86_64\n' });

    const result = await runner.run('uname -m');

    expect(result.stdout).toBe('x86_64\n');
    expect(result.code).toBe(0);
    expect(runner.calls).toEqual(['uname -m']);
  });

  it('falls back to the default result for unscripted commands', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 1, stderr: 'not found' });

    const result = await runner.run('whoami');

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('not found');
  });
});
