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
