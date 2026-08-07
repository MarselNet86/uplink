import type { CancelToken } from './Pipeline';

/** Tracks the cancel flag for each in-flight install/remove run (tech.md 5.12). */
const cancelFlags = new Map<string, boolean>();

/**
 * sessionId -> runId for every run still in flight. One SSH session can only
 * carry one run: the steps write the same config paths and drive the same
 * systemd units, so two concurrent pipelines corrupt each other's work.
 *
 * The window is real and wide enough to hit by hand - install:start awaits
 * ProtocolDetector before it returns, and the renderer only leaves step 2
 * once the first progress event arrives - so double-clicking Install fired
 * two full runs down one session.
 */
const sessionRuns = new Map<string, string>();

/**
 * Claims the session for `runId`. Returns the runId already in flight when
 * there is one, so the caller can hand back that existing RunHandle instead
 * of starting a second run - a repeated click is the same request, not an
 * error worth showing.
 */
export function claimSessionRun(sessionId: string, runId: string): string | undefined {
  const active = sessionRuns.get(sessionId);
  if (active !== undefined) return active;
  sessionRuns.set(sessionId, runId);
  return undefined;
}

export function createCancelToken(runId: string): CancelToken {
  cancelFlags.set(runId, false);
  return { isRequested: () => cancelFlags.get(runId) === true };
}

/** Returns true if the run was known and the cancel flag was set. */
export function requestCancel(runId: string): boolean {
  if (!cancelFlags.has(runId)) return false;
  cancelFlags.set(runId, true);
  return true;
}

/**
 * Requests cancellation of every currently tracked run (BUG-03): the window
 * being closed has no `runId` of its own to target, and on macOS the app
 * process keeps running after `window-all-closed` with no window left to
 * show progress in - without this, an in-flight install/remove pipeline
 * ran to completion entirely unseen and unstoppable.
 */
export function requestCancelAll(): void {
  for (const runId of cancelFlags.keys()) cancelFlags.set(runId, true);
}

export function clearRun(runId: string): void {
  cancelFlags.delete(runId);
  for (const [sessionId, active] of sessionRuns) {
    if (active === runId) sessionRuns.delete(sessionId);
  }
}
