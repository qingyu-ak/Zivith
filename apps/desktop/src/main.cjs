const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');

const WEB_URL = process.env.ZIVITH_WEB_URL ?? 'http://127.0.0.1:3100';

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Zivith',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadURL(WEB_URL);
}

app.whenReady().then(() => {
  ipcMain.handle('workspace:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择世界文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
