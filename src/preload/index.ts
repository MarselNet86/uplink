import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { DEMO_IPC, IPC } from '@shared/ipc';
import type {
  DemoPingRequest,
  DemoPingResponse,
  HostkeyConfirmRequest,
  HostKeyPromptEvent,
} from '@shared/schemas';

/**
 * Thin, typed bridge. No business logic - only whitelisted channel calls.
 * This is the sole surface the renderer has onto the outside world.
 */
const api = {
  demoPing: (payload: DemoPingRequest): Promise<DemoPingResponse> =>
    ipcRenderer.invoke(DEMO_IPC.DEMO_PING, payload),

  confirmHostKey: (payload: HostkeyConfirmRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.HOSTKEY_CONFIRM, payload),

  onHostKeyPrompt: (callback: (event: HostKeyPromptEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: HostKeyPromptEvent): void =>
      callback(payload);
    ipcRenderer.on(IPC.HOSTKEY_PROMPT, listener);
    return () => ipcRenderer.removeListener(IPC.HOSTKEY_PROMPT, listener);
  },
};

export type UplinkApi = typeof api;

contextBridge.exposeInMainWorld('uplink', api);
