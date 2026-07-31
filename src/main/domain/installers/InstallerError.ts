import type { ErrorCode } from '@shared/errors';

/** Typed failure for an installer phase; BaseInstaller.install() maps it to ProtocolOutcome.error. */
export class InstallerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InstallerError';
  }
}
