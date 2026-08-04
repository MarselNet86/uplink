import type { ProtocolId } from '@shared/types';
import { InstallerError } from '../installers/InstallerError';
import { BaseRemover } from './BaseRemover';
import type { RemoverStepSpec } from './BaseRemover';

// Adapted from the doc's `bash <(curl -fsSL https://get.hy2.sh/) --remove`
// the same way stage 6's install command was: privileged commands run
// through `sudo sh -c`, which can't parse process substitution, so this
// uses `bash -c "$(curl ...)"` instead. That shifts the positional
// arguments by one (bash -c's first trailing arg becomes $0, not $1), so
// `@` is inserted as a throwaway $0 - same convention Xray's own remove
// command already uses - to put `--remove` back in $1 where the script expects it.
export const HY2_REMOVE_SCRIPT = 'bash -c "$(curl -fsSL https://get.hy2.sh/)" @ --remove';

/** Hysteria2 remover (tech.md 5.10): official script first, manual fallback if it fails. */
export class Hysteria2Remover extends BaseRemover {
  protected readonly protocol: ProtocolId = 'hysteria2';
  protected readonly stepSpec: RemoverStepSpec = {
    id: 'hy2-remove',
    title: 'Removing Hysteria2',
    weight: 10,
  };
  protected readonly configPaths = ['/etc/hysteria'];

  protected async removeCore(): Promise<void> {
    const result = await this.runner.runPrivileged(HY2_REMOVE_SCRIPT, { timeoutMs: 120_000 });
    if (result.code !== 0) {
      this.warn('the official Hysteria2 remove script failed, fell back to manual cleanup');
      await this.fallbackRemove();
    }

    const stillPresent = await this.runner.run('test -x /usr/local/bin/hysteria');
    if (stillPresent.code === 0) {
      throw new InstallerError('E_UNKNOWN', 'hysteria binary still present after remove');
    }
  }

  private async fallbackRemove(): Promise<void> {
    await this.runner.runPrivileged('systemctl disable --now hysteria-server.service');
    await this.runner.runPrivileged(
      'rm -f /etc/systemd/system/hysteria-server.service /etc/systemd/system/hysteria-server@.service',
    );
    await this.runner.runPrivileged('rm -f /usr/local/bin/hysteria');
    await this.runner.runPrivileged('rm -rf /etc/hysteria');
    await this.runner.runPrivileged('systemctl daemon-reload');
  }
}
