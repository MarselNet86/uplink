import type { Client, ClientChannel } from 'ssh2';
import { shellQuote } from '../security/shellQuote';
import { appendCapped } from './outputBuffer';
import type { CommandResult, ICommandRunner } from './types';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export class CommandRunnerError extends Error {
  constructor(
    public readonly code: 'E_NO_SUDO' | 'E_TIMEOUT',
    message: string,
  ) {
    super(message);
    this.name = 'CommandRunnerError';
  }
}

/**
 * Executes commands over a single live ssh2 Client (tech.md 5.1/5.2).
 * Privileged commands are not auto-wrapped: callers that need root use
 * wrapPrivileged() explicitly, after priming the sudo timestamp once via
 * primeSudo() - this keeps `run()` a plain, predictable command executor
 * matching the frozen ICommandRunner contract.
 */
export class CommandRunner implements ICommandRunner {
  private sudoPrimed = false;

  constructor(
    private readonly client: Client,
    private readonly username: string,
    private readonly password: string,
    /** Called once per command actually sent over the wire (tech.md 5.1's idle timer keys off this, not off getCommandRunner()). */
    private readonly onActivity?: () => void,
  ) {}

  async run(
    command: string,
    opts?: { timeoutMs?: number; stdin?: string },
  ): Promise<CommandResult> {
    return this.exec(command, opts);
  }

  /** ICommandRunner.runPrivileged: primes sudo once, then wraps and runs. */
  async runPrivileged(command: string, opts?: { timeoutMs?: number }): Promise<CommandResult> {
    await this.primeSudo();
    return this.exec(this.wrapPrivileged(command), opts);
  }

  /** Wraps a command that needs root, per tech.md 5.1. No-op when already root. */
  private wrapPrivileged(command: string): string {
    if (this.username === 'root') return command;
    return `sudo -n -S -p '' sh -c ${shellQuote(command)}`;
  }

  /**
   * Primes the sudo timestamp cache once per session by piping the password
   * to `sudo -n -S -p '' true`, so subsequent wrapPrivileged() commands run
   * with `-n` (non-interactive) without needing the password again.
   */
  private async primeSudo(): Promise<void> {
    if (this.sudoPrimed || this.username === 'root') return;
    const result = await this.exec(`sudo -n -S -p '' true`, {
      timeoutMs: 15_000,
      stdin: `${this.password}\n`,
    });
    if (result.code !== 0) {
      throw new CommandRunnerError('E_NO_SUDO', 'sudo is unavailable or the password is wrong');
    }
    this.sudoPrimed = true;
  }

  private exec(
    command: string,
    opts?: { timeoutMs?: number; stdin?: string },
  ): Promise<CommandResult> {
    this.onActivity?.();
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const startedAt = Date.now();

    // Wrapped in the remote `timeout` so a hung command is actually killed
    // on the server, not just detached from (BUG-18: `stream.close()` alone
    // only closes the client's view of the channel - the remote process,
    // e.g. an in-progress apt-get/curl, kept running to completion on its
    // own). `-k 10` sends SIGKILL 10s after the initial SIGTERM for
    // processes that ignore it.
    const wrapped = `timeout -k 10 ${timeoutSec}s sh -c ${shellQuote(command)}`;

    return new Promise((resolve, reject) => {
      this.client.exec(wrapped, (err, stream: ClientChannel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';
        let settled = false;

        // Backstop beyond the server-side `timeout` (+ its kill-after grace)
        // in case the channel itself never reports back at all.
        const timer = setTimeout(
          () => {
            if (settled) return;
            settled = true;
            stream.close();
            reject(new CommandRunnerError('E_TIMEOUT', `command timed out after ${timeoutMs}ms`));
          },
          timeoutMs + 15_000,
        );

        stream.on('data', (chunk: Buffer) => {
          stdout = appendCapped(stdout, chunk.toString('utf8'), MAX_OUTPUT_BYTES);
        });
        stream.stderr.on('data', (chunk: Buffer) => {
          stderr = appendCapped(stderr, chunk.toString('utf8'), MAX_OUTPUT_BYTES);
        });

        stream.on('close', (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // 124 is `timeout`'s own "command was killed" exit code - report
          // it the same way the pre-existing client-side timeout was
          // reported, so callers keep seeing one consistent E_TIMEOUT
          // rejection regardless of which side actually enforced it.
          if (code === 124) {
            reject(new CommandRunnerError('E_TIMEOUT', `command timed out after ${timeoutMs}ms`));
            return;
          }
          resolve({ code: code ?? -1, stdout, stderr, durationMs: Date.now() - startedAt });
        });

        stream.on('error', (streamErr: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(streamErr);
        });

        if (opts?.stdin) stream.write(opts.stdin);
        stream.end();
      });
    });
  }
}
