import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressEvent, StepId } from '@shared/types';
import { ProgressReporter } from '../../src/main/pipeline/ProgressReporter';

const STEPS = [
  { id: 'base-packages' as StepId, title: 'Base packages', weight: 5 },
  { id: 'xray-install' as StepId, title: 'Installing core', weight: 25 },
  { id: 'xray-verify' as StepId, title: 'Verifying', weight: 70 },
];

function makeReporter(events: ProgressEvent[]) {
  return new ProgressReporter(STEPS, 'run-1', (event) => events.push(event));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ProgressReporter', () => {
  it('start() emits the full step list as pending', () => {
    const events: ProgressEvent[] = [];
    makeReporter(events).start();

    expect(events).toEqual([
      {
        runId: 'run-1',
        type: 'started',
        steps: STEPS.map((s) => ({ id: s.id, title: s.title, status: 'pending' })),
      },
    ]);
  });

  it('computes percent as done-weight over total-weight, floored', () => {
    const reporter = makeReporter([]);
    expect(reporter.percent()).toBe(0);

    reporter.onStepStatus('base-packages', 'done');
    expect(reporter.percent()).toBe(5); // 5/100

    reporter.onStepStatus('xray-install', 'done');
    expect(reporter.percent()).toBe(30); // 30/100
  });

  it('throttles step events to at most one per 200ms, keeping the latest', () => {
    const events: ProgressEvent[] = [];
    const reporter = makeReporter(events);

    reporter.onStepStatus('base-packages', 'running');
    reporter.onStepStatus('base-packages', 'done');
    expect(events).toHaveLength(1); // only the first fired immediately; second is pending

    vi.advanceTimersByTime(200);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'step', stepId: 'base-packages', status: 'done' });
  });

  it('finish() bypasses the throttle and cancels any pending step event', () => {
    const events: ProgressEvent[] = [];
    const reporter = makeReporter(events);

    reporter.onStepStatus('base-packages', 'running');
    reporter.onStepStatus('base-packages', 'done'); // queued, not yet flushed
    reporter.finish({ runId: 'run-1', ok: true, outcomes: [], warnings: [] });

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      runId: 'run-1',
      type: 'finished',
      result: { runId: 'run-1', ok: true, outcomes: [], warnings: [] },
    });

    vi.advanceTimersByTime(1000);
    expect(events).toHaveLength(2); // the queued step event never fires after finish()
  });
});
