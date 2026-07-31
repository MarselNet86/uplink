import type { ProtocolId } from '@shared/types';
import { shellQuote } from '../../security/shellQuote';
import type { ICommandRunner, IFileTransfer } from '../../ssh/types';
import { findListener, parseListenPorts } from '../parsers/listenPorts';
import { parseIsActive } from '../parsers/systemctl';
import { parseX25519Output } from '../parsers/x25519';
import { buildVlessLink } from '../LinkBuilder';
import { REALITY_DONORS } from '../RealityDonors';
import { BaseInstaller } from './BaseInstaller';
import type { InstallerStepSpecs } from './BaseInstaller';
import { InstallerError } from './InstallerError';

export const XRAY_CONFIG_PATH = '/usr/local/etc/xray/config.json';
export const XRAY_INSTALL_SCRIPT =
  'bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install';
const DOWNLOAD_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const DOWNLOAD_TIMEOUT_MS = 600_000;

interface XrayConfig {
  log: { loglevel: string };
  inbounds: Array<{
    tag: string;
    listen: string;
    port: number;
    protocol: string;
    settings: { clients: Array<{ id: string; flow: string }>; decryption: string };
    streamSettings: {
      network: string;
      security: string;
      realitySettings: {
        show: boolean;
        dest: string;
        xver: number;
        serverNames: string[];
        privateKey: string;
        shortIds: string[];
      };
    };
    sniffing: { enabled: boolean; destOverride: string[] };
  }>;
  outbounds: Array<{ protocol: string; tag: string }>;
}

/** Builds the exact Xray config shape from tech.md 5.6 X5 (pure function, easy to snapshot-test). */
export function buildXrayConfig(params: {
  uuid: string;
  privateKey: string;
  shortId: string;
  sni: string;
}): XrayConfig {
  return {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        tag: 'vless-reality',
        listen: '0.0.0.0',
        port: 443,
        protocol: 'vless',
        settings: {
          clients: [{ id: params.uuid, flow: 'xtls-rprx-vision' }],
          decryption: 'none',
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            show: false,
            dest: `${params.sni}:443`,
            xver: 0,
            serverNames: [params.sni],
            privateKey: params.privateKey,
            shortIds: [params.shortId],
          },
        },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
    ],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }],
  };
}

/**
 * Xray + VLESS/Reality installer, steps X1-X9 from tech.md 5.6. This is
 * the reference slice (tech.md 3.3): Hysteria2Installer (stage 6) copies
 * this structure one-to-one.
 */
export class XrayRealityInstaller extends BaseInstaller {
  protected readonly protocol: ProtocolId = 'vless-reality';

  // Weights from tech.md 5.11's default table (base packages 5, core install
  // 25, keys 3, config 3, validate 2, start 5, verify 7); StepId values from
  // tech.md section 7.
  protected readonly stepSpecs: InstallerStepSpecs = {
    prepare: { id: 'base-packages', title: 'Установка базовых пакетов', weight: 5 },
    installCore: { id: 'xray-install', title: 'Установка ядра Xray', weight: 25 },
    generateSecrets: { id: 'xray-keys', title: 'Генерация ключей', weight: 3 },
    writeConfig: { id: 'xray-config', title: 'Запись конфигурации', weight: 3 },
    validate: { id: 'xray-validate', title: 'Проверка конфигурации', weight: 2 },
    start: { id: 'xray-start', title: 'Запуск сервиса', weight: 5 },
    verify: { id: 'xray-verify', title: 'Проверка работы', weight: 7 },
  };

  private uuid = '';
  private privateKey = '';
  private publicKey = '';
  private shortId = '';
  private sni = '';

  constructor(
    runner: ICommandRunner,
    fileTransfer: IFileTransfer,
    host: string,
    private readonly downloadRetryDelaysMs: number[] = DOWNLOAD_RETRY_DELAYS_MS,
  ) {
    super(runner, fileTransfer, host);
  }

  // X1: base packages, needed once per run regardless of protocol count -
  // safe to repeat, apt-get install is idempotent for already-present packages.
  protected async prepare(): Promise<void> {
    await this.installAptPackages(['curl', 'ca-certificates', 'unzip']);
  }

  // X2: official install script, retried 3x with backoff since it downloads over the network.
  protected async installCore(): Promise<void> {
    const result = await this.runWithRetry(
      XRAY_INSTALL_SCRIPT,
      this.downloadRetryDelaysMs,
      DOWNLOAD_TIMEOUT_MS,
    );
    if (result.code !== 0) {
      throw new InstallerError('E_DOWNLOAD_FAILED', 'xray install script failed after 3 attempts');
    }
    const exists = await this.runner.run('test -x /usr/local/bin/xray');
    const version = await this.runner.run('/usr/local/bin/xray version');
    if (exists.code !== 0 || version.code !== 0) {
      throw new InstallerError('E_DOWNLOAD_FAILED', 'xray binary missing or broken after install');
    }
  }

  // X3 (uuid/x25519/shortId) + X4 (donor selection): neither needs root.
  protected async generateSecrets(): Promise<void> {
    const uuidResult = await this.runner.run('/usr/local/bin/xray uuid');
    this.uuid = uuidResult.stdout.trim();

    const x25519Result = await this.runner.run('/usr/local/bin/xray x25519');
    const keys = parseX25519Output(x25519Result.stdout);
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;

    // od -An -tx1 -N8: 8 random bytes as hex, 16 chars, no leading space/newline.
    const shortIdResult = await this.runner.run("od -An -tx1 -N8 /dev/urandom | tr -d ' \\n'");
    this.shortId = shortIdResult.stdout.trim();

    this.sni = await this.selectDonor();
  }

  // X4: first built-in donor whose TLS 1.3/HTTP2 handshake xray itself accepts.
  // No documented text format exists for `xray tls ping` output anywhere in
  // this repo or upstream docs, so exit code is treated as the pass/fail
  // signal - consistent with every other check in this codebase (test -x,
  // systemctl is-active, ...), none of which parse free-text either.
  private async selectDonor(): Promise<string> {
    for (const candidate of REALITY_DONORS) {
      const result = await this.runner.run(`xray tls ping ${shellQuote(candidate)}`, {
        timeoutMs: 30_000,
      });
      if (result.code === 0) return candidate;
    }
    throw new InstallerError(
      'E_NO_REALITY_DONOR',
      'no built-in reality donor passed xray tls ping',
    );
  }

  // X5: back up any existing config, then write the new one atomically via install(1).
  protected async writeConfig(): Promise<void> {
    const config = buildXrayConfig({
      uuid: this.uuid,
      privateKey: this.privateKey,
      shortId: this.shortId,
      sni: this.sni,
    });
    await this.backupIfExists(XRAY_CONFIG_PATH);
    await this.writePrivilegedFile(XRAY_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 0o600);
  }

  // X6: validate before restarting; roll back to .bak on failure, service untouched.
  protected async validate(): Promise<void> {
    const result = await this.runner.runPrivileged(
      `/usr/local/bin/xray -test -config ${shellQuote(XRAY_CONFIG_PATH)}`,
    );
    if (result.code !== 0) {
      await this.restoreBackup(XRAY_CONFIG_PATH);
      throw new InstallerError('E_CONFIG_INVALID', 'xray -test rejected the generated config');
    }
  }

  // X7: enable and start the service.
  protected async start(): Promise<void> {
    await this.runner.runPrivileged('systemctl daemon-reload');
    await this.runner.runPrivileged('systemctl enable --now xray');
  }

  // X8 (service + port listening) then X9 (firewall, best-effort).
  protected async verify(): Promise<void> {
    const active = await this.runner.run('systemctl is-active xray');
    const listening = await this.runner.run('ss -tlnp');
    const entries = parseListenPorts(listening.stdout);
    const xrayListening = findListener(entries, 'tcp', 443)?.process === 'xray';

    if (parseIsActive(active.stdout) !== 'active' || !xrayListening) {
      throw new InstallerError(
        'E_SERVICE_FAILED',
        'xray is not active or not listening on 443/tcp',
      );
    }

    await this.allowFirewallPort(443, 'tcp');
  }

  protected buildLink(): string {
    return buildVlessLink({
      uuid: this.uuid,
      host: this.host,
      sni: this.sni,
      publicKey: this.publicKey,
      shortId: this.shortId,
    });
  }

  // Only reached if the user cancels after writeConfig has run (tech.md
  // 5.12): restore the pre-install config and stop the service we may have
  // just started, undoing exactly what writeConfig()/start() did.
  async rollback(): Promise<void> {
    await this.restoreBackup(XRAY_CONFIG_PATH);
    await this.runner.runPrivileged('systemctl stop xray');
  }
}
