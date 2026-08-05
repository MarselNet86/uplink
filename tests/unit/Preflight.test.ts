import { describe, expect, it } from 'vitest';
import { Preflight } from '../../src/main/domain/Preflight';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

function makeHappyRunner(): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.script('cat /etc/os-release', {
    stdout: 'ID=debian\nVERSION_ID=13\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\n',
  });
  runner.script('uname -m', { stdout: 'x86_64\n' });
  runner.script('command -v systemctl', { code: 0, stdout: '/usr/bin/systemctl\n' });
  runner.script('id -u', { stdout: '0\n' });
  runner.script('curl -fsS -m 10 -o /dev/null https://github.com', { code: 0 });
  runner.script('ss -tulnp', { stdout: 'Netid State Recv-Q Send-Q Local Peer Process\n' });
  runner.script('fuser /var/lib/dpkg/lock-frontend', { code: 1 });
  return runner;
}

describe('Preflight', () => {
  it('reports all-ok items for a clean self-signed run', async () => {
    const runner = makeHappyRunner();
    const { items, distro } = await new Preflight(runner, 0).run(
      { distroHint: 'auto', tlsMode: 'self-signed' },
      '203.0.113.10',
    );

    expect(distro.id).toBe('debian');
    expect(items.map((i) => i.id)).toEqual([
      'privileges',
      'distro',
      'arch',
      'systemd',
      'outbound',
      'ports',
      'apt-lock',
    ]);
    expect(items.every((i) => i.status === 'ok')).toBe(true);
  });

  it('includes the dns item only for tlsMode acme-domain', async () => {
    const runner = makeHappyRunner();
    runner.script("getent hosts 'vpn.example.com'", {
      code: 0,
      stdout: '203.0.113.10 vpn.example.com\n',
    });

    const { items } = await new Preflight(runner, 0).run(
      {
        distroHint: 'auto',
        tlsMode: 'acme-domain',
        domain: 'vpn.example.com',
        acmeEmail: 'a@b.com',
      },
      '203.0.113.10',
    );

    expect(items.map((i) => i.id)).toContain('dns');
    expect(items.find((i) => i.id === 'dns')?.status).toBe('ok');
  });

  it('resolves a hostname connectedHost too instead of comparing it to itself (BUG-09)', async () => {
    const runner = makeHappyRunner();
    runner.script("getent hosts 'vpn.example.com'", {
      code: 0,
      stdout: '203.0.113.10 vpn.example.com\n',
    });
    runner.script("getent hosts '203.0.113.10.sslip.io'", {
      code: 0,
      stdout: '203.0.113.10 203.0.113.10.sslip.io\n',
    });

    const { items } = await new Preflight(runner, 0).run(
      {
        distroHint: 'auto',
        tlsMode: 'acme-domain',
        domain: 'vpn.example.com',
        acmeEmail: 'a@b.com',
      },
      '203.0.113.10.sslip.io',
    );

    expect(items.find((i) => i.id === 'dns')).toMatchObject({ status: 'ok' });
  });

  it('warns when distroHint disagrees with the detected distro but trusts the fact', async () => {
    const runner = makeHappyRunner();
    const { items, distro } = await new Preflight(runner, 0).run(
      { distroHint: 'ubuntu', tlsMode: 'self-signed' },
      '203.0.113.10',
    );

    expect(distro.id).toBe('debian');
    expect(items.find((i) => i.id === 'distro')).toMatchObject({ status: 'warn' });
  });

  it('fails privileges when not root and sudo -n true fails', async () => {
    const runner = makeHappyRunner();
    runner.script('id -u', { stdout: '1000\n' });
    runner.script('sudo -n true', { code: 1 });

    const { items } = await new Preflight(runner, 0).run(
      { distroHint: 'auto', tlsMode: 'self-signed' },
      '203.0.113.10',
    );

    expect(items.find((i) => i.id === 'privileges')).toMatchObject({ status: 'fail' });
  });

  it('fails ports when 443/tcp is occupied by a foreign process', async () => {
    const runner = makeHappyRunner();
    runner.script('ss -tulnp', {
      stdout:
        'Netid State Recv-Q Send-Q Local Peer Process\ntcp LISTEN 0 128 0.0.0.0:443 0.0.0.0:* users:(("nginx",pid=1,fd=1))\n',
    });

    const { items } = await new Preflight(runner, 0).run(
      { distroHint: 'auto', tlsMode: 'self-signed' },
      '203.0.113.10',
    );

    expect(items.find((i) => i.id === 'ports')).toMatchObject({ status: 'fail' });
  });

  it('checks 80/tcp only for tlsMode acme-domain, never for self-signed (tech.md 5.8)', async () => {
    const busyOn80 = {
      stdout:
        'Netid State Recv-Q Send-Q Local Peer Process\ntcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=1,fd=1))\n',
    };

    const selfSignedRunner = makeHappyRunner();
    selfSignedRunner.script('ss -tulnp', busyOn80);
    const selfSigned = await new Preflight(selfSignedRunner, 0).run(
      { distroHint: 'auto', tlsMode: 'self-signed' },
      '203.0.113.10',
    );
    expect(selfSigned.items.find((i) => i.id === 'ports')).toMatchObject({ status: 'ok' });

    const acmeRunner = makeHappyRunner();
    acmeRunner.script('ss -tulnp', busyOn80);
    acmeRunner.script("getent hosts 'vpn.example.com'", {
      code: 0,
      stdout: '203.0.113.10 vpn.example.com\n',
    });
    const acme = await new Preflight(acmeRunner, 0).run(
      {
        distroHint: 'auto',
        tlsMode: 'acme-domain',
        domain: 'vpn.example.com',
        acmeEmail: 'a@b.com',
      },
      '203.0.113.10',
    );
    expect(acme.items.find((i) => i.id === 'ports')).toMatchObject({ status: 'fail' });
  });

  it('fails apt-lock after three busy attempts', async () => {
    const runner = makeHappyRunner();
    runner.script('fuser /var/lib/dpkg/lock-frontend', { code: 0 });

    const { items } = await new Preflight(runner, 0).run(
      { distroHint: 'auto', tlsMode: 'self-signed' },
      '203.0.113.10',
    );

    expect(items.find((i) => i.id === 'apt-lock')).toMatchObject({ status: 'fail' });
    expect(runner.calls.filter((c) => c === 'fuser /var/lib/dpkg/lock-frontend')).toHaveLength(3);
  });
});
