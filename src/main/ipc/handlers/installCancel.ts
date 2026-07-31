import type { IpcMainInvokeEvent } from 'electron';
import { installCancelRequestSchema } from '@shared/schemas';
import { requestCancel } from '../../pipeline/runRegistry';

export function handleInstallCancel(
  _event: IpcMainInvokeEvent,
  payload: unknown,
): { accepted: boolean } {
  const { runId } = installCancelRequestSchema.parse(payload);
  return { accepted: requestCancel(runId) };
}
