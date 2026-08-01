import type { AppError } from '@shared/types';
import { ERROR_TEXT } from './errorText';

/**
 * Everything the app knows about one failure, as plain text the user can
 * paste into a bug report. `AppError.message`/`.hint` carry the technical
 * detail main produced (an ssh2 message, a failed command's stderr); the
 * UI otherwise only ever shows the friendly ERROR_TEXT copy, so without
 * this the real cause never leaves the process.
 *
 * Safe to copy out: main already ran redact() over anything derived from
 * command output, and the SSH password never enters a command string.
 */
export function buildErrorReport(error: AppError, context?: string): string {
  const lines = [
    `Uplink · ${new Date().toISOString()}`,
    context ? `Контекст: ${context}` : null,
    `Код: ${error.code}`,
    `Заголовок: ${ERROR_TEXT[error.code].title}`,
    `Детали: ${error.message}`,
    error.hint ? `Дополнительно: ${error.hint}` : null,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}
