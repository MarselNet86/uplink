import { describe, expect, it } from 'vitest';
import { ProtocolDetector } from '../../src/main/domain/ProtocolDetector';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

describe('ProtocolDetector', () => {
  it('reports absent when neither binary nor config exist', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 1 });
    const [xray, hy2] = await new ProtocolDetector(runner).detect();
    expect(xray).toEqual({ protocol: 'vless-reality', state: 'absent', serviceActive: false });
    expect(hy2).toEqual({ protocol: 'hysteria2', state: 'absent', serviceActive: false });
  });

  it('reports installed when binary, config and active service all agree', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script('systemctl is-active xray', { code: 0, stdout: 'active\n' });
    runner.script(
      `grep -q '"security"[[:space:]]*:[[:space:]]*"reality"' /usr/local/etc/xray/config.json`,
      { code: 0 },
    );
    runner.script('systemctl is-active hysteria-server.service', { code: 0, stdout: 'active\n' });

    const [xray, hy2] = await new ProtocolDetector(runner).detect();
    expect(xray).toEqual({ protocol: 'vless-reality', state: 'installed', serviceActive: true });
    expect(hy2).toEqual({ protocol: 'hysteria2', state: 'installed', serviceActive: true });
  });

  it('reports broken when files exist but the service is not active', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script('systemctl is-active hysteria-server.service', { code: 3, stdout: 'inactive\n' });

    const [, hy2] = await new ProtocolDetector(runner).detect();
    expect(hy2).toEqual({ protocol: 'hysteria2', state: 'broken', serviceActive: false });
  });

  it('reports foreign when Xray is installed without a reality stream', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script('systemctl is-active xray', { code: 0, stdout: 'active\n' });
    runner.script(
      `grep -q '"security"[[:space:]]*:[[:space:]]*"reality"' /usr/local/etc/xray/config.json`,
      { code: 1 },
    );

    const [xray] = await new ProtocolDetector(runner).detect();
    expect(xray).toEqual({ protocol: 'vless-reality', state: 'foreign', serviceActive: true });
  });
});
