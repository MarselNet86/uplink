import type { ProgressEvent, RunResult, StepId, StepStatus, StepView } from '@shared/types';
import type { IProgressSink } from './Step';

type StepEvent = Extract<ProgressEvent, { type: 'step' }>;

/**
 * Turns Step status transitions into ProgressEvent objects (tech.md 5.11):
 * percent is `sum(weight done) / sum(weight all) * 100`, floored, and
 * `step` events are throttled to at most one per `throttleMs` so a run with
 * many fast steps doesn't flood the IPC channel. `started`/`note`/`finished`
 * are never throttled - the renderer must see the full step list up front
 * and the final result immediately.
 */
export class ProgressReporter implements IProgressSink {
  private readonly steps: StepView[];
  private readonly weightById: Map<StepId, number>;
  private readonly totalWeight: number;
  private lastEmitAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingEvent: StepEvent | undefined;

  constructor(
    steps: ReadonlyArray<{ id: StepId; title: string; weight: number }>,
    private readonly runId: string,
    private readonly emit: (event: ProgressEvent) => void,
    private readonly throttleMs = 200,
    private readonly now: () => number = Date.now,
  ) {
    this.steps = steps.map((s) => ({ id: s.id, title: s.title, status: 'pending' }));
    this.weightById = new Map(steps.map((s) => [s.id, s.weight]));
    this.totalWeight = steps.reduce((sum, s) => sum + s.weight, 0);
  }

  start(): void {
    this.emit({ runId: this.runId, type: 'started', steps: this.steps.map((s) => ({ ...s })) });
  }

  onStepStatus(stepId: StepId, status: StepStatus): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) step.status = status;
    this.scheduleEmit({ runId: this.runId, type: 'step', stepId, status, percent: this.percent() });
  }

  onNote(message: string): void {
    this.emit({ runId: this.runId, type: 'note', message });
  }

  /** Bypasses the throttle: the final result must never be dropped or delayed. */
  finish(result: RunResult): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    this.pendingEvent = undefined;
    this.emit({ runId: this.runId, type: 'finished', result });
  }

  percent(): number {
    if (this.totalWeight === 0) return 0;
    const doneWeight = this.steps.reduce(
      (sum, s) => sum + (s.status === 'done' ? (this.weightById.get(s.id) ?? 0) : 0),
      0,
    );
    return Math.floor((doneWeight / this.totalWeight) * 100);
  }

  private scheduleEmit(event: StepEvent): void {
    const elapsed = this.now() - this.lastEmitAt;
    if (elapsed >= this.throttleMs) {
      this.flush(event);
      return;
    }
    this.pendingEvent = event;
    if (!this.pendingTimer) {
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = undefined;
        if (this.pendingEvent) this.flush(this.pendingEvent);
      }, this.throttleMs - elapsed);
    }
  }

  private flush(event: StepEvent): void {
    this.lastEmitAt = this.now();
    this.pendingEvent = undefined;
    this.emit(event);
  }
}
