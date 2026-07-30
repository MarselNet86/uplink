import { ipcMain } from 'electron';
import { DEMO_IPC } from '@shared/ipc';
import { handleDemoPing } from './handlers/demoPing';

/** Single place where every ipcMain handler is registered. */
export function registerIpcHandlers(): void {
  ipcMain.handle(DEMO_IPC.DEMO_PING, handleDemoPing);
}
