import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { DEMO_IPC, IPC } from '@shared/ipc';
import { decodeAppError } from '@shared/ipcError';
import type { AppError, CheckRequest, CheckResult } from '@shared/types';
import type {
  DemoPingRequest,
  DemoPingResponse,
  HostkeyConfirmRequest,
  HostKeyPromptEvent,
} from '@shared/schemas';

/**
 * Invokes a channel and unwraps a structured AppError from a rejected
 * promise (see shared/ipcError.ts) instead of letting the renderer deal
 * with Electron's generic "Error invoking remote method" text.
 */
async function invokeChecked<T>(channel: string, payload: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T;
  } catch (err) {
    const decoded = err instanceof Error ? decodeAppError(err.message) : null;
    const appError: AppError = decoded ?? { code: 'E_UNKNOWN', message: 'Неизвестная ошибка' };
    return Promise.reject(appError);
  }
}

/**
 * Thin, typed bridge. No business logic - only whitelisted channel calls.
 * This is the sole surface the renderer has onto the outside world.
 */
const api = {
  demoPing: (payload: DemoPingRequest): Promise<DemoPingResponse> =>
    ipcRenderer.invoke(DEMO_IPC.DEMO_PING, payload),

  sshCheck: (payload: CheckRequest): Promise<CheckResult> => invokeChecked(IPC.SSH_CHECK, payload),

  closeSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SESSION_CLOSE, { sessionId }),

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
