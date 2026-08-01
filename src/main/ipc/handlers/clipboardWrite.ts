import { clipboard } from 'electron';
import { clipboardWriteRequestSchema } from '@shared/schemas';

/**
 * Copies text to the OS clipboard from the main process (tech.md section 6,
 * v4). The renderer runs sandboxed from a file:// origin, where the async
 * `navigator.clipboard` API is not dependably available - copy buttons
 * silently did nothing. Electron's own clipboard module has no such
 * constraint, so every copy action in the UI routes through here.
 */
export function handleClipboardWrite(_event: Electron.IpcMainInvokeEvent, payload: unknown): void {
  const { text } = clipboardWriteRequestSchema.parse(payload);
  clipboard.writeText(text);
}
