import { randomUUID } from 'node:crypto';
import type { AppError, ProtocolId, ProtocolOutcome } from '@shared/types';
import { shellQuote } from '../../security/shellQuote';
import type { ICommandRunner, IFileTransfer } from '../../ssh/types';
import { InstallerError } from './InstallerError';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Template Method base for protocol installers (tech.md 10.2): install()
 * fixes the eight-phase shape - prepare, installCore, generateSecrets,
 * writeConfig, validate, start, verify, buildLink - and subclasses only
 * override the phases. Depends solely on ICommandRunner/IFileTransfer,
 * never ssh2 (tech.md 5.2), so it is exercised entirely against fakes.
 */
export abstract class BaseInstaller {
  protected readonly warnings: string[] = [];

  constructor(
    protected readonly runner: ICommandRunner,
    protected readonly fileTransfer: IFileTransfer,
    protected readonly host: string,
  ) {}

  protected abstract readonly protocol: ProtocolId;

  protected abstract prepare(): Promise<void>;
  protected abstract installCore(): Promise<void>;
  protected abstract generateSecrets(): Promise<void>;
  protected abstract writeConfig(): Promise<void>;
  protected abstract validate(): Promise<void>;
  protected abstract start(): Promise<void>;
  protected abstract verify(): Promise<void>;
  protected abstract buildLink(): string;

  async install(): Promise<ProtocolOutcome> {
    try {
      await this.prepare();
      await this.installCore();
      await this.generateSecrets();
      await this.writeConfig();
      await this.validate();
      await this.start();
      await this.verify();
      return { protocol: this.protocol, ok: true, link: this.buildLink() };
    } catch (err) {
      return { protocol: this.protocol, ok: false, error: this.toAppError(err) };
    }
  }

  /** Warnings collected during install (e.g. firewall not touched); read by the pipeline that aggregates RunResult.warnings (stage 5). */
  getWarnings(): readonly string[] {
    return this.warnings;
  }

  protected warn(message: string): void {
    this.warnings.push(message);
  }

  /**
   * Runs a privileged command with retries and backoff (tech.md 5.6 X2:
   * "3 попытки с бэкоффом 5/15/30 с"). Returns the last result even on
   * exhaustion so the caller can inspect stderr before throwing.
   */
  protected async runWithRetry(command: string, delaysMs: number[], timeoutMs?: number) {
    let last = await this.runner.runPrivileged(command, timeoutMs ? { timeoutMs } : undefined);
    for (const delayMs of delaysMs) {
      if (last.code === 0) break;
      await sleep(delayMs);
      last = await this.runner.runPrivileged(command, timeoutMs ? { timeoutMs } : undefined);
    }
    return last;
  }

  /**
   * Safe privileged config write (tech.md 5.3): SFTP can only write where
   * the SSH login user already has permission, so content goes to a temp
   * file first, then `install -m ... -o root -g root` moves it into place
   * with the right owner/mode - never a raw SFTP write to a root-owned path.
   */
  protected async writePrivilegedFile(
    destPath: string,
    content: string,
    mode: number,
  ): Promise<void> {
    const tmpPath = `/tmp/uplink-${randomUUID()}`;
    await this.fileTransfer.writeFile(tmpPath, content, 0o600);
    const octalMode = mode.toString(8).padStart(3, '0');
    const install = await this.runner.runPrivileged(
      `install -m ${octalMode} -o root -g root ${shellQuote(tmpPath)} ${shellQuote(destPath)}`,
    );
    await this.runner.run(`rm -f ${shellQuote(tmpPath)}`);
    if (install.code !== 0) {
      throw new InstallerError('E_CONFIG_INVALID', `failed to install config at ${destPath}`);
    }
  }

  /** Backs up an existing config to `<path>.bak` before overwriting it (tech.md 5.6 X6). */
  protected async backupIfExists(path: string): Promise<void> {
    await this.runner.runPrivileged(
      `test -f ${shellQuote(path)} && cp ${shellQuote(path)} ${shellQuote(`${path}.bak`)} || true`,
    );
  }

  /** Restores `<path>.bak` over `path` after a failed validate() (tech.md 5.6 X6 rollback). */
  protected async restoreBackup(path: string): Promise<void> {
    await this.runner.runPrivileged(
      `test -f ${shellQuote(`${path}.bak`)} && cp ${shellQuote(`${path}.bak`)} ${shellQuote(path)} || true`,
    );
  }

  /**
   * Opens a port through ufw when it is present and active; otherwise
   * records a warning and leaves firewall rules untouched (tech.md 5.6 X9 -
   * never enable a firewall ourselves, that risks locking out SSH).
   */
  protected async allowFirewallPort(port: number, proto: 'tcp' | 'udp'): Promise<void> {
    const ufw = await this.runner.run('command -v ufw');
    if (ufw.code !== 0) {
      this.warn(
        `ufw не найден, откройте ${port}/${proto} вручную при использовании другого firewall`,
      );
      return;
    }
    const status = await this.runner.run('ufw status');
    if (!/Status:\s*active/i.test(status.stdout)) {
      this.warn(`ufw установлен, но не активен - правило для ${port}/${proto} не добавлено`);
      return;
    }
    await this.runner.runPrivileged(`ufw allow ${port}/${proto}`);
  }

  private toAppError(err: unknown): AppError {
    if (err instanceof InstallerError) return { code: err.code, message: err.message };
    return {
      code: 'E_UNKNOWN',
      message: err instanceof Error ? err.message : 'unknown installer error',
    };
  }
}
