import type { ErrorCode } from '@shared/errors';

/**
 * Classifies a raw ssh2/network error message into a meaningful ErrorCode
 * instead of the generic E_UNKNOWN catch-all (BUG-06/BUG-15). ssh2 rarely
 * gives a stable machine-readable code for anything beyond the initial
 * connect, so this matches the exact message text confirmed live across
 * four independent failure paths: a trust-dialog timeout ("Timed out while
 * waiting for handshake"), a silently dropped connection to an unreachable
 * host (same message), a wrong port ("Connection lost before handshake"),
 * and a transient channel failure ("Channel open failure: open failed") -
 * plus the post-connect drop this same wording covers ("Not connected",
 * "This socket has been ended...").
 *
 * Returns 'E_UNKNOWN' when nothing matches - callers keep that as their own
 * fallback, this never invents a code it isn't reasonably sure of.
 */
export function classifySshError(message: string): ErrorCode {
  const text = message.toLowerCase();

  if (text.includes('timed out') || text.includes('timeout')) {
    return 'E_TIMEOUT';
  }

  if (
    text.includes('not connected') ||
    text.includes('connection lost') ||
    text.includes('channel open failure') ||
    text.includes('socket has been ended') ||
    text.includes('econnreset') ||
    text.includes('ehostunreach') ||
    text.includes('econnrefused')
  ) {
    return 'E_NET_UNREACHABLE';
  }

  return 'E_UNKNOWN';
}
