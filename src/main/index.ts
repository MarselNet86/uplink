import { app, BrowserWindow, nativeTheme, session, shell } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc/registry';
import { requestCancelAll } from './pipeline/runRegistry';
import { disposeAllSessions } from './ssh/sessionRegistry';

/** Domains allowed to be opened in the OS browser via shell.openExternal. */
const EXTERNAL_URL_ALLOWLIST = new Set<string>(['github.com', 't.me']);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 680,
    resizable: false,
    autoHideMenuBar: true,
    // Matches --well from the renderer's dark palette - the OS chrome (title
    // bar, this background shown before the page paints) otherwise defaults
    // to a light system theme that flashes against the app's black content.
    backgroundColor: '#0a0a0a',
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

  // BUG-03: closing the window via its own close button did not stop an
  // in-flight install/remove or close its SSH session - on macOS the
  // process keeps running after `window-all-closed` with no window left to
  // show progress in, and the run completed entirely unseen. Cancelling
  // stops any step that hasn't started yet; disposing every session aborts
  // whatever step is currently running by killing its connection outright,
  // since a merely-cancelled Pipeline still lets that step finish on its
  // own (tech.md 5.12).
  win.on('close', () => {
    requestCancelAll();
    disposeAllSessions();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  // The app has no light variant, so its title bar shouldn't have one either -
  // without this the OS chrome defaults to whatever the system theme is,
  // which is a light grey title bar sitting on top of a black window on most
  // machines. Set before createWindow() so the bar is never briefly light.
  nativeTheme.themeSource = 'dark';

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
