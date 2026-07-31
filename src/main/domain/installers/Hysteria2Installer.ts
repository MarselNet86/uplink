import { randomBytes } from 'node:crypto';
import type { DeployParams, ProtocolId } from '@shared/types';
import type { ICommandRunner, IFileTransfer } from '../../ssh/types';
import { generateSelfSignedCert } from '../CertGenerator';
import { HYSTERIA_FAKE_SNI } from '../HysteriaFakeSni';
import { findListener, parseListenPorts } from '../parsers/listenPorts';
import { parseIsActive } from '../parsers/systemctl';
import { buildHysteria2AcmeLink, buildHysteria2SelfSignedLink } from '../LinkBuilder';
import { BaseInstaller } from './BaseInstaller';
import type { InstallerStepSpecs } from './BaseInstaller';
import { InstallerError } from './InstallerError';

export const HY2_CONFIG_PATH = '/etc/hysteria/config.yaml';
export const HY2_INSTALL_SCRIPT = 'bash -c "$(curl -fsSL https://get.hy2.sh/)"';
// Trusted, unrelated-to-the-app domain the server pretends to be when it
// gets a request that isn't the VPN protocol itself (tech.md 5.7): reuses
// the same host as the self-signed cert's CN, nothing user-controlled ever
// reaches this URL (tech.md 5.7's "не из пользовательского ввода").
const MASQUERADE_URL = 'https://www.bing.com/';
const INSTALL_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const INSTALL_TIMEOUT_MS = 600_000;
const ACME_POLL_INTERVAL_MS = 5_000;
const ACME_MAX_WAIT_MS = 180_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function yamlConfig(body: { tlsOrAcme: string; password: string }): string {
  return (
    'listen: :443\n' +
    '\n' +
    `${body.tlsOrAcme}\n` +
    '\n' +
    'auth:\n' +
    '  type: password\n' +
    `  password: "${body.password}"\n` +
    '\n' +
    'masquerade:\n' +
    '  type: proxy\n' +
    '  proxy:\n' +
    `    url: ${MASQUERADE_URL}\n` +
    '    rewriteHost: true\n' +
    '\n' +
    'quic:\n' +
    '  initStreamReceiveWindow: 8388608\n' +
    '  maxStreamReceiveWindow: 8388608\n' +
    '  initConnReceiveWindow: 20971520\n' +
    '  maxConnReceiveWindow: 20971520\n'
  );
}

/** Builds the exact self-signed config.yaml from tech.md 5.7 H5s (pure function, easy to snapshot-test). */
export function buildHysteria2SelfSignedConfig(params: { password: string }): string {
  return yamlConfig({
    tlsOrAcme:
      'tls:\n' +
      '  cert: /etc/hysteria/server.crt\n' +
      '  key: /etc/hysteria/server.key\n' +
      '  sniGuard: disable',
    password: params.password,
  });
}

/** Builds the exact acme-domain config.yaml from tech.md 5.7 H4a (pure function, easy to snapshot-test). */
export function buildHysteria2AcmeConfig(params: {
  password: string;
  domain: string;
  acmeEmail: string;
}): string {
  return yamlConfig({
    tlsOrAcme:
      'acme:\n' +
      `  domains:\n    - "${params.domain}"\n` +
      `  email: "${params.acmeEmail}"\n` +
      '  type: http',
    password: params.password,
  });
}

/**
 * Hysteria2 installer, steps H1-H7 from tech.md 5.7. Mirrors
 * XrayRealityInstaller's structure one-to-one (tech.md 3.3) except for the
 * TLS-mode branch: `self-signed` generates its own cert (occupies the
 * `validate` phase slot, StepId `hy2-cert-generate`), `acme-domain` has
 * nothing there (folded into writeConfig, see BaseInstaller.buildSteps)
 * and instead polls after start() for the async certificate issuance.
 */
export class Hysteria2Installer extends BaseInstaller {
  protected readonly protocol: ProtocolId = 'hysteria2';

  protected readonly stepSpecs: InstallerStepSpecs;

  private password = '';
  private fingerprint = '';

  constructor(
    runner: ICommandRunner,
    fileTransfer: IFileTransfer,
    host: string,
    private readonly params: DeployParams,
    private readonly installRetryDelaysMs: number[] = INSTALL_RETRY_DELAYS_MS,
    private readonly acmePollIntervalMs = ACME_POLL_INTERVAL_MS,
    private readonly acmeMaxWaitMs = ACME_MAX_WAIT_MS,
  ) {
    super(runner, fileTransfer, host);
    this.stepSpecs = {
      prepare: { id: 'base-packages', title: 'Установка базовых пакетов', weight: 5 },
      installCore: { id: 'hy2-install', title: 'Установка ядра Hysteria2', weight: 20 },
      generateSecrets: { id: 'hy2-secret', title: 'Генерация пароля', weight: 2 },
      writeConfig: { id: 'hy2-config', title: 'Запись конфигурации', weight: 3 },
      validate:
        params.tlsMode === 'self-signed'
          ? { id: 'hy2-cert-generate', title: 'Генерация сертификата', weight: 3 }
          : null,
      start: { id: 'hy2-start', title: 'Запуск сервиса', weight: 5 },
      verify: {
        id: 'hy2-verify',
        title:
          params.tlsMode === 'acme-domain' ? 'Проверка и выпуск сертификата' : 'Проверка работы',
        weight: params.tlsMode === 'acme-domain' ? 15 : 7,
      },
    };
  }

  // H1: curl/ca-certificates/unzip shared with Xray via installAptPackages(); openssl is
  // needed by the self-signed branch's cert generation and is checked explicitly (tech.md 5.7 H1).
  protected async prepare(): Promise<void> {
    await this.installAptPackages(['curl', 'ca-certificates', 'unzip']);
    if (this.params.tlsMode === 'self-signed') {
      const openssl = await this.runner.run('command -v openssl');
      if (openssl.code !== 0) await this.installAptPackages(['openssl']);
    }
  }

  // H2: official install script, adapted from the doc's `bash <(curl ...)` to
  // `bash -c "$(curl ...)"` - process substitution needs a shell that
  // understands `<()` to parse it, but privileged commands run through
  // `sudo sh -c '...'` (POSIX sh, no process substitution); command
  // substitution works everywhere, same fix already used for Xray's X2.
  protected async installCore(): Promise<void> {
    const result = await this.runWithRetry(
      HY2_INSTALL_SCRIPT,
      this.installRetryDelaysMs,
      INSTALL_TIMEOUT_MS,
    );
    if (result.code !== 0) {
      throw new InstallerError(
        'E_DOWNLOAD_FAILED',
        'hysteria install script failed after 3 attempts',
      );
    }
    const exists = await this.runner.run('test -x /usr/local/bin/hysteria');
    if (exists.code !== 0) {
      throw new InstallerError('E_DOWNLOAD_FAILED', 'hysteria binary missing after install');
    }
  }

  // H3: password generated locally (Node), never on the server, never touches a server shell history.
  protected async generateSecrets(): Promise<void> {
    this.password = randomBytes(24).toString('base64url');
  }

  // H5s/H4a: back up any existing config, then write the new one atomically via install(1).
  protected async writeConfig(): Promise<void> {
    await this.backupIfExists(HY2_CONFIG_PATH);
    const yaml =
      this.params.tlsMode === 'self-signed'
        ? buildHysteria2SelfSignedConfig({ password: this.password })
        : buildHysteria2AcmeConfig({
            password: this.password,
            domain: this.requireDomain(),
            acmeEmail: this.requireAcmeEmail(),
          });
    await this.writePrivilegedFile(HY2_CONFIG_PATH, yaml, 0o600);
  }

  // H4s: self-signed cert generation, occupies the `validate` phase slot
  // (StepId hy2-cert-generate); acme-domain has nothing to do here, its own
  // config was already fully written by writeConfig().
  protected async validate(): Promise<void> {
    if (this.params.tlsMode !== 'self-signed') return;
    const cert = await generateSelfSignedCert(this.runner, HYSTERIA_FAKE_SNI);
    this.fingerprint = cert.fingerprint;
  }

  // H6s/H5a: identical start commands for both branches.
  protected async start(): Promise<void> {
    await this.runner.runPrivileged('systemctl daemon-reload');
    await this.runner.runPrivileged('systemctl enable --now hysteria-server.service');
  }

  // H6s (immediate) / H5a (poll up to 180s for async ACME issuance) then H6a/H7 firewall.
  protected async verify(): Promise<void> {
    const isAcme = this.params.tlsMode === 'acme-domain';
    const ok = await this.pollUntilListening(isAcme ? this.acmeMaxWaitMs : 0);
    if (!ok) {
      throw new InstallerError(
        isAcme ? 'E_ACME_FAILED' : 'E_SERVICE_FAILED',
        'hysteria-server is not active or not listening on 443/udp',
      );
    }
    if (isAcme) await this.allowFirewallPort(80, 'tcp');
    await this.allowFirewallPort(443, 'udp');
  }

  protected buildLink(): string {
    if (this.params.tlsMode === 'acme-domain') {
      return buildHysteria2AcmeLink({ password: this.password, domain: this.requireDomain() });
    }
    return buildHysteria2SelfSignedLink({
      password: this.password,
      host: this.host,
      sni: HYSTERIA_FAKE_SNI,
      fingerprintSha256: this.fingerprint,
    });
  }

  // Only reached if the user cancels after writeConfig has run (tech.md 5.12).
  async rollback(): Promise<void> {
    await this.restoreBackup(HY2_CONFIG_PATH);
    await this.runner.runPrivileged('systemctl stop hysteria-server.service');
  }

  private async pollUntilListening(maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const active = await this.runner.run('systemctl is-active hysteria-server.service');
      const listening = await this.runner.run('ss -ulnp');
      const entries = parseListenPorts(listening.stdout);
      const hy2Listening = findListener(entries, 'udp', 443)?.process === 'hysteria';
      if (parseIsActive(active.stdout) === 'active' && hy2Listening) return true;
      if (Date.now() >= deadline) return false;
      await sleep(this.acmePollIntervalMs);
    }
  }

  private requireDomain(): string {
    if (!this.params.domain) {
      throw new InstallerError('E_DNS_MISMATCH', 'acme-domain mode requires a domain');
    }
    return this.params.domain;
  }

  private requireAcmeEmail(): string {
    if (!this.params.acmeEmail) {
      throw new InstallerError('E_ACME_FAILED', 'acme-domain mode requires an ACME email');
    }
    return this.params.acmeEmail;
  }
}
