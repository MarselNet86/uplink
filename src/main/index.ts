import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc/registry';

/** Domains allowed to be opened in the OS browser via shell.openExternal. */
const EXTERNAL_URL_ALLOWLIST = new Set<string>(['github.com', 't.me']);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#EFEFEE',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Only allow navigating within the app's own loaded origin.
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const current = new URL(win.webContents.getURL());
    if (target.origin !== current.origin) {
      event.preventDefault();
    }
  });

  // Deny all popup navigation except the explicit external-domain allowlist,
  // which is opened in the OS browser instead of a new BrowserWindow.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_URL_ALLOWLIST.has(new URL(url).hostname)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  // Deny permission requests (camera, mic, geolocation, etc.) - the app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Block webview creation and enforce the same navigation policy on any
// webContents created outside the main window's own instance.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
