import { describe, expect, it } from 'vitest';
import { Pipeline } from '../../src/main/pipeline/Pipeline';
import type { CancelToken } from '../../src/main/pipeline/Pipeline';
import type { IProgressSink, Step } from '../../src/main/pipeline/Step';

function makeSink(): IProgressSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onStepStatus: (stepId, status) => calls.push(`${stepId}:${status}`),
    onNote: (message) => calls.push(`note:${message}`),
  };
}

function makeCancelToken(): CancelToken & { requested: boolean } {
  return {
    requested: false,
    isRequested(): boolean {
      return this.requested;
    },
  };
}

function step(id: string, run: () => Promise<void> = async () => {}): Step {
  return { id: id as Step['id'], title: id, weight: 1, critical: true, run };
}

describe('Pipeline', () => {
  it('runs every step in order and reports running then done', async () => {
    const sink = makeSink();
    const steps = [step('base-packages'), step('xray-install'), step('xray-verify')];
    const outcome = await new Pipeline(steps, sink, makeCancelToken(), undefined, undefined).run();

    expect(outcome).toEqual({ status: 'completed' });
    expect(sink.calls).toEqual([
      'base-packages:running',
      'base-packages:done',
      'xray-install:running',
      'xray-install:done',
      'xray-verify:running',
      'xray-verify:done',
    ]);
  });

  it('stops instantly and skips everything when cancelled before any step runs', async () => {
    const sink = makeSink();
    const cancelToken = makeCancelToken();
    cancelToken.requested = true;
    let rolledBack = false;

    const steps = [step('base-packages'), step('xray-install')];
    const outcome = await new Pipeline(steps, sink, cancelToken, 'xray-config', async () => {
      rolledBack = true;
    }).run();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(sink.calls).toEqual(['base-packages:skipped', 'xray-install:skipped']);
    expect(rolledBack).toBe(false);
  });

  it('finishes the current step, then rolls back once cancelled past the point of no return', async () => {
    const sink = makeSink();
    const cancelToken = makeCancelToken();
    let rolledBack = false;

    const steps = [
      step('base-packages'),
      step('xray-config', async () => {
        cancelToken.requested = true;
      }),
      step('xray-start'),
      step('xray-verify'),
    ];
    const outcome = await new Pipeline(steps, sink, cancelToken, 'xray-config', async () => {
      rolledBack = true;
    }).run();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(sink.calls).toEqual([
      'base-packages:running',
      'base-packages:done',
      'xray-config:running',
      'xray-config:done',
      'xray-start:skipped',
      'xray-verify:skipped',
    ]);
    expect(rolledBack).toBe(true);
  });

  it('stops on a thrown step, skips the rest, and never rolls back a plain failure', async () => {
    const sink = makeSink();
    const cancelToken = makeCancelToken();
    let rolledBack = false;
    const boom = new Error('boom');

    const steps = [
      step('base-packages'),
      step('xray-config'),
      step('xray-validate', async () => {
        throw boom;
      }),
      step('xray-start'),
    ];
    const outcome = await new Pipeline(steps, sink, cancelToken, 'xray-config', async () => {
      rolledBack = true;
    }).run();

    expect(outcome).toEqual({ status: 'failed', stepId: 'xray-validate', error: boom });
    expect(sink.calls).toEqual([
      'base-packages:running',
      'base-packages:done',
      'xray-config:running',
      'xray-config:done',
      'xray-validate:running',
      'xray-validate:failed',
      'xray-start:skipped',
    ]);
    expect(rolledBack).toBe(false);
  });
});
