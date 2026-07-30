import type { IpcMainInvokeEvent } from 'electron';
import { demoPingRequestSchema, type DemoPingResponse } from '@shared/schemas';

/**
 * Stage 0 skeleton-only handler proving the invoke round-trip end to end.
 * Removed once ssh:check lands in stage 2.
 */
export function handleDemoPing(_event: IpcMainInvokeEvent, payload: unknown): DemoPingResponse {
  const request = demoPingRequestSchema.parse(payload);
  return { echo: request.message, receivedAt: Date.now() };
}
