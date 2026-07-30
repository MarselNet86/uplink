import type { SshSession } from './SshSession';

/**
 * Keeps the one live SshSession per sessionId alive across IPC calls, from
 * ssh:check through install/remove (tech.md 5.1: one connect per run).
 */
const sessions = new Map<string, SshSession>();

export function registerSession(sessionId: string, session: SshSession): void {
  sessions.set(sessionId, session);
}

export function getSession(sessionId: string): SshSession | undefined {
  return sessions.get(sessionId);
}

export function disposeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.dispose();
  sessions.delete(sessionId);
}
