import { isIP } from 'node:net';
import type { CheckItem, DeployParams, DistroInfo } from '@shared/types';
import type { ICommandRunner } from '../ssh/types';
import { shellQuote } from '../security/shellQuote';
import { DistroDetector } from './DistroDetector';
import { findListener, parseListenPorts } from './parsers/listenPorts';

export interface PreflightRunResult {
  items: CheckItem[];
  distro: DistroInfo;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Process names of the services this app installs itself, as `ss -tulnp`
 * reports them. A listener on 443 owned by one of these is not a port
 * conflict - reinstall exists precisely to replace that process - so it must
 * not fail the check: the preflight step is `critical`, and once it started
 * actually enforcing its result (BUG-02/BUG-23) a blanket "port is busy"
 * made every reinstall impossible. An unrecognised (or unnamed) process is
 * still a real conflict and still fails.
 */
const OWN_LISTENER_PROCESSES = new Set(['xray', 'hysteria', 'hysteria-server']);

function isOwnListener(process: string | undefined): boolean {
  return process !== undefined && OWN_LISTENER_PROCESSES.has(process);
}

/**
 * Runs preflight checks 3-10 from tech.md 5.4 over an already-connected,
 * already-authenticated session (checks 1 TCP and 2 SSH auth happen before
 * a runner even exists, so the ssh:check handler builds those two items
 * itself and prepends them to what this class returns).
 *
 * Distro (4) and arch (5) are the only checks that can abort the whole
 * run: CheckResult.distro is a non-optional DistroInfo, so an unsupported
 * distro/arch simply cannot be encoded as a "failed but returned" item -
 * DistroDetector's error propagates and the caller maps it to
 * E_DISTRO_UNSUPPORTED/E_ARCH_UNSUPPORTED. Every other check is soft: it
 * always produces a CheckItem, never throws, and it is the renderer's job
 * to block advancing past step 1 when `preflight.passed` is false.
 */
export class Preflight {
  constructor(
    private readonly runner: ICommandRunner,
    private readonly aptLockRetryDelayMs = 10_000,
  ) {}

  async run(params: DeployParams, connectedHost: string): Promise<PreflightRunResult> {
    const distro = await new DistroDetector(this.runner).detect();

    const items: CheckItem[] = [
      await this.checkPrivileges(),
      this.checkDistro(distro, params),
      this.checkArch(distro),
      this.checkSystemd(distro),
      await this.checkOutbound(),
      await this.checkPorts(params),
    ];

    if (params.tlsMode === 'acme-domain') {
      items.push(await this.checkDns(params, connectedHost));
    }

    items.push(await this.checkAptLock());

    return { items, distro };
  }

  private async checkPrivileges(): Promise<CheckItem> {
    const idResult = await this.runner.run('id -u');
    if (idResult.stdout.trim() === '0') {
      return { id: 'privileges', status: 'ok', detail: 'root' };
    }
    const sudoResult = await this.runner.run('sudo -n true');
    return sudoResult.code === 0
      ? { id: 'privileges', status: 'ok' }
      : { id: 'privileges', status: 'fail', detail: 'sudo is not available without a password' };
  }

  private checkDistro(distro: DistroInfo, params: DeployParams): CheckItem {
    if (params.distroHint !== 'auto' && params.distroHint !== distro.id) {
      return {
        id: 'distro',
        status: 'warn',
        detail: `${params.distroHint} was selected, but the server is actually ${distro.prettyName}`,
      };
    }
    return { id: 'distro', status: 'ok', detail: distro.prettyName };
  }

  private checkArch(distro: DistroInfo): CheckItem {
    return { id: 'arch', status: 'ok', detail: distro.arch };
  }

  private checkSystemd(distro: DistroInfo): CheckItem {
    return distro.hasSystemd
      ? { id: 'systemd', status: 'ok' }
      : { id: 'systemd', status: 'fail', detail: 'systemctl not found' };
  }

  private async checkOutbound(): Promise<CheckItem> {
    const curl = await this.runner.run('curl -fsS -m 10 -o /dev/null https://github.com', {
      timeoutMs: 15_000,
    });
    if (curl.code === 0) return { id: 'outbound', status: 'ok' };

    const wget = await this.runner.run('wget -q --spider https://github.com', {
      timeoutMs: 15_000,
    });
    return wget.code === 0
      ? { id: 'outbound', status: 'ok' }
      : { id: 'outbound', status: 'fail', detail: 'no outbound internet access' };
  }

  /**
   * Public because it is the one check an install or a remove can invalidate,
   * so protocols:refresh re-runs just this instead of all of section 5.4
   * (tech.md 5.4 / section 6, v6).
   */
  async checkPorts(params: DeployParams): Promise<CheckItem> {
    const ss = await this.runner.run('ss -tulnp');
    const entries = parseListenPorts(ss.stdout);

    const required: Array<{ proto: 'tcp' | 'udp'; port: number }> = [
      { proto: 'tcp', port: 443 },
      { proto: 'udp', port: 443 },
    ];
    if (params.tlsMode === 'acme-domain') required.push({ proto: 'tcp', port: 80 });

    const busy = required
      .map((r) => ({ ...r, listener: findListener(entries, r.proto, r.port) }))
      .filter((r) => r.listener);

    if (busy.length === 0) return { id: 'ports', status: 'ok' };

    const describe = (b: (typeof busy)[number]): string =>
      `${b.proto}/${b.port} is busy with process ${b.listener?.process ?? '?'}`;

    const foreign = busy.filter((b) => !isOwnListener(b.listener?.process));
    if (foreign.length > 0) {
      return { id: 'ports', status: 'fail', detail: foreign.map(describe).join('; ') };
    }

    return {
      id: 'ports',
      status: 'warn',
      detail: `${busy.map(describe).join('; ')} - this app's own service, a reinstall replaces it`,
    };
  }

  private async checkDns(params: DeployParams, connectedHost: string): Promise<CheckItem> {
    if (!params.domain) {
      return { id: 'dns', status: 'fail', detail: 'no domain given' };
    }
    const domainIp = await this.resolveHost(params.domain);
    // BUG-09: comparing against `connectedHost` only worked when the user
    // connected by IP. When they connected by hostname (e.g. a sslip.io
    // name), the old code compared that hostname against itself and always
    // failed with a message that named the same string on both sides -
    // resolve it here too so the comparison is IP-to-IP either way.
    const targetIp = isIP(connectedHost) ? connectedHost : await this.resolveHost(connectedHost);
    if (domainIp && targetIp && domainIp === targetIp) {
      return { id: 'dns', status: 'ok' };
    }
    return {
      id: 'dns',
      status: 'fail',
      detail: `${params.domain}'s A record does not point to ${connectedHost}`,
    };
  }

  /** Resolves a hostname to its first A-record IP via the server's own resolver, or null if it doesn't resolve. */
  private async resolveHost(host: string): Promise<string | null> {
    const result = await this.runner.run(`getent hosts ${shellQuote(host)}`);
    const ip = result.stdout.trim().split(/\s+/)[0];
    return ip || null;
  }

  private async checkAptLock(): Promise<CheckItem> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.runner.run('fuser /var/lib/dpkg/lock-frontend');
      const locked = result.code === 0;
      if (!locked) return { id: 'apt-lock', status: 'ok' };
      if (attempt < 2) await sleep(this.aptLockRetryDelayMs);
    }
    return { id: 'apt-lock', status: 'fail', detail: 'apt is locked by another process' };
  }
}
