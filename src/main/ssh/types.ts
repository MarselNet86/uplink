/**
 * Command execution and file transfer contracts. Frozen shape per
 * tech.md section 5.2 - the domain layer depends only on these
 * interfaces, never on ssh2 directly, so tests can inject fakes.
 */
export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ICommandRunner {
  run(command: string, opts?: { timeoutMs?: number; stdin?: string }): Promise<CommandResult>;
  /**
   * Runs a command that needs root, wrapping it with sudo when the SSH
   * user isn't root (tech.md 5.1). Kept as a second interface method
   * rather than folded into run() so preflight's own `id -u`/`sudo -n
   * true` probes can call run() unwrapped and get an honest answer.
   */
  runPrivileged(command: string, opts?: { timeoutMs?: number }): Promise<CommandResult>;
}

export interface IFileTransfer {
  writeFile(remotePath: string, content: string, mode: number): Promise<void>;
}
