const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const { prepareApp, stopProcessTree, WEB_URL } = require('./launcher.cjs');

const ICON = path.join(__dirname, '..', 'assets', 'icon.ico');
const SPLASH_HTML = path.join(__dirname, '..', 'assets', 'splash.html');

let mainWindow = null;
let splashWindow = null;
let spawnedServers = null;

function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const payload = JSON.stringify(String(text));
  void splashWindow.webContents.executeJavaScript(
    `void (document.getElementById('status') && (document.getElementById('status').textContent = ${payload}))`,
  );
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 620,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    title: 'Zivith',
    backgroundColor: '#00000000',
    hasShadow: false,
    icon: ICON,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splashWindow.setMenuBarVisibility(false);
  void splashWindow.loadFile(SPLASH_HTML);
  splashWindow.once('ready-to-show', () => splashWindow?.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Zivith',
    backgroundColor: '#ffffff',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void mainWindow.loadURL(WEB_URL);
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.zivith.studio');
    Menu.setApplicationMenu(null);
    ipcMain.handle('workspace:openDirectory', async () => {
      const result = await dialog.showOpenDialog({
        title: '选择世界文件夹',
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    });

    createSplash();
    try {
      const prepared = await prepareApp({ onStatus: setSplashStatus });
      spawnedServers = prepared.keepChild ? null : prepared.child;
      createWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动失败';
      setSplashStatus('启动超时，后台仍在编译');
      spawnedServers = null;
      dialog.showErrorBox(
        'Zivith 未能启动',
        `${message}\n\n本机需要 Node、pnpm、Docker。若刚点过启动，请等一两分钟后再开一次。`,
      );
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopProcessTree(spawnedServers);
  spawnedServers = null;
});
