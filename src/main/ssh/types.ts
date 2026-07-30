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
}

export interface IFileTransfer {
  writeFile(remotePath: string, content: string, mode: number): Promise<void>;
}
