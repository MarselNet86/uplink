import { describe, expect, it } from 'vitest';
import type { StepId, StepStatus } from '@shared/types';
import type { IProgressSink, Step } from '../../src/main/pipeline/Step';
import {
  RunTrackingSink,
  buildBackupStep,
  buildRollback,
  buildRunResult,
  mergeStepsById,
} from '../../src/main/ipc/runOrchestration';
import type { TrackableUnit } from '../../src/main/ipc/runOrchestration';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

function step(id: string, run: () => Promise<void> = async () => {}): Step {
  return { id: id as StepId, title: id, weight: 1, critical: true, run };
}

function recordingSink(): IProgressSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onStepStatus: (id, status) => calls.push(`${id}:${status}`),
    onNote: (message) => calls.push(`note:${message}`),
  };
}

function unit(
  overrides: Partial<TrackableUnit> & { protocolId: TrackableUnit['protocolId'] },
): TrackableUnit {
  return {
    startStepId: 'xray-config',
    finishStepId: 'xray-verify',
    getOutcome: () => ({ protocol: overrides.protocolId, ok: true }),
    ownsStep: () => false,
    toAppError: () => ({ code: 'E_UNKNOWN', message: 'boom' }),
    ...overrides,
  };
}

describe('mergeStepsById', () => {
  it('merges steps sharing an id into one that runs both in sequence, keeping first-seen order', async () => {
    const order: string[] = [];
    const steps = [
      step('base-packages', async () => {
        order.push('a1');
      }),
      step('xray-install'),
      step('base-packages', async () => {
        order.push('a2');
      }),
    ];

    const merged = mergeStepsById(steps);
    expect(merged.map((s) => s.id)).toEqual(['base-packages', 'xray-install']);

    await merged[0]?.run({ isCancelled: () => false });
    expect(order).toEqual(['a1', 'a2']);
  });

  it('is a no-op when every id is unique', () => {
    const steps = [step('a'), step('b'), step('c')];
    expect(mergeStepsById(steps).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildBackupStep', () => {
  it('creates the backup dir and copies each existing config path into it', async () => {
    const runner = new FakeCommandRunner();
    runner.setDefault({ code: 0 });

    await buildBackupStep(runner, ['/usr/local/etc/xray', '/etc/hysteria']).run({
      isCancelled: () => false,
    });

    expect(runner.calls.some((c) => c.startsWith('mkdir -p'))).toBe(true);
    expect(runner.calls.some((c) => c.includes("test -e '/usr/local/etc/xray'"))).toBe(true);
    expect(runner.calls.some((c) => c.includes("test -e '/etc/hysteria'"))).toBe(true);
  });

  it('does nothing when there are no config paths', async () => {
    const runner = new FakeCommandRunner();
    await buildBackupStep(runner, []).run({ isCancelled: () => false });
    expect(runner.calls).toHaveLength(0);
  });
});

describe('RunTrackingSink', () => {
  it('treats a remover unit (start === finish) as completed the moment its single step is done', () => {
    const sink = new RunTrackingSink(recordingSink(), [
      unit({
        protocolId: 'vless-reality',
        startStepId: 'xray-remove',
        finishStepId: 'xray-remove',
      }),
    ]);

    sink.onStepStatus('xray-remove', 'running');
    expect(sink.inFlightUnits).toHaveLength(0);
    sink.onStepStatus('xray-remove', 'done');

    expect(sink.inFlightUnits).toHaveLength(0);
    expect(sink.completedUnits).toHaveLength(1);
  });

  it('treats an installer unit as in-flight between its config and verify steps', () => {
    const installerUnit = unit({
      protocolId: 'vless-reality',
      startStepId: 'xray-config',
      finishStepId: 'xray-verify',
    });
    const sink = new RunTrackingSink(recordingSink(), [installerUnit]);

    sink.onStepStatus('xray-config', 'done');
    expect(sink.inFlightUnits).toEqual([installerUnit]);
    expect(sink.completedUnits).toHaveLength(0);

    sink.onStepStatus('xray-verify', 'done');
    expect(sink.inFlightUnits).toHaveLength(0);
    expect(sink.completedUnits).toEqual([installerUnit]);
  });

  it('forwards every status change to the inner sink unchanged', () => {
    const inner = recordingSink();
    const sink = new RunTrackingSink(inner, []);
    sink.onStepStatus('preflight', 'running' as StepStatus);
    sink.onNote('hello');
    expect(inner.calls).toEqual(['preflight:running', 'note:hello']);
  });
});

describe('buildRollback', () => {
  it('rolls back only units currently in flight, skipping units without a rollback method', async () => {
    const rolledBack: string[] = [];
    const withRollback = unit({
      protocolId: 'vless-reality',
      startStepId: 'xray-config',
      finishStepId: 'xray-verify',
      rollback: async () => {
        rolledBack.push('vless-reality');
      },
    });
    const withoutRollback = unit({
      protocolId: 'hysteria2',
      startStepId: 'hy2-remove',
      finishStepId: 'hy2-remove',
    });

    const sink = new RunTrackingSink(recordingSink(), [withRollback, withoutRollback]);
    sink.onStepStatus('xray-config', 'done'); // in flight, not yet finished
    // hy2-remove never reached "done", so withoutRollback stays untouched either way.

    await buildRollback(sink)();
    expect(rolledBack).toEqual(['vless-reality']);
  });
});

describe('buildRunResult', () => {
  const baseUnit = unit({ protocolId: 'vless-reality' });

  it('completed: every unit gets its real outcome', () => {
    const sink = new RunTrackingSink(recordingSink(), [baseUnit]);
    const result = buildRunResult('run-1', { status: 'completed' }, [baseUnit], sink, [], []);
    expect(result.ok).toBe(true);
    expect(result.outcomes).toEqual([{ protocol: 'vless-reality', ok: true }]);
  });

  it('cancelled: a unit that already finished keeps its outcome, others are marked cancelled', () => {
    const finished = unit({ protocolId: 'vless-reality' });
    const interrupted = unit({
      protocolId: 'hysteria2',
      startStepId: 'hy2-config',
      finishStepId: 'hy2-verify',
    });
    const sink = new RunTrackingSink(recordingSink(), [finished, interrupted]);
    sink.onStepStatus('xray-config', 'done');
    sink.onStepStatus('xray-verify', 'done'); // finished completes its window

    const result = buildRunResult(
      'run-1',
      { status: 'cancelled' },
      [finished, interrupted],
      sink,
      [],
      [],
    );

    expect(result.outcomes).toEqual([
      { protocol: 'vless-reality', ok: true },
      {
        protocol: 'hysteria2',
        ok: false,
        error: { code: 'E_CANCELLED', message: 'Operation cancelled by user' },
      },
    ]);
  });

  it('failed: the owning unit gets the real error, others get the skipped message', () => {
    const failing = unit({
      protocolId: 'vless-reality',
      ownsStep: (id) => id === 'xray-validate',
      toAppError: () => ({ code: 'E_CONFIG_INVALID', message: 'bad config' }),
    });
    const other = unit({ protocolId: 'hysteria2', ownsStep: () => false });
    const sink = new RunTrackingSink(recordingSink(), [failing, other]);

    const result = buildRunResult(
      'run-1',
      { status: 'failed', stepId: 'xray-validate' as StepId, error: new Error('bad config') },
      [failing, other],
      sink,
      [],
      [],
    );

    expect(result.outcomes).toEqual([
      {
        protocol: 'vless-reality',
        ok: false,
        error: { code: 'E_CONFIG_INVALID', message: 'bad config' },
      },
      {
        protocol: 'hysteria2',
        ok: false,
        error: { code: 'E_CANCELLED', message: 'Skipped because another protocol failed' },
      },
    ]);
    expect(result.diagnostics).toContain('bad config');
  });

  it('appends an E_UNKNOWN outcome for every unsupported protocol', () => {
    const sink = new RunTrackingSink(recordingSink(), []);
    const result = buildRunResult('run-1', { status: 'completed' }, [], sink, ['hysteria2'], []);
    expect(result.outcomes).toEqual([
      {
        protocol: 'hysteria2',
        ok: false,
        error: { code: 'E_UNKNOWN', message: expect.any(String) },
      },
    ]);
  });
});
