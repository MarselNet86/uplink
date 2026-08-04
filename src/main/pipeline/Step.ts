import type { StepId, StepStatus } from '@shared/types';

/** Passed to Step.run() so a step can cooperatively check for cancellation mid-flight. */
export interface PipelineContext {
  isCancelled(): boolean;
}

/**
 * A single unit of pipeline work (tech.md 5.11). Weight is relative, not a
 * percentage - ProgressReporter turns weights into 0..100. `critical` is
 * reserved for future non-critical (best-effort) steps; every installer
 * phase today is critical, a thrown error always stops that protocol.
 */
export interface Step {
  id: StepId;
  title: string;
  weight: number;
  critical: boolean;
  run(ctx: PipelineContext): Promise<void>;
}

/**
 * What a Step reports through, per tech.md 10.2 ("the domain depends on the
 * ICommandRunner, IFileTransfer, IProgressSink interfaces"). ProgressReporter
 * is the concrete implementation used in production; Pipeline depends only
 * on this interface so it is testable with a plain recording fake.
 */
export interface IProgressSink {
  onStepStatus(stepId: StepId, status: StepStatus): void;
  onNote(message: string): void;
}
