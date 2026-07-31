import { describe, expect, it } from 'vitest';
import {
  XRAY_CONFIG_PATH,
  XRAY_INSTALL_SCRIPT,
  XrayRealityInstaller,
} from '../../src/main/domain/installers/XrayRealityInstaller';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';
import { FakeFileTransfer } from '../fakes/FakeFileTransfer';

function makeHappyRunner(): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.setDefault({ code: 0 });
  runner.script('/usr/local/bin/xray uuid', { stdout: '8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90\n' });
  runner.script('/usr/local/bin/xray x25519', {
    stdout: 'PrivateKey: priv123\nPassword: pub456\nHash32: hash789\n',
  });
  runner.script("od -An -tx1 -N8 /dev/urandom | tr -d ' \\n'", { stdout: 'a1b2c3d4e5f60718' });
  runner.script("xray tls ping 'www.microsoft.com'", { code: 0 });
  runner.script('systemctl is-active xray', { stdout: 'active\n' });
  runner.script('ss -tlnp', {
    stdout:
      'Netid State Recv-Q Send-Q Local Peer Process\n' +
      'tcp LISTEN 0 128 0.0.0.0:443 0.0.0.0:* users:(("xray",pid=1,fd=3))\n',
  });
  runner.script('command -v ufw', { code: 1 });
  return runner;
}

function install(runner: FakeCommandRunner, fileTransfer = new FakeFileTransfer()) {
  const installer = new XrayRealityInstaller(runner, fileTransfer, '203.0.113.10', [0, 0, 0]);
  return { installer, fileTransfer, outcome: installer.install() };
}

describe('XrayRealityInstaller - happy path', () => {
  it('installs end to end and returns a matching vless link', async () => {
    const runner = makeHappyRunner();
    const { outcome, fileTransfer } = install(runner);
    const result = await outcome;

    expect(result).toEqual({
      protocol: 'vless-reality',
      ok: true,
      link:
        'vless://8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90@203.0.113.10:443?' +
        'type=tcp&security=reality&encryption=none&flow=xtls-rprx-vision&' +
        'sni=www.microsoft.com&fp=chrome&pbk=pub456&sid=a1b2c3d4e5f60718&spx=%2F#Uplink-VLESS',
    });

    expect(fileTransfer.writes).toHaveLength(1);
    const write = fileTransfer.writes[0];
    if (!write) throw new Error('expected a config write');
    const written = JSON.parse(write.content) as {
      inbounds: Array<{
        settings: { clients: Array<{ id: string }> };
        streamSettings: { realitySettings: { privateKey: string; serverNames: string[] } };
      }>;
    };
    const inbound = written.inbounds[0];
    if (!inbound) throw new Error('expected an inbound');
    expect(inbound.settings.clients[0]?.id).toBe('8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90');
    expect(inbound.streamSettings.realitySettings.privateKey).toBe('priv123');
    expect(inbound.streamSettings.realitySettings.serverNames).toEqual(['www.microsoft.com']);

    expect(runner.calls).toContain('systemctl daemon-reload');
    expect(runner.calls).toContain('systemctl enable --now xray');
  });

  it('falls through to the second donor when the first fails tls ping', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'www.microsoft.com'", { code: 1 });
    runner.script("xray tls ping 'www.swift.com'", { code: 0 });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toContain('sni=www.swift.com');
  });

  it('warns instead of failing when ufw is not present', async () => {
    const runner = makeHappyRunner();
    const { installer, outcome } = install(runner);
    await outcome;

    expect(installer.getWarnings().some((w) => w.includes('ufw'))).toBe(true);
  });
});

describe('XrayRealityInstaller - error paths', () => {
  it('returns E_DOWNLOAD_FAILED when the install script fails all retries', async () => {
    const runner = makeHappyRunner();
    runner.script(XRAY_INSTALL_SCRIPT, { code: 1 });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result).toEqual({
      protocol: 'vless-reality',
      ok: false,
      error: { code: 'E_DOWNLOAD_FAILED', message: expect.any(String) },
    });
  });

  it('returns E_NO_REALITY_DONOR when every built-in donor fails tls ping', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'www.microsoft.com'", { code: 1 });
    runner.script("xray tls ping 'www.swift.com'", { code: 1 });
    runner.script("xray tls ping 'www.cloudflare.com'", { code: 1 });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_NO_REALITY_DONOR');
  });

  it('returns E_SERVICE_FAILED when xray is active but not listening on 443/tcp', async () => {
    const runner = makeHappyRunner();
    runner.script('ss -tlnp', { stdout: 'Netid State Recv-Q Send-Q Local Peer Process\n' });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_SERVICE_FAILED');
  });

  it('rolls back to .bak and returns E_CONFIG_INVALID when xray -test rejects the config', async () => {
    const runner = makeHappyRunner();
    runner.script(`/usr/local/bin/xray -test -config '${XRAY_CONFIG_PATH}'`, { code: 1 });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_CONFIG_INVALID');

    const backupIdx = runner.calls.indexOf(
      `test -f '${XRAY_CONFIG_PATH}' && cp '${XRAY_CONFIG_PATH}' '${XRAY_CONFIG_PATH}.bak' || true`,
    );
    const restoreIdx = runner.calls.indexOf(
      `test -f '${XRAY_CONFIG_PATH}.bak' && cp '${XRAY_CONFIG_PATH}.bak' '${XRAY_CONFIG_PATH}' || true`,
    );
    expect(backupIdx).toBeGreaterThanOrEqual(0);
    expect(restoreIdx).toBeGreaterThan(backupIdx);

    // The service is never started when validation failed.
    expect(runner.calls).not.toContain('systemctl enable --now xray');
  });
});
