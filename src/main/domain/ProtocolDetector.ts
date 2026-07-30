import type { ProtocolStatus } from '@shared/types';
import type { ICommandRunner } from '../ssh/types';
import { parseIsActive } from './parsers/systemctl';

/**
 * Detects protocols already installed on the server (tech.md 5.5). Needed
 * by ssh:check since CheckResult.protocols is part of its frozen response
 * shape - the fuller PlanBuilder/UI wiring around this lands in stage 3.
 */
export class ProtocolDetector {
  constructor(private readonly runner: ICommandRunner) {}

  async detect(): Promise<ProtocolStatus[]> {
    const [xray, hysteria2] = await Promise.all([this.detectXray(), this.detectHysteria2()]);
    return [xray, hysteria2];
  }

  private async detectXray(): Promise<ProtocolStatus> {
    const [binary, config, active] = await Promise.all([
      this.runner.run('test -x /usr/local/bin/xray'),
      this.runner.run('test -f /usr/local/etc/xray/config.json'),
      this.runner.run('systemctl is-active xray'),
    ]);
    const binaryPresent = binary.code === 0;
    const configPresent = config.code === 0;
    const serviceActive = parseIsActive(active.stdout) === 'active';

    if (!binaryPresent && !configPresent) {
      return { protocol: 'vless-reality', state: 'absent', serviceActive: false };
    }

    if (binaryPresent && configPresent) {
      // Xray without a "security":"reality" stream is a foreign config -
      // distinct from "installed" so the UI blocks install and only offers
      // removal (tech.md 5.5).
      const reality = await this.runner.run(
        `grep -q '"security"[[:space:]]*:[[:space:]]*"reality"' /usr/local/etc/xray/config.json`,
      );
      if (reality.code !== 0) {
        return { protocol: 'vless-reality', state: 'foreign', serviceActive };
      }
    }

    return {
      protocol: 'vless-reality',
      state: serviceActive ? 'installed' : 'broken',
      serviceActive,
    };
  }

  private async detectHysteria2(): Promise<ProtocolStatus> {
    const [binary, config, active] = await Promise.all([
      this.runner.run('test -x /usr/local/bin/hysteria'),
      this.runner.run('test -f /etc/hysteria/config.yaml'),
      this.runner.run('systemctl is-active hysteria-server.service'),
    ]);
    const binaryPresent = binary.code === 0;
    const configPresent = config.code === 0;
    const serviceActive = parseIsActive(active.stdout) === 'active';

    if (!binaryPresent && !configPresent) {
      return { protocol: 'hysteria2', state: 'absent', serviceActive: false };
    }

    return { protocol: 'hysteria2', state: serviceActive ? 'installed' : 'broken', serviceActive };
  }
}
