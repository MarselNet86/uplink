import { describe, expect, it } from 'vitest';
import type { DeployParams } from '@shared/types';
import {
  XRAY_CONFIG_PATH,
  XRAY_INSTALL_SCRIPT,
  XrayRealityInstaller,
} from '../../src/main/domain/installers/XrayRealityInstaller';
import { CommandRunnerError } from '../../src/main/ssh/CommandRunner';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';
import { FakeFileTransfer } from '../fakes/FakeFileTransfer';

/** The exact certificate-size probe from tech.md 5.6 X4, as the installer builds it. */
function certChainCmd(host: string): string {
  return (
    `echo | openssl s_client -connect '${host}':443 -servername '${host}' -showcerts 2>/dev/null` +
    ` | awk '/BEGIN CERT/,/END CERT/' | wc -c`
  );
}

function makeHappyRunner(): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.setDefault({ code: 0 });
  runner.script('/usr/local/bin/xray uuid', { stdout: '8f2c41ba-7d3e-4c9a-b1f0-2e5d8a6c4b90\n' });
  runner.script('/usr/local/bin/xray x25519', {
    stdout: 'PrivateKey: priv123\nPassword: pub456\nHash32: hash789\n',
  });
  runner.script("od -An -tx1 -N8 /dev/urandom | tr -d ' \\n'", { stdout: 'a1b2c3d4e5f60718' });
  runner.script("xray tls ping 'www.cloudflare.com'", { code: 0 });
  runner.script(certChainCmd('www.cloudflare.com'), { stdout: '3540\n' });
  runner.script('systemctl is-active xray', { stdout: 'active\n' });
  // `ss -tulnp`, not `-tlnp`: a single-protocol query drops the Netid
  // column, confirmed against a real server - this fixture mirrors the
  // real dual-protocol output shape, including the `*:443` wildcard
  // address xray actually binds to under AmbientCapabilities=CAP_NET_BIND_SERVICE.
  runner.script('ss -tulnp', {
    stdout:
      'Netid State Recv-Q Send-Q Local Peer Process\n' +
      'tcp LISTEN 0 4096 *:443 *:* users:(("xray",pid=1,fd=3))\n',
  });
  runner.script('command -v ufw', { code: 1 });
  return runner;
}

function install(
  runner: FakeCommandRunner,
  fileTransfer = new FakeFileTransfer(),
  params?: DeployParams,
) {
  const installer = new XrayRealityInstaller(
    runner,
    fileTransfer,
    '203.0.113.10',
    params,
    [0, 0, 0],
    1,
    5,
  );
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
        'sni=www.cloudflare.com&fp=firefox&pbk=pub456&sid=a1b2c3d4e5f60718&spx=%2F#Uplink-VLESS',
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
    expect(inbound.streamSettings.realitySettings.serverNames).toEqual(['www.cloudflare.com']);

    expect(runner.calls).toContain('systemctl daemon-reload');
    expect(runner.calls).toContain('systemctl enable xray');
    // restart, not `enable --now`: the install script already started the
    // service with its stock {} config, so `--now` would be a no-op and the
    // config written above would never be loaded (confirmed live).
    expect(runner.calls).toContain('systemctl restart xray');
  });

  it('falls through to the second donor when the first fails tls ping', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'www.cloudflare.com'", { code: 1 });
    runner.script("xray tls ping 'www.swift.com'", { code: 0 });
    runner.script(certChainCmd('www.swift.com'), { stdout: '4127\n' });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toContain('sni=www.swift.com');
  });

  it('skips a donor whose certificate chain is too large for REALITY to relay', async () => {
    const runner = makeHappyRunner();
    // Passes tls ping like the real www.microsoft.com did, but its chain
    // exceeds the limit - the exact failure that shipped a server which
    // listened on 443 and carried no traffic.
    runner.script(certChainCmd('www.cloudflare.com'), { stdout: '8126\n' });
    runner.script("xray tls ping 'www.swift.com'", { code: 0 });
    runner.script(certChainCmd('www.swift.com'), { stdout: '4127\n' });

    const { installer, outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toContain('sni=www.swift.com');
    expect(installer.getWarnings().some((w) => w.includes('8126'))).toBe(true);
  });

  it('uses a user-supplied SNI instead of the built-in list, after checking it', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'my.donor.example'", { code: 0 });
    runner.script(certChainCmd('my.donor.example'), { stdout: '3000\n' });

    const { outcome } = install(runner, new FakeFileTransfer(), {
      distroHint: 'auto',
      tlsMode: 'self-signed',
      realitySni: 'my.donor.example',
    });
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toContain('sni=my.donor.example');
    // The built-in candidates are not consulted at all when one is supplied.
    expect(runner.calls).not.toContain("xray tls ping 'www.cloudflare.com'");
  });

  it('fails with E_NO_REALITY_DONOR when a user-supplied SNI does not pass the checks', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'bad.donor.example'", { code: 1 });

    const { outcome } = install(runner, new FakeFileTransfer(), {
      distroHint: 'auto',
      tlsMode: 'self-signed',
      realitySni: 'bad.donor.example',
    });
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_NO_REALITY_DONOR');
  });

  it('gives a donor-specific hint when a user-supplied SNI fails, not the built-in-list wording (BUG-17/BUG-22)', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'bad.donor.example'", { code: 1 });

    const { outcome } = install(runner, new FakeFileTransfer(), {
      distroHint: 'auto',
      tlsMode: 'self-signed',
      realitySni: 'bad.donor.example',
    });
    const result = await outcome;

    expect(result.error?.hint).toBe(
      'bad.donor.example failed the check - try a different donor domain.',
    );
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

  it('hints at a full disk instead of the network when that is what actually failed (BUG-21)', async () => {
    const runner = makeHappyRunner();
    runner.script(XRAY_INSTALL_SCRIPT, { code: 1, stderr: 'No space left on device\n' });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.error?.hint).toBe("The server's disk is full. Free up space and try again.");
  });

  it('returns E_NO_REALITY_DONOR when every built-in donor fails tls ping', async () => {
    const runner = makeHappyRunner();
    runner.script("xray tls ping 'www.cloudflare.com'", { code: 1 });
    runner.script("xray tls ping 'www.swift.com'", { code: 1 });
    runner.script("xray tls ping 'www.apple.com'", { code: 1 });

    const { outcome } = install(runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_NO_REALITY_DONOR');
  });

  it('returns E_SERVICE_FAILED when xray is active but not listening on 443/tcp', async () => {
    const runner = makeHappyRunner();
    runner.script('ss -tulnp', { stdout: 'Netid State Recv-Q Send-Q Local Peer Process\n' });

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
    expect(runner.calls).not.toContain('systemctl restart xray');
  });
});

describe('XrayRealityInstaller - pipeline integration', () => {
  it('buildSteps() exposes the eight fixed phases in order with the tech.md 5.11 weights', () => {
    const { installer } = install(makeHappyRunner());
    const steps = installer.buildSteps();

    expect(steps.map((s) => [s.id, s.weight])).toEqual([
      ['base-packages', 5],
      ['xray-install', 25],
      ['xray-keys', 3],
      ['xray-config', 3],
      ['xray-validate', 2],
      ['xray-start', 5],
      ['xray-verify', 7],
    ]);
    expect(installer.getConfigStepId()).toBe('xray-config');
    expect(installer.ownsStep('xray-verify')).toBe(true);
    expect(installer.ownsStep('hy2-verify')).toBe(false);
  });

  it('rollback() restores the config backup and stops the service', async () => {
    const runner = makeHappyRunner();
    const { installer } = install(runner);

    await installer.rollback();

    const restoreIdx = runner.calls.indexOf(
      `test -f '${XRAY_CONFIG_PATH}.bak' && cp '${XRAY_CONFIG_PATH}.bak' '${XRAY_CONFIG_PATH}' || true`,
    );
    expect(restoreIdx).toBeGreaterThanOrEqual(0);
    expect(runner.calls).toContain('systemctl stop xray');
  });

  it('toAppError preserves CommandRunnerError codes instead of collapsing them to E_UNKNOWN', () => {
    const { installer } = install(makeHappyRunner());

    expect(installer.toAppError(new CommandRunnerError('E_TIMEOUT', 'command timed out'))).toEqual({
      code: 'E_TIMEOUT',
      message: 'command timed out',
    });
    expect(installer.toAppError(new CommandRunnerError('E_NO_SUDO', 'sudo unavailable'))).toEqual({
      code: 'E_NO_SUDO',
      message: 'sudo unavailable',
    });
  });
});
