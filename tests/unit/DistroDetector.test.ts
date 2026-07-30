import { describe, expect, it } from 'vitest';
import {
  DistroDetector,
  UnsupportedArchError,
  UnsupportedDistroError,
} from '../../src/main/domain/DistroDetector';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

function makeRunner(overrides?: {
  osRelease?: string;
  arch?: string;
  systemctlPresent?: boolean;
}): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.script('cat /etc/os-release', {
    stdout:
      overrides?.osRelease ??
      'ID=debian\nVERSION_ID=13\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\n',
  });
  runner.script('uname -m', { stdout: `${overrides?.arch ?? 'x86_64'}\n` });
  runner.script('command -v systemctl', {
    code: overrides?.systemctlPresent === false ? 1 : 0,
    stdout: overrides?.systemctlPresent === false ? '' : '/usr/bin/systemctl\n',
  });
  return runner;
}

describe('DistroDetector', () => {
  it('assembles DistroInfo from os-release, uname and systemctl presence', async () => {
    const detector = new DistroDetector(makeRunner());
    const result = await detector.detect();
    expect(result).toEqual({
      id: 'debian',
      versionId: '13',
      prettyName: 'Debian GNU/Linux 13 (trixie)',
      arch: 'x86_64',
      hasSystemd: true,
    });
  });

  it('accepts ubuntu on aarch64', async () => {
    const detector = new DistroDetector(
      makeRunner({
        osRelease: 'ID=ubuntu\nVERSION_ID=24.04\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n',
        arch: 'aarch64',
      }),
    );
    const result = await detector.detect();
    expect(result.id).toBe('ubuntu');
    expect(result.arch).toBe('aarch64');
  });

  it('reports hasSystemd false when systemctl is missing', async () => {
    const detector = new DistroDetector(makeRunner({ systemctlPresent: false }));
    const result = await detector.detect();
    expect(result.hasSystemd).toBe(false);
  });

  it('throws UnsupportedDistroError for centos', async () => {
    const detector = new DistroDetector(makeRunner({ osRelease: 'ID=centos\nVERSION_ID=9\n' }));
    await expect(detector.detect()).rejects.toBeInstanceOf(UnsupportedDistroError);
  });

  it('throws UnsupportedArchError for armv7l', async () => {
    const detector = new DistroDetector(makeRunner({ arch: 'armv7l' }));
    await expect(detector.detect()).rejects.toBeInstanceOf(UnsupportedArchError);
  });
});
