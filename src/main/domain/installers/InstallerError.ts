import type { ErrorCode } from '@shared/errors';

/** Typed failure for an installer phase; BaseInstaller.install() maps it to ProtocolOutcome.error. */
export class InstallerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    /** Optional override for the static ERROR_TEXT hint (tech.md section 8's `AppError.hint`) - for failures whose actual cause the static per-code text can't guess (BUG-17/BUG-21/BUG-22). */
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'InstallerError';
  }
}
