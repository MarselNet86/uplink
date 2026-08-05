import type { SshSession } from './SshSession';

interface SessionEntry {
  session: SshSession;
  host: string;
}

/**
 * Keeps the one live SshSession per sessionId alive across IPC calls, from
 * ssh:check through install/remove (tech.md 5.1: one connect per run).
 * The host is stored alongside so token extraction on protocols:refresh can
 * build connection links without re-reading credentials from the renderer.
 */
const sessions = new Map<string, SessionEntry>();

export function registerSession(sessionId: string, session: SshSession, host: string): void {
  sessions.set(sessionId, { session, host });
  // The idle timer disposes the session itself (SshSession has no notion of
  // sessionId), but the Map entry has to be dropped too - otherwise
  // getSession() keeps "finding" a disposed session after the timeout fires
  // (BUG-01/E-06: a stale entry made the friendly "session not found" path
  // unreachable, so the caller went on to use a dead client instead).
  session.onIdleTimeout(() => {
    if (sessions.get(sessionId)?.session === session) sessions.delete(sessionId);
  });
}

export function getSession(sessionId: string): SshSession | undefined {
  return sessions.get(sessionId)?.session;
}

export function getSessionHost(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.host;
}

export function disposeSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.session.dispose();
  sessions.delete(sessionId);
}

/**
 * Tears down every live session (BUG-03): closing the window has no single
 * sessionId to target, and a merely-cancelled Pipeline still lets its
 * currently-running step finish on its own (tech.md 5.12) - disposing the
 * connection outright is what actually stops an in-flight command instead
 * of letting the whole run complete unseen in the background.
 */
export function disposeAllSessions(): void {
  for (const sessionId of [...sessions.keys()]) disposeSession(sessionId);
}
