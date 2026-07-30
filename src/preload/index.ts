import { contextBridge, ipcRenderer } from 'electron';
import { DEMO_IPC } from '@shared/ipc';
import type { DemoPingRequest, DemoPingResponse } from '@shared/schemas';

/**
 * Thin, typed bridge. No business logic - only whitelisted channel calls.
 * This is the sole surface the renderer has onto the outside world.
 */
const api = {
  demoPing: (payload: DemoPingRequest): Promise<DemoPingResponse> =>
    ipcRenderer.invoke(DEMO_IPC.DEMO_PING, payload),
};

export type UplinkApi = typeof api;

contextBridge.exposeInMainWorld('uplink', api);
