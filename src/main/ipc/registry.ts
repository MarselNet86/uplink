import { ipcMain } from 'electron';
import { DEMO_IPC, IPC } from '@shared/ipc';
import { handleDemoPing } from './handlers/demoPing';
import { handleHostkeyConfirm } from './handlers/hostkeyConfirm';
import { handleSessionClose } from './handlers/sessionClose';
import { handleSshCheck } from './handlers/sshCheck';

/** Single place where every ipcMain handler is registered. */
export function registerIpcHandlers(): void {
  ipcMain.handle(DEMO_IPC.DEMO_PING, handleDemoPing);
  ipcMain.handle(IPC.HOSTKEY_CONFIRM, handleHostkeyConfirm);
  ipcMain.handle(IPC.SSH_CHECK, handleSshCheck);
  ipcMain.handle(IPC.SESSION_CLOSE, handleSessionClose);
}
