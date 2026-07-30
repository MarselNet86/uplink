import type { DistroInfo } from '@shared/types';
import type { ICommandRunner } from '../ssh/types';
import { parseOsRelease } from './parsers/osRelease';

const SUPPORTED_DISTRO_IDS = new Set(['debian', 'ubuntu']);
const SUPPORTED_ARCHES = new Set(['x86_64', 'aarch64']);

export class UnsupportedDistroError extends Error {
  constructor(public readonly rawId: string) {
    super(`unsupported distro: ${rawId || '(empty)'}`);
    this.name = 'UnsupportedDistroError';
  }
}

export class UnsupportedArchError extends Error {
  constructor(public readonly rawArch: string) {
    super(`unsupported architecture: ${rawArch}`);
    this.name = 'UnsupportedArchError';
  }
}

/**
 * Reads `/etc/os-release`, `uname -m` and systemd presence over a single
 * command runner and assembles the frozen DistroInfo shape (tech.md 5.4
 * items 4-6). Throws typed errors the caller maps to E_DISTRO_UNSUPPORTED /
 * E_ARCH_UNSUPPORTED; systemd absence is left to the caller too since it
 * carries its own error code (E_NO_SYSTEMD) without blocking distro/arch.
 */
export class DistroDetector {
  constructor(private readonly runner: ICommandRunner) {}

  async detect(): Promise<DistroInfo> {
    const [osReleaseResult, archResult, systemdResult] = await Promise.all([
      this.runner.run('cat /etc/os-release'),
      this.runner.run('uname -m'),
      this.runner.run('command -v systemctl'),
    ]);

    const parsed = parseOsRelease(osReleaseResult.stdout);
    if (!SUPPORTED_DISTRO_IDS.has(parsed.id)) {
      throw new UnsupportedDistroError(parsed.id);
    }

    const arch = archResult.stdout.trim();
    if (!SUPPORTED_ARCHES.has(arch)) {
      throw new UnsupportedArchError(arch);
    }

    return {
      id: parsed.id as DistroInfo['id'],
      versionId: parsed.versionId,
      prettyName: parsed.prettyName,
      arch: arch as DistroInfo['arch'],
      hasSystemd: systemdResult.code === 0,
    };
  }
}
