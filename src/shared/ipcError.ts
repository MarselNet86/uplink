import { appErrorSchema } from './schemas';
import type { AppError } from './types';

/**
 * Convention for carrying a structured AppError across ipcRenderer.invoke:
 * Electron only preserves an Error's `message` string over the IPC
 * boundary, so main encodes the AppError as JSON behind a marker and
 * preload decodes it back out of the rejected Error's message.
 */
const MARKER = 'UPLINK_APP_ERROR:';

export function encodeAppError(error: AppError): string {
  return MARKER + JSON.stringify(error);
}

export function decodeAppError(message: string): AppError | null {
  const idx = message.indexOf(MARKER);
  if (idx === -1) return null;
  try {
    // zod's inferred optional (`hint?: string | undefined`) is a strictly
    // wider type than the hand-written AppError under
    // exactOptionalPropertyTypes; the schema already guarantees the shape.
    return appErrorSchema.parse(JSON.parse(message.slice(idx + MARKER.length))) as AppError;
  } catch {
    return null;
  }
}
