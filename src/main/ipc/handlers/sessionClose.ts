import type { IpcMainInvokeEvent } from 'electron';
import { sessionCloseRequestSchema } from '@shared/schemas';
import { disposeSession } from '../../ssh/sessionRegistry';

export function handleSessionClose(_event: IpcMainInvokeEvent, payload: unknown): void {
  const { sessionId } = sessionCloseRequestSchema.parse(payload);
  disposeSession(sessionId);
}
