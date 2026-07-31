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

export function clearRun(runId: string): void {
  cancelFlags.delete(runId);
}
