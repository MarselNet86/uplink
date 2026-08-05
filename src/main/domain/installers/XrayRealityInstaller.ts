import type { DeployParams, ProtocolId } from '@shared/types';
import { shellQuote } from '../../security/shellQuote';
import type { ICommandRunner, IFileTransfer } from '../../ssh/types';
import { parseX25519Output } from '../parsers/x25519';
import { buildVlessLink } from '../LinkBuilder';
import { MAX_DONOR_CERT_BYTES, REALITY_DONORS } from '../RealityDonors';
import { BaseInstaller } from './BaseInstaller';
import type { InstallerStepSpecs } from './BaseInstaller';
import { InstallerError } from './InstallerError';

export const XRAY_CONFIG_PATH = '/usr/local/etc/xray/config.json';
export const XRAY_INSTALL_SCRIPT =
  'bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install';
const DOWNLOAD_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const DOWNLOAD_TIMEOUT_MS = 600_000;
const VERIFY_POLL_INTERVAL_MS = 1_000;
// 15s (BUG-14) was too tight for a loaded or slow server to finish binding
// its socket before verify() gave up and reported a correct install as failed.
const SERVICE_START_MAX_WAIT_MS = 30_000;

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
    prepare: { id: 'base-packages', title: 'Installing base packages', weight: 5 },
    installCore: { id: 'xray-install', title: 'Installing Xray core', weight: 25 },
    generateSecrets: { id: 'xray-keys', title: 'Generating keys', weight: 3 },
    writeConfig: { id: 'xray-config', title: 'Writing configuration', weight: 3 },
    validate: { id: 'xray-validate', title: 'Validating configuration', weight: 2 },
    start: { id: 'xray-start', title: 'Starting service', weight: 5 },
    verify: { id: 'xray-verify', title: 'Verifying operation', weight: 7 },
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
    /** Optional: only `realitySni` is read here, to override the built-in donor list (tech.md 5.6 X4). */
    private readonly params?: DeployParams,
    private readonly downloadRetryDelaysMs: number[] = DOWNLOAD_RETRY_DELAYS_MS,
    private readonly verifyPollIntervalMs = VERIFY_POLL_INTERVAL_MS,
    private readonly serviceStartMaxWaitMs = SERVICE_START_MAX_WAIT_MS,
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

    try {
      this.sni = await this.selectDonor();
    } catch (err) {
      // The donor check itself needs the xray binary (X4 runs `xray tls
      // ping`), so it cannot run before installCore() - but nothing durable
      // has been written yet (writeConfig/start haven't run), so a failure
      // here should not leave a dangling, unconfigured install behind
      // (BUG-05: previously did exactly that).
      await this.removeUnconfiguredCore();
      throw err;
    }
  }

  /** Best-effort cleanup for a donor-check failure (BUG-05): the original error is what gets reported either way. */
  private async removeUnconfiguredCore(): Promise<void> {
    try {
      await this.runner.runPrivileged('systemctl disable --now xray');
      await this.runner.runPrivileged('rm -f /usr/local/bin/xray');
      await this.runner.runPrivileged('rm -rf /usr/local/etc/xray /usr/local/share/xray');
    } catch {
      // Best-effort only - swallow so the original donor error still wins.
    }
  }

  // X4: first candidate that passes both donor checks. A user-supplied SNI
  // replaces the built-in list but is not taken on trust - it runs the same
  // checks, so a bad choice fails loudly here instead of silently producing
  // a server that listens but carries no traffic.
  private async selectDonor(): Promise<string> {
    const candidates = this.params?.realitySni ? [this.params.realitySni] : REALITY_DONORS;
    for (const candidate of candidates) {
      if (await this.isUsableDonor(candidate)) return candidate;
    }
    throw new InstallerError(
      'E_NO_REALITY_DONOR',
      this.params?.realitySni
        ? `donor ${this.params.realitySni} failed the TLS 1.3 / certificate size checks`
        : 'no built-in reality donor passed the TLS 1.3 / certificate size checks',
    );
  }

  /**
   * Both donor checks from tech.md 5.6 X4. `xray tls ping` alone is not
   * enough: it passes for donors whose certificate chain is too large for
   * REALITY to relay, which breaks the tunnel only *after* the client
   * authenticates. Exit code is the pass/fail signal for the ping because no
   * documented output format exists for it - consistent with the rest of
   * this codebase, which never parses free text from a tool.
   */
  private async isUsableDonor(candidate: string): Promise<boolean> {
    const ping = await this.runner.run(`xray tls ping ${shellQuote(candidate)}`, {
      timeoutMs: 30_000,
    });
    if (ping.code !== 0) return false;

    const certBytes = await this.donorCertChainBytes(candidate);
    if (certBytes === null) {
      // openssl missing or unreachable: prefer a possibly-working donor over
      // failing the whole install on a check we could not run.
      this.warn(`could not measure ${candidate}'s certificate chain, check skipped`);
      return true;
    }
    if (certBytes > MAX_DONOR_CERT_BYTES) {
      this.warn(
        `donor ${candidate} skipped: certificate chain of ${certBytes} B exceeds the ${MAX_DONOR_CERT_BYTES} B limit`,
      );
      return false;
    }
    return true;
  }

  /** PEM byte count of the donor's certificate chain, or null if it could not be measured. */
  private async donorCertChainBytes(candidate: string): Promise<number | null> {
    const quoted = shellQuote(candidate);
    const result = await this.runner.run(
      `echo | openssl s_client -connect ${quoted}:443 -servername ${quoted} -showcerts 2>/dev/null` +
        ` | awk '/BEGIN CERT/,/END CERT/' | wc -c`,
      { timeoutMs: 30_000 },
    );
    if (result.code !== 0) return null;
    const bytes = Number(result.stdout.trim());
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
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
    // The official install script runs xray.service as `nobody` (tech.md
    // 5.6 X2) - the config must be readable by that user, not just root.
    await this.writePrivilegedFile(
      XRAY_CONFIG_PATH,
      `${JSON.stringify(config, null, 2)}\n`,
      0o600,
      { user: 'nobody', group: 'nogroup' },
    );
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

  // X7: enable at boot and restart, so the config written in X5 is the one loaded.
  protected async start(): Promise<void> {
    await this.enableAndRestartService('xray');
  }

  // X8 (service + port listening) then X9 (firewall, best-effort).
  protected async verify(): Promise<void> {
    const ok = await this.waitForService({
      unit: 'xray',
      protocol: 'tcp',
      port: 443,
      processName: 'xray',
      maxWaitMs: this.serviceStartMaxWaitMs,
      pollIntervalMs: this.verifyPollIntervalMs,
    });
    if (!ok) {
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
