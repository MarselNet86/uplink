import type { CommandResult, ICommandRunner } from '../../src/main/ssh/types';

/**
 * Scripted ICommandRunner for domain tests (tech.md 5.2 / 11.5-11.6):
 * queue exact responses per command, or fall back to a default handler.
 * No real SSH connection needed, so installers/preflight/PlanBuilder
 * tests never touch a real VPS.
 */
export class FakeCommandRunner implements ICommandRunner {
  readonly calls: string[] = [];
  private readonly scripted = new Map<string, CommandResult>();
  private defaultResult: CommandResult = { code: 0, stdout: '', stderr: '', durationMs: 0 };

  /** Registers the exact result returned the next time `command` runs. */
  script(command: string, result: Partial<CommandResult>): void {
    this.scripted.set(command, { code: 0, stdout: '', stderr: '', durationMs: 0, ...result });
  }

  /** Result returned for any command without a scripted response. */
  setDefault(result: Partial<CommandResult>): void {
    this.defaultResult = { code: 0, stdout: '', stderr: '', durationMs: 0, ...result };
  }

  async run(command: string): Promise<CommandResult> {
    this.calls.push(command);
    return this.scripted.get(command) ?? this.defaultResult;
  }

  /**
   * Fakes don't need real sudo-wrapping semantics (that's covered at the
   * CommandRunner level) - tests script against the plain command string,
   * same map as run().
   */
  async runPrivileged(command: string): Promise<CommandResult> {
    return this.run(command);
  }
}
