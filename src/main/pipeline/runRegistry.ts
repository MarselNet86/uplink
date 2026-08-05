import type { CancelToken } from './Pipeline';

/** Tracks the cancel flag for each in-flight install/remove run (tech.md 5.12). */
const cancelFlags = new Map<string, boolean>();

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
}
