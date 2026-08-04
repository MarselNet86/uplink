import type { ProtocolId } from '@shared/types';
import { InstallerError } from '../installers/InstallerError';
import { BaseRemover } from './BaseRemover';
import type { RemoverStepSpec } from './BaseRemover';

export const XRAY_REMOVE_SCRIPT =
  'bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ remove --purge';

/** Xray remover (tech.md 5.10): official script first, manual fallback if it fails (e.g. no network). */
export class XrayRemover extends BaseRemover {
  protected readonly protocol: ProtocolId = 'vless-reality';
  protected readonly stepSpec: RemoverStepSpec = {
    id: 'xray-remove',
    title: 'Removing Xray',
    weight: 10,
  };
  protected readonly configPaths = ['/usr/local/etc/xray'];

  protected async removeCore(): Promise<void> {
    const result = await this.runner.runPrivileged(XRAY_REMOVE_SCRIPT, { timeoutMs: 120_000 });
    if (result.code !== 0) {
      this.warn('the official Xray remove script failed, fell back to manual cleanup');
      await this.fallbackRemove();
    }

    const stillPresent = await this.runner.run('test -x /usr/local/bin/xray');
    if (stillPresent.code === 0) {
      throw new InstallerError('E_UNKNOWN', 'xray binary still present after remove');
    }
  }

  private async fallbackRemove(): Promise<void> {
    await this.runner.runPrivileged('systemctl disable --now xray');
    await this.runner.runPrivileged(
      'rm -f /etc/systemd/system/xray.service /etc/systemd/system/xray@.service',
    );
    await this.runner.runPrivileged('rm -f /usr/local/bin/xray');
    await this.runner.runPrivileged(
      'rm -rf /usr/local/etc/xray /usr/local/share/xray /var/log/xray',
    );
    await this.runner.runPrivileged('systemctl daemon-reload');
  }
}
