import type { AppError, ProtocolId, ProtocolOutcome, StepId } from '@shared/types';
import type { Step } from '../../pipeline/Step';
import { shellQuote } from '../../security/shellQuote';
import { CommandRunnerError } from '../../ssh/CommandRunner';
import type { ICommandRunner } from '../../ssh/types';
import { InstallerError } from '../installers/InstallerError';

export interface RemoverStepSpec {
  id: StepId;
  title: string;
  weight: number;
}

/**
 * Template Method base for protocol removers (tech.md 10.2/15 stage 7): a
 * remove is a single Step (`xray-remove`/`hy2-remove`) - unlike install
 * there is no multi-phase breakdown in the frozen StepId list - so the
 * template only fixes removeCore()'s error handling, not a phase sequence.
 */
export abstract class BaseRemover {
  protected readonly warnings: string[] = [];

  constructor(
    protected readonly runner: ICommandRunner,
    protected readonly host: string,
  ) {}

  protected abstract readonly protocol: ProtocolId;
  protected abstract readonly stepSpec: RemoverStepSpec;
  /** Server-side paths backed up to /root/uplink-backup-<timestamp>/ before removal (tech.md 5.10). */
  protected abstract readonly configPaths: string[];

  protected abstract removeCore(): Promise<void>;

  get protocolId(): ProtocolId {
    return this.protocol;
  }

  getConfigPaths(): readonly string[] {
    return this.configPaths;
  }

  getStepId(): StepId {
    return this.stepSpec.id;
  }

  /** Wraps removeCore() as a Step for the shared remove/reinstall Pipeline run. */
  buildStep(): Step {
    return {
      id: this.stepSpec.id,
      title: this.stepSpec.title,
      weight: this.stepSpec.weight,
      critical: true,
      run: async () => {
        await this.removeCore();
        await this.purgeConfigPaths();
      },
    };
  }

  /**
   * Deletes `configPaths` unconditionally after removeCore() succeeds.
   * Confirmed live: Hysteria2's official `--remove` script deletes the
   * binary and systemd units but leaves `/etc/hysteria` (config, cert, key)
   * behind, treating it as user data. ProtocolDetector's `absent` state
   * requires the config gone too, so without this a removed protocol keeps
   * reporting as `broken` ("found, service not running") forever - the
   * vendor script's own cleanup can never be trusted for this on its own.
   */
  private async purgeConfigPaths(): Promise<void> {
    for (const path of this.configPaths) {
      await this.runner.runPrivileged(`rm -rf ${shellQuote(path)}`);
    }
  }

  /** Removal has no link to show - just a success marker for RunResult.outcomes. */
  getOutcome(): ProtocolOutcome {
    return { protocol: this.protocol, ok: true };
  }

  /** True if `stepId` is this remover's own step, used to attribute a Pipeline failure to a protocol. */
  ownsStep(stepId: StepId): boolean {
    return stepId === this.stepSpec.id;
  }

  getWarnings(): readonly string[] {
    return this.warnings;
  }

  protected warn(message: string): void {
    this.warnings.push(message);
  }

  /** Maps a caught removeCore() error to the frozen AppError shape (tech.md section 8). */
  toAppError(err: unknown): AppError {
    if (err instanceof InstallerError) return { code: err.code, message: err.message };
    if (err instanceof CommandRunnerError) return { code: err.code, message: err.message };
    return {
      code: 'E_UNKNOWN',
      message: err instanceof Error ? err.message : 'unknown remover error',
    };
  }
}
