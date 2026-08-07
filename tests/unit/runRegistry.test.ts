import { describe, expect, it } from 'vitest';
import {
  claimSessionRun,
  clearRun,
  createCancelToken,
  requestCancel,
  requestCancelAll,
} from '../../src/main/pipeline/runRegistry';

describe('claimSessionRun', () => {
  it('claims a free session and reports the run already in flight on a second attempt', () => {
    expect(claimSessionRun('session-a', 'run-1')).toBeUndefined();
    // A double-clicked Install is the same request, so the caller hands back
    // the existing RunHandle instead of starting a second pipeline over one
    // SSH session - install:start awaits ProtocolDetector before it resolves,
    // which is a wide enough window to hit by hand.
    expect(claimSessionRun('session-a', 'run-2')).toBe('run-1');
    expect(claimSessionRun('session-a', 'run-3')).toBe('run-1');
  });

  it('keeps sessions independent of each other', () => {
    expect(claimSessionRun('session-b', 'run-b')).toBeUndefined();
    expect(claimSessionRun('session-c', 'run-c')).toBeUndefined();
  });

  it('releases the session on clearRun so the next run can claim it', () => {
    expect(claimSessionRun('session-d', 'run-d1')).toBeUndefined();
    clearRun('run-d1');
    expect(claimSessionRun('session-d', 'run-d2')).toBeUndefined();
  });

  it('leaves an unrelated claim alone when another run is cleared', () => {
    expect(claimSessionRun('session-e', 'run-e')).toBeUndefined();
    clearRun('run-somebody-else');
    expect(claimSessionRun('session-e', 'run-e2')).toBe('run-e');
  });
});

describe('cancel flags', () => {
  it('reports false for a runId that was never registered', () => {
    expect(requestCancel('never-created')).toBe(false);
  });

  it('flips the token of a registered run', () => {
    const token = createCancelToken('run-cancel');
    expect(token.isRequested()).toBe(false);
    expect(requestCancel('run-cancel')).toBe(true);
    expect(token.isRequested()).toBe(true);
    clearRun('run-cancel');
  });

  it('cancels every tracked run at once when the window closes (BUG-03)', () => {
    const first = createCancelToken('run-all-1');
    const second = createCancelToken('run-all-2');

    requestCancelAll();

    expect(first.isRequested()).toBe(true);
    expect(second.isRequested()).toBe(true);
    clearRun('run-all-1');
    clearRun('run-all-2');
  });
});
