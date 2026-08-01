import { describe, expect, it } from 'vitest';
import type { DeployParams } from '@shared/types';
import {
  HY2_CONFIG_PATH,
  HY2_INSTALL_SCRIPT,
  Hysteria2Installer,
} from '../../src/main/domain/installers/Hysteria2Installer';
import { shellQuote } from '../../src/main/security/shellQuote';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';
import { FakeFileTransfer } from '../fakes/FakeFileTransfer';

const KEY_PATH = '/etc/hysteria/server.key';
const CERT_PATH = '/etc/hysteria/server.crt';

function makeHappyRunner(): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.setDefault({ code: 0 });
  runner.script('test -x /usr/local/bin/hysteria', { code: 0 });
  runner.script('command -v openssl', { code: 0 });
  runner.script(`openssl x509 -noout -fingerprint -sha256 -in ${shellQuote(CERT_PATH)}`, {
    stdout: 'SHA256 Fingerprint=AB:CD:EF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC\n',
  });
  runner.script('systemctl is-active hysteria-server.service', { stdout: 'active\n' });
  // `ss -tulnp`, not `-ulnp`: a single-protocol query drops the Netid
  // column, confirmed against a real server (same issue as XrayRealityInstaller).
  runner.script('ss -tulnp', {
    stdout:
      'Netid State Recv-Q Send-Q Local Peer Process\n' +
      'udp UNCONN 0 0 *:443 *:* users:(("hysteria",pid=1,fd=3))\n',
  });
  runner.script('command -v ufw', { code: 1 });
  return runner;
}

const selfSignedParams: DeployParams = { distroHint: 'auto', tlsMode: 'self-signed' };
const acmeParams: DeployParams = {
  distroHint: 'auto',
  tlsMode: 'acme-domain',
  domain: 'vpn.example.com',
  acmeEmail: 'admin@example.com',
};

function install(
  params: DeployParams,
  runner: FakeCommandRunner,
  fileTransfer = new FakeFileTransfer(),
) {
  const installer = new Hysteria2Installer(
    runner,
    fileTransfer,
    '203.0.113.10',
    params,
    [0, 0, 0],
    1,
    20,
  );
  return { installer, fileTransfer, outcome: installer.install() };
}

describe('Hysteria2Installer - self-signed happy path', () => {
  it('installs end to end and returns a matching hy2 link with a pin', async () => {
    const runner = makeHappyRunner();
    const { outcome, fileTransfer } = install(selfSignedParams, runner);
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toBe(
      'hy2://' +
        result.link?.slice('hy2://'.length, result.link.indexOf('@')) +
        '@203.0.113.10:443?sni=bing.com&insecure=1&pinSHA256=ABCDEF00112233445566778899AABBCC#Uplink-HY2',
    );

    expect(fileTransfer.writes).toHaveLength(1);
    const write = fileTransfer.writes[0];
    if (!write) throw new Error('expected a config write');
    expect(write.remotePath.startsWith('/tmp/uplink-')).toBe(true);
    expect(write.content).toContain('sniGuard: disable');
    expect(write.content).toContain('cert: /etc/hysteria/server.crt');
    expect(write.content).not.toContain('acme:');

    expect(runner.calls).toContain(
      `openssl ecparam -genkey -name prime256v1 -out ${shellQuote(KEY_PATH)}`,
    );
    expect(runner.calls).toContain('systemctl enable --now hysteria-server.service');
  });

  it('skips installing openssl when it is already present', async () => {
    const runner = makeHappyRunner();
    const { outcome } = install(selfSignedParams, runner);
    await outcome;

    expect(runner.calls.some((c) => c.includes('apt-get install') && c.includes('openssl'))).toBe(
      false,
    );
  });

  it('installs openssl explicitly when missing', async () => {
    const runner = makeHappyRunner();
    runner.script('command -v openssl', { code: 1 });
    const { outcome } = install(selfSignedParams, runner);
    await outcome;

    expect(runner.calls.some((c) => c.includes('apt-get install') && c.includes('openssl'))).toBe(
      true,
    );
  });

  it('exposes 7 steps including the hy2-cert-generate validate slot', () => {
    const { installer } = install(selfSignedParams, makeHappyRunner());
    const ids = installer.buildSteps().map((s) => s.id);
    expect(ids).toEqual([
      'base-packages',
      'hy2-install',
      'hy2-secret',
      'hy2-config',
      'hy2-cert-generate',
      'hy2-start',
      'hy2-verify',
    ]);
    expect(installer.getConfigStepId()).toBe('hy2-config');
  });
});

describe('Hysteria2Installer - acme-domain happy path', () => {
  it('installs end to end and returns a trusted-cert hy2 link', async () => {
    const runner = makeHappyRunner();
    runner.script('command -v ufw', { code: 0 });
    runner.script('ufw status', { stdout: 'Status: active\n' });
    const { outcome, fileTransfer } = install(acmeParams, runner);
    const result = await outcome;

    expect(result.ok).toBe(true);
    expect(result.link).toBe(
      'hy2://' +
        result.link?.slice('hy2://'.length, result.link.indexOf('@')) +
        '@vpn.example.com:443?sni=vpn.example.com&insecure=0#Uplink-HY2',
    );

    const write = fileTransfer.writes[0];
    if (!write) throw new Error('expected a config write');
    expect(write.content).toContain('acme:');
    expect(write.content).not.toContain('tls:');
    expect(write.content).toContain('vpn.example.com');
    expect(write.content).toContain('admin@example.com');

    expect(runner.calls).toContain('ufw allow 80/tcp');
    expect(runner.calls).toContain('ufw allow 443/udp');
  });

  it('exposes 6 steps with no validate slot (folded into hy2-config)', () => {
    const { installer } = install(acmeParams, makeHappyRunner());
    const ids = installer.buildSteps().map((s) => s.id);
    expect(ids).toEqual([
      'base-packages',
      'hy2-install',
      'hy2-secret',
      'hy2-config',
      'hy2-start',
      'hy2-verify',
    ]);
  });
});

describe('Hysteria2Installer - error paths', () => {
  it('returns E_DOWNLOAD_FAILED when the install script fails all retries', async () => {
    const runner = makeHappyRunner();
    runner.script(HY2_INSTALL_SCRIPT, { code: 1 });

    const { outcome } = install(selfSignedParams, runner);
    const result = await outcome;

    expect(result).toEqual({
      protocol: 'hysteria2',
      ok: false,
      error: { code: 'E_DOWNLOAD_FAILED', message: expect.any(String) },
    });
  });

  it('returns E_SERVICE_FAILED (self-signed) when hysteria never listens on 443/udp', async () => {
    const runner = makeHappyRunner();
    runner.script('ss -tulnp', { stdout: 'Netid State Recv-Q Send-Q Local Peer Process\n' });

    const { outcome } = install(selfSignedParams, runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_SERVICE_FAILED');
  });

  it('returns E_ACME_FAILED when the poll window expires without the service coming up', async () => {
    const runner = makeHappyRunner();
    runner.script('ss -tulnp', { stdout: 'Netid State Recv-Q Send-Q Local Peer Process\n' });

    const { outcome } = install(acmeParams, runner);
    const result = await outcome;

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E_ACME_FAILED');
  });

  it('rolls back to .bak and stops the service on cancellation after writeConfig', async () => {
    const runner = makeHappyRunner();
    const { installer } = install(selfSignedParams, runner);
    await installer.rollback();

    const restoreIdx = runner.calls.indexOf(
      `test -f '${HY2_CONFIG_PATH}.bak' && cp '${HY2_CONFIG_PATH}.bak' '${HY2_CONFIG_PATH}' || true`,
    );
    expect(restoreIdx).toBeGreaterThanOrEqual(0);
    expect(runner.calls).toContain('systemctl stop hysteria-server.service');
  });
});
