import { shellQuote } from '../security/shellQuote';
import type {
  AppError,
  ProtocolId,
  ProtocolOutcome,
  RunResult,
  StepId,
  StepStatus,
} from '@shared/types';
import type { BaseInstaller } from '../domain/installers/BaseInstaller';
import type { BaseRemover } from '../domain/removers/BaseRemover';
import type { PipelineOutcome } from '../pipeline/Pipeline';
import { redact } from '../security/redact';
import type { ICommandRunner } from '../ssh/types';
import type { IProgressSink, Step } from '../pipeline/Step';

/**
 * Fixed left-to-right order the combined step list is built in, regardless
 * of the order protocols were selected in - keeps `units[0]` a stable
 * "which destructive step comes first" answer for the point of no return.
 */
export const PROTOCOL_ORDER: ProtocolId[] = ['vless-reality', 'hysteria2'];

/**
 * Some StepIds are shared across protocols (`base-packages`: tech.md 5.7
 * H1 "тот же, что X1, шаг общий"). When both protocols contribute a step
 * with the same id, merge them into one StepView that runs both installers'
 * work in sequence, so the step list never shows the same id twice and
 * neither protocol's own needs (e.g. Hysteria2's openssl check) are dropped.
 */
export function mergeStepsById(steps: Step[]): Step[] {
  const order: StepId[] = [];
  const merged = new Map<StepId, Step>();
  for (const step of steps) {
    const existing = merged.get(step.id);
    if (!existing) {
      merged.set(step.id, step);
      order.push(step.id);
      continue;
    }
    const runBoth = existing.run;
    merged.set(step.id, {
      ...existing,
      run: async (ctx) => {
        await runBoth(ctx);
        await step.run(ctx);
      },
    });
  }
  return order.map((id) => merged.get(id)).filter((s): s is Step => s !== undefined);
}

/** Shared pre-removal backup step (tech.md 5.10: "конфиг копируется в /root/uplink-backup-<timestamp>/, отдельный шаг пайплайна"). */
export function buildBackupStep(runner: ICommandRunner, configPaths: readonly string[]): Step {
  return {
    id: 'backup',
    title: 'Резервное копирование конфигурации',
    weight: 3,
    critical: true,
    run: async () => {
      if (configPaths.length === 0) return;
      const dir = `/root/uplink-backup-${Date.now()}`;
      await runner.runPrivileged(`mkdir -p ${shellQuote(dir)}`);
      for (const path of configPaths) {
        await runner.runPrivileged(
          `test -e ${shellQuote(path)} && cp -r ${shellQuote(path)} ${shellQuote(dir)}/ || true`,
        );
      }
    },
  };
}

/**
 * Uniform view over "one protocol's unit of work in this run" - a plain
 * install (installer only), a plain remove (remover only), or a reinstall
 * (remover then installer, combined into a single unit so the run reports
 * one outcome per protocol, not two). `startStepId`/`finishStepId` bound
 * the window RunTrackingSink treats as "in flight" for cancel/rollback
 * attribution (tech.md 5.12).
 */
export interface TrackableUnit {
  protocolId: ProtocolId;
  startStepId: StepId;
  finishStepId: StepId;
  getOutcome(): ProtocolOutcome;
  ownsStep(stepId: StepId): boolean;
  toAppError(err: unknown): AppError;
  rollback?: () => Promise<void>;
}

export function asInstallerUnit(installer: BaseInstaller): TrackableUnit {
  return {
    protocolId: installer.protocolId,
    startStepId: installer.getConfigStepId(),
    finishStepId: installer.getVerifyStepId(),
    getOutcome: () => installer.getOutcome(),
    ownsStep: (id) => installer.ownsStep(id),
    toAppError: (err) => installer.toAppError(err),
    rollback: () => installer.rollback(),
  };
}

export function asRemoverUnit(remover: BaseRemover): TrackableUnit {
  const stepId = remover.getStepId();
  return {
    protocolId: remover.protocolId,
    startStepId: stepId,
    finishStepId: stepId,
    getOutcome: () => remover.getOutcome(),
    ownsStep: (id) => remover.ownsStep(id),
    toAppError: (err) => remover.toAppError(err),
  };
}

/**
 * Reinstall = remove + install as one unit (tech.md 5.10): the remover's
 * step is the first destructive action for this protocol, the installer's
 * verify step is when it is genuinely done. No rollback method - once the
 * old install has been removed there is nothing automatic to restore it
 * to, keys are always new (tech.md 5.10: "старые не восстанавливаются").
 */
export function asReinstallUnit(remover: BaseRemover, installer: BaseInstaller): TrackableUnit {
  return {
    protocolId: installer.protocolId,
    startStepId: remover.getStepId(),
    finishStepId: installer.getVerifyStepId(),
    getOutcome: () => installer.getOutcome(),
    ownsStep: (id) => remover.ownsStep(id) || installer.ownsStep(id),
    toAppError: (err) => installer.toAppError(err),
  };
}

/**
 * Tracks, from Step status transitions alone, which units are "in flight"
 * (started but not finished) versus "completed" - used both to decide
 * which units a post-point-of-no-return cancellation should roll back, and
 * to attribute a Pipeline failure to the right protocol without marking an
 * already-finished one as failed (tech.md 5.12).
 */
export class RunTrackingSink implements IProgressSink {
  private readonly startOf = new Map<StepId, TrackableUnit>();
  private readonly finishOf = new Map<StepId, TrackableUnit>();
  private readonly inFlight = new Set<TrackableUnit>();
  private readonly completed = new Set<TrackableUnit>();

  constructor(
    private readonly inner: IProgressSink,
    units: TrackableUnit[],
  ) {
    for (const unit of units) {
      this.startOf.set(unit.startStepId, unit);
      this.finishOf.set(unit.finishStepId, unit);
    }
  }

  onStepStatus(stepId: StepId, status: StepStatus): void {
    if (status === 'done') {
      const started = this.startOf.get(stepId);
      if (started) this.inFlight.add(started);
      const finished = this.finishOf.get(stepId);
      if (finished) {
        this.inFlight.delete(finished);
        this.completed.add(finished);
      }
    }
    this.inner.onStepStatus(stepId, status);
  }

  onNote(message: string): void {
    this.inner.onNote(message);
  }

  get inFlightUnits(): TrackableUnit[] {
    return [...this.inFlight];
  }

  get completedUnits(): TrackableUnit[] {
    return [...this.completed];
  }
}

/** Rolls back every unit still in flight when cancellation lands past the point of no return (tech.md 5.12); a no-op for units without a rollback (removers, reinstall units). */
export function buildRollback(trackingSink: RunTrackingSink): () => Promise<void> {
  return async () => {
    for (const unit of trackingSink.inFlightUnits) await unit.rollback?.();
  };
}

/**
 * Turns a finished Pipeline run into the frozen RunResult shape, sharing
 * one outcome-attribution rule across install/reinstall/remove (tech.md
 * 5.12): a unit that already reached its own finish step keeps its real
 * result, the unit whose step actually failed gets the real error, and any
 * unit that never got there is reported as cancelled/skipped - never
 * silently dropped from `outcomes`.
 */
export function buildRunResult(
  runId: string,
  pipelineResult: PipelineOutcome,
  units: TrackableUnit[],
  trackingSink: RunTrackingSink,
  unsupported: ProtocolId[],
  warnings: string[],
): RunResult {
  const completedUnits = new Set(trackingSink.completedUnits);
  let outcomes: ProtocolOutcome[];
  let diagnostics: string | undefined;

  if (pipelineResult.status === 'completed') {
    outcomes = units.map((u) => u.getOutcome());
  } else if (pipelineResult.status === 'cancelled') {
    outcomes = units.map((u) =>
      completedUnits.has(u)
        ? u.getOutcome()
        : {
            protocol: u.protocolId,
            ok: false,
            error: { code: 'E_CANCELLED', message: 'Операция отменена пользователем' },
          },
    );
  } else {
    diagnostics = redact(String(pipelineResult.error));
    outcomes = units.map((u) => {
      if (completedUnits.has(u)) return u.getOutcome();
      if (u.ownsStep(pipelineResult.stepId)) {
        return { protocol: u.protocolId, ok: false, error: u.toAppError(pipelineResult.error) };
      }
      return {
        protocol: u.protocolId,
        ok: false,
        error: { code: 'E_CANCELLED', message: 'Пропущено из-за ошибки другого протокола' },
      };
    });
  }

  const notAvailable: ProtocolOutcome[] = unsupported.map((protocol) => ({
    protocol,
    ok: false,
    error: { code: 'E_UNKNOWN', message: 'Протокол пока не поддерживается' },
  }));

  return {
    runId,
    ok: outcomes.some((o) => o.ok),
    outcomes: [...outcomes, ...notAvailable],
    warnings,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}
