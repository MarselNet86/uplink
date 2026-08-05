import { Client } from 'ssh2';
import type { ServerCredentials } from '@shared/types';
import type { ErrorCode } from '@shared/errors';
import { classifySshError } from './classifySshError';
import { CommandRunner } from './CommandRunner';
import { FileTransfer } from './FileTransfer';
import { HostKeyStore, computeFingerprint } from './HostKeyStore';

const READY_TIMEOUT_MS = 15_000;
const KEEPALIVE_INTERVAL_MS = 10_000;
const KEEPALIVE_COUNT_MAX = 3;
const IDLE_TIMEOUT_MS = 5 * 60_000;

export interface HostKeyPrompt {
  host: string;
  port: number;
  fingerprint: string;
}

export class SshConnectError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SshConnectError';
  }
}

interface SshErrorLike extends Error {
  level?: string;
  code?: string;
}

/**
 * Owns a single live ssh2 connection for the whole check/install/remove run
 * (tech.md 5.1: one connect per run, torn down on dispose or 5 min idle).
 */
export class SshSession {
  private readonly commandRunner: CommandRunner;
  private readonly fileTransfer: FileTransfer;
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private idleTimeoutHandler: (() => void) | undefined;

  private readonly host: string;

  private constructor(
    private readonly client: Client,
    credentials: ServerCredentials,
  ) {
    // Both actually touch the wire per call, so either one counts as
    // activity and rearms the idle timer - a long-running single command
    // (e.g. an apt-get download) no longer races a timer that was only ever
    // armed once, at session creation (BUG-01).
    const onActivity = (): void => this.armIdleTimer();
    this.commandRunner = new CommandRunner(
      client,
      credentials.username,
      credentials.password,
      onActivity,
    );
    this.fileTransfer = new FileTransfer(client, onActivity);
    this.host = credentials.host;
    this.armIdleTimer();
  }

  static connect(
    credentials: ServerCredentials,
    hostKeyStore: HostKeyStore,
    onUnknownHostKey: (prompt: HostKeyPrompt) => Promise<boolean>,
  ): Promise<SshSession> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let hostKeyOutcome: HostKeyOutcome = 'accepted';
      let settled = false;

      client.on('ready', () => {
        if (settled) return;
        settled = true;
        resolve(new SshSession(client, credentials));
      });

      client.on('error', (err: SshErrorLike) => {
        if (settled) return;
        settled = true;
        client.end();
        reject(mapConnectError(err, hostKeyOutcome));
      });

      client.connect({
        host: credentials.host,
        port: credentials.port,
        username: credentials.username,
        password: credentials.password,
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: KEEPALIVE_INTERVAL_MS,
        keepaliveCountMax: KEEPALIVE_COUNT_MAX,
        hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
          const fingerprint = computeFingerprint(key);
          void resolveHostKeyDecision(
            hostKeyStore,
            credentials.host,
            credentials.port,
            fingerprint,
            onUnknownHostKey,
          ).then((outcome) => {
            hostKeyOutcome = outcome;
            verify(outcome === 'accepted');
          });
        },
      });
    });
  }

  getCommandRunner(): CommandRunner {
    this.armIdleTimer();
    return this.commandRunner;
  }

  getFileTransfer(): FileTransfer {
    this.armIdleTimer();
    return this.fileTransfer;
  }

  getHost(): string {
    return this.host;
  }

  /** Registered by sessionRegistry so a timer-triggered dispose also drops the now-dead session from its Map (tech.md 5.1; BUG-01's E-06 sub-case: without this, `getSession()` kept returning a disposed session). */
  onIdleTimeout(handler: () => void): void {
    this.idleTimeoutHandler = handler;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.client.end();
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.dispose();
      this.idleTimeoutHandler?.();
    }, IDLE_TIMEOUT_MS);
  }
}

/**
 * 'declined-new' (user said no to a server with no stored fingerprint yet)
 * is deliberately its own case, distinct from 'mismatch' (a stored
 * fingerprint that no longer matches) - BUG-20: both used to collapse into
 * the same boolean, so declining to trust a brand-new server showed the same
 * "fingerprint has changed / possible MITM" alarm as an actual, dangerous
 * mismatch.
 */
type HostKeyOutcome = 'accepted' | 'declined-new' | 'mismatch';

async function resolveHostKeyDecision(
  hostKeyStore: HostKeyStore,
  host: string,
  port: number,
  fingerprint: string,
  onUnknownHostKey: (prompt: HostKeyPrompt) => Promise<boolean>,
): Promise<HostKeyOutcome> {
  const decision = await hostKeyStore.check(host, port, fingerprint);
  if (decision === 'match') return 'accepted';
  if (decision === 'mismatch') return 'mismatch';

  const accepted = await onUnknownHostKey({ host, port, fingerprint });
  if (!accepted) return 'declined-new';
  await hostKeyStore.trust(host, port, fingerprint);
  return 'accepted';
}

function mapConnectError(err: SshErrorLike, hostKeyOutcome: HostKeyOutcome): SshConnectError {
  if (hostKeyOutcome === 'mismatch') {
    return new SshConnectError('E_SSH_HOSTKEY_MISMATCH', 'The server fingerprint has changed');
  }
  if (hostKeyOutcome === 'declined-new') {
    return new SshConnectError('E_CANCELLED', 'Server fingerprint was not trusted');
  }
  if (err.level === 'client-authentication') {
    return new SshConnectError('E_SSH_AUTH', 'Failed to authenticate over SSH');
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH') {
    return new SshConnectError('E_NET_UNREACHABLE', 'Server is unreachable');
  }
  if (err.level === 'client-timeout') {
    return new SshConnectError('E_TIMEOUT', err.message || 'Timed out connecting to the server');
  }
  // Covers ssh2's own free-text failures with no stable level/code (BUG-15,
  // confirmed live via four different triggers): a slow trust-dialog
  // decision, a silently dropped connection, a wrong port, and a transient
  // channel failure all used to collapse into E_UNKNOWN here.
  const classified = classifySshError(err.message || '');
  if (classified !== 'E_UNKNOWN') {
    return new SshConnectError(classified, err.message || 'SSH connection error');
  }
  return new SshConnectError('E_UNKNOWN', err.message || 'Unknown SSH error');
}
