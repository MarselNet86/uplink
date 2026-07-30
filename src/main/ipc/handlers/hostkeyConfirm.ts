import type { IpcMainInvokeEvent } from 'electron';
import { hostkeyConfirmRequestSchema } from '@shared/schemas';
import { resolveHostKeyPrompt } from '../hostKeyPrompts';

export function handleHostkeyConfirm(_event: IpcMainInvokeEvent, payload: unknown): void {
  const { promptId, accepted } = hostkeyConfirmRequestSchema.parse(payload);
  resolveHostKeyPrompt(promptId, accepted);
}
