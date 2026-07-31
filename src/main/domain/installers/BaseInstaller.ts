import { randomUUID } from 'node:crypto';
import type { AppError, ProtocolId, ProtocolOutcome, StepId } from '@shared/types';
import { shellQuote } from '../../security/shellQuote';
import type { Step } from '../../pipeline/Step';
import type { ICommandRunner, IFileTransfer } from '../../ssh/types';
import { InstallerError } from './InstallerError';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface StepSpec {
  id: StepId;
  title: string;
  weight: number;
}

/** Per-phase StepId/title/weight metadata (tech.md 5.11 weight table), one entry per fixed template phase. */
export interface InstallerStepSpecs {
  prepare: StepSpec;
  installCore: StepSpec;
  generateSecrets: StepSpec;
  writeConfig: StepSpec;
  validate: StepSpec;
  start: StepSpec;
  verify: StepSpec;
}

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
  protected abstract readonly stepSpecs: InstallerStepSpecs;

  protected abstract prepare(): Promise<void>;
  protected abstract installCore(): Promise<void>;
  protected abstract generateSecrets(): Promise<void>;
  protected abstract writeConfig(): Promise<void>;
  protected abstract validate(): Promise<void>;
  protected abstract start(): Promise<void>;
  protected abstract verify(): Promise<void>;
  protected abstract buildLink(): string;

  /** Restores `.bak` config and stops the service; only called by Pipeline on cancellation after the point of no return (tech.md 5.12). */
  abstract rollback(): Promise<void>;

  get protocolId(): ProtocolId {
    return this.protocol;
  }

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

  /** Returns the finished outcome; only valid to call after a Pipeline run over buildSteps() completed successfully. */
  getOutcome(): ProtocolOutcome {
    return { protocol: this.protocol, ok: true, link: this.buildLink() };
  }

  /**
   * Wraps the same fixed eight phases install() calls as Step objects, so a
   * top-level orchestrator can concatenate several installers' steps into
   * one Pipeline run and get one shared progress bar (tech.md 5.11: "общий
   * прогресс-бар"). The phase order itself stays fixed here, never in the
   * subclass - only the id/title/weight per phase is subclass-supplied.
   */
  buildSteps(): Step[] {
    const phases: Array<[StepSpec, () => Promise<void>]> = [
      [this.stepSpecs.prepare, () => this.prepare()],
      [this.stepSpecs.installCore, () => this.installCore()],
      [this.stepSpecs.generateSecrets, () => this.generateSecrets()],
      [this.stepSpecs.writeConfig, () => this.writeConfig()],
      [this.stepSpecs.validate, () => this.validate()],
      [this.stepSpecs.start, () => this.start()],
      [this.stepSpecs.verify, () => this.verify()],
    ];
    return phases.map(([spec, run]) => ({
      id: spec.id,
      title: spec.title,
      weight: spec.weight,
      critical: true,
      run,
    }));
  }

  /** The step at which this installer starts writing state to the server - the pipeline's point of no return. */
  getConfigStepId(): StepId {
    return this.stepSpecs.writeConfig.id;
  }

  /** True if `stepId` belongs to this installer's own buildSteps(), used to attribute a Pipeline failure to a protocol. */
  ownsStep(stepId: StepId): boolean {
    return this.buildSteps().some((step) => step.id === stepId);
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

  /** Maps a caught phase error to the frozen AppError shape (tech.md section 8). */
  toAppError(err: unknown): AppError {
    if (err instanceof InstallerError) return { code: err.code, message: err.message };
    return {
      code: 'E_UNKNOWN',
      message: err instanceof Error ? err.message : 'unknown installer error',
    };
  }
}
