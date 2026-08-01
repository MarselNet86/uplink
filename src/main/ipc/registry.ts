import { ipcMain } from 'electron';
import { DEMO_IPC, FILE_IPC, IPC } from '@shared/ipc';
import { handleClipboardWrite } from './handlers/clipboardWrite';
import { handleDemoPing } from './handlers/demoPing';
import { handleHostkeyConfirm } from './handlers/hostkeyConfirm';
import { handleInstallCancel } from './handlers/installCancel';
import { handleInstallStart } from './handlers/installStart';
import { handleProtocolsRefresh } from './handlers/protocolsRefresh';
import { handleProtocolsRemove } from './handlers/protocolsRemove';
import { handleSaveTextFile } from './handlers/saveTextFile';
import { handleSessionClose } from './handlers/sessionClose';
import { handleSshCheck } from './handlers/sshCheck';

/** Single place where every ipcMain handler is registered. */
export function registerIpcHandlers(): void {
  ipcMain.handle(DEMO_IPC.DEMO_PING, handleDemoPing);
  ipcMain.handle(IPC.HOSTKEY_CONFIRM, handleHostkeyConfirm);
  ipcMain.handle(IPC.SSH_CHECK, handleSshCheck);
  ipcMain.handle(IPC.SESSION_CLOSE, handleSessionClose);
  ipcMain.handle(IPC.INSTALL_START, handleInstallStart);
  ipcMain.handle(IPC.INSTALL_CANCEL, handleInstallCancel);
  ipcMain.handle(IPC.PROTOCOLS_REMOVE, handleProtocolsRemove);
  ipcMain.handle(IPC.PROTOCOLS_REFRESH, handleProtocolsRefresh);
  ipcMain.handle(IPC.CLIPBOARD_WRITE, handleClipboardWrite);
  ipcMain.handle(FILE_IPC.SAVE_TEXT_FILE, handleSaveTextFile);
}
