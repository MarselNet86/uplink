import type { StepId } from '@shared/types';
import type { IProgressSink, PipelineContext, Step } from './Step';

export interface CancelToken {
  isRequested(): boolean;
}

export type PipelineOutcome =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; stepId: StepId; error: unknown };

/**
 * Runs Step[] sequentially (tech.md 5.11/5.12). Before the point-of-no-return
 * step, a cancellation request stops the run instantly with no side effect
 * to clean up. From the point-of-no-return step onward the currently
 * running step is always allowed to finish, then the run stops and
 * `rollback` (if given) is awaited before returning - restoring `.bak` and
 * stopping the service is the caller's job, Pipeline only sequences it.
 */
export class Pipeline {
  constructor(
    private readonly steps: Step[],
    private readonly sink: IProgressSink,
    private readonly cancelToken: CancelToken,
    private readonly pointOfNoReturnStepId: StepId | undefined,
    private readonly rollback: (() => Promise<void>) | undefined,
  ) {}

  async run(): Promise<PipelineOutcome> {
    const ctx: PipelineContext = { isCancelled: () => this.cancelToken.isRequested() };
    const remaining = [...this.steps];
    let pastPoint = false;

    while (remaining.length > 0) {
      const step = remaining.shift();
      if (!step) break;

      if (this.cancelToken.isRequested()) {
        this.skipAll([step, ...remaining]);
        if (pastPoint) await this.rollback?.();
        return { status: 'cancelled' };
      }

      this.sink.onStepStatus(step.id, 'running');
      try {
        await step.run(ctx);
      } catch (error) {
        this.sink.onStepStatus(step.id, 'failed');
        this.skipAll(remaining);
        return { status: 'failed', stepId: step.id, error };
      }
      this.sink.onStepStatus(step.id, 'done');

      if (step.id === this.pointOfNoReturnStepId) pastPoint = true;
    }

    return { status: 'completed' };
  }

  private skipAll(steps: Step[]): void {
    for (const step of steps) this.sink.onStepStatus(step.id, 'skipped');
  }
}
