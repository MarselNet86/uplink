import { describe, expect, it } from 'vitest';
import { XRAY_REMOVE_SCRIPT, XrayRemover } from '../../src/main/domain/removers/XrayRemover';
import {
  HY2_REMOVE_SCRIPT,
  Hysteria2Remover,
} from '../../src/main/domain/removers/Hysteria2Remover';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

describe('XrayRemover', () => {
  it('runs the official script and reports success when the binary is gone', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script('test -x /usr/local/bin/xray', { code: 1 });

    const remover = new XrayRemover(runner, '203.0.113.10');
    const result = await remover.buildStep().run({ isCancelled: () => false });
    void result;

    expect(runner.calls).toContain(XRAY_REMOVE_SCRIPT);
    expect(runner.calls).not.toContain('systemctl disable --now xray');
    expect(remover.getOutcome()).toEqual({ protocol: 'vless-reality', ok: true });
  });

  it('falls back to manual cleanup when the official script fails', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script(XRAY_REMOVE_SCRIPT, { code: 1 });
    runner.script('test -x /usr/local/bin/xray', { code: 1 });

    const remover = new XrayRemover(runner, '203.0.113.10');
    await remover.buildStep().run({ isCancelled: () => false });

    expect(runner.calls).toContain('systemctl disable --now xray');
    expect(runner.calls).toContain('rm -f /usr/local/bin/xray');
    expect(remover.getWarnings().length).toBeGreaterThan(0);
  });

  it('throws E_UNKNOWN when the binary is still present after both attempts', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script(XRAY_REMOVE_SCRIPT, { code: 1 });
    runner.script('test -x /usr/local/bin/xray', { code: 0 });

    const remover = new XrayRemover(runner, '203.0.113.10');
    await expect(remover.buildStep().run({ isCancelled: () => false })).rejects.toThrow();
  });

  it('exposes its config path for the shared backup step', () => {
    const remover = new XrayRemover(new FakeCommandRunner(), '203.0.113.10');
    expect(remover.getConfigPaths()).toEqual(['/usr/local/etc/xray']);
    expect(remover.ownsStep('xray-remove')).toBe(true);
    expect(remover.ownsStep('hy2-remove')).toBe(false);
  });
});

describe('Hysteria2Remover', () => {
  it('runs the official script and reports success when the binary is gone', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script('test -x /usr/local/bin/hysteria', { code: 1 });

    const remover = new Hysteria2Remover(runner, '203.0.113.10');
    await remover.buildStep().run({ isCancelled: () => false });

    expect(runner.calls).toContain(HY2_REMOVE_SCRIPT);
    expect(runner.calls).not.toContain('systemctl disable --now hysteria-server.service');
    expect(remover.getOutcome()).toEqual({ protocol: 'hysteria2', ok: true });
  });

  it('falls back to manual cleanup when the official script fails', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });
    runner.script(HY2_REMOVE_SCRIPT, { code: 1 });
    runner.script('test -x /usr/local/bin/hysteria', { code: 1 });

    const remover = new Hysteria2Remover(runner, '203.0.113.10');
    await remover.buildStep().run({ isCancelled: () => false });

    expect(runner.calls).toContain('systemctl disable --now hysteria-server.service');
    expect(runner.calls).toContain('rm -rf /etc/hysteria');
  });
});
