import { Client } from 'ssh2';
import type { ServerCredentials } from '@shared/types';
import type { ErrorCode } from '@shared/errors';
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

  private readonly host: string;

  private constructor(
    private readonly client: Client,
    credentials: ServerCredentials,
  ) {
    this.commandRunner = new CommandRunner(client, credentials.username, credentials.password);
    this.fileTransfer = new FileTransfer(client);
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
      let hostKeyRejected = false;
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
        reject(mapConnectError(err, hostKeyRejected));
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
          ).then((accepted) => {
            hostKeyRejected = !accepted;
            verify(accepted);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.client.end();
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_TIMEOUT_MS);
  }
}

async function resolveHostKeyDecision(
  hostKeyStore: HostKeyStore,
  host: string,
  port: number,
  fingerprint: string,
  onUnknownHostKey: (prompt: HostKeyPrompt) => Promise<boolean>,
): Promise<boolean> {
  const decision = await hostKeyStore.check(host, port, fingerprint);
  if (decision === 'match') return true;
  if (decision === 'mismatch') return false;

  const accepted = await onUnknownHostKey({ host, port, fingerprint });
  if (!accepted) return false;
  await hostKeyStore.trust(host, port, fingerprint);
  return true;
}

function mapConnectError(err: SshErrorLike, hostKeyRejected: boolean): SshConnectError {
  if (hostKeyRejected) {
    return new SshConnectError('E_SSH_HOSTKEY_MISMATCH', 'The server fingerprint has changed');
  }
  if (err.level === 'client-authentication') {
    return new SshConnectError('E_SSH_AUTH', 'Failed to authenticate over SSH');
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH') {
    return new SshConnectError('E_NET_UNREACHABLE', 'Server is unreachable');
  }
  return new SshConnectError('E_UNKNOWN', err.message || 'Unknown SSH error');
}
