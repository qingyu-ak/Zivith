const { app, BrowserWindow, ipcMain, dialog, Menu, session, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { prepareApp, stopProcessTree, WEB_URL } = require('./launcher.cjs');
const { startupUrl, writeLastPath } = require('./last-location.cjs');
const {
  applyWindowAppearance,
  chromeForTheme,
  readAppearanceTheme,
  writeAppearanceTheme,
} = require('./window-chrome.cjs');

const ICON = path.join(__dirname, '..', 'assets', 'icon.ico');
const SPLASH_HTML = path.join(__dirname, '..', 'assets', 'splash.html');

let mainWindow = null;
let splashWindow = null;
let spawnedServers = null;

function folderDialogStart(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = path.normalize(trimmed);
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(candidate);
    if (parent && fs.existsSync(parent) && fs.statSync(parent).isDirectory()) return parent;
  } catch {
    return null;
  }
  return null;
}

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

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function sendMaximized(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window:maximized', win.isMaximized());
}

function mainWindowChrome() {
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset' };
  }
  // Windows 11 native overlay buttons stay white regardless of titleBarOverlay.color.
  // Frameless window + in-app controls so the chrome matches --z-chrome.
  return { frame: false };
}

function storedAppearanceTheme() {
  return readAppearanceTheme(app.getPath('userData'));
}

function applyAppearanceTheme(theme) {
  const next = writeAppearanceTheme(app.getPath('userData'), theme);
  nativeTheme.themeSource = next;
  applyWindowAppearance(mainWindow, next);
  return next;
}

function createWindow() {
  const theme = storedAppearanceTheme();
  nativeTheme.themeSource = theme;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Zivith',
    backgroundColor: chromeForTheme(theme).backgroundColor,
    icon: ICON,
    autoHideMenuBar: true,
    ...mainWindowChrome(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('maximize', () => sendMaximized(mainWindow));
  mainWindow.on('unmaximize', () => sendMaximized(mainWindow));
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    writeLastPath(app.getPath('userData'), url);
  });
  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    writeLastPath(app.getPath('userData'), url);
  });
  void loadMainWindowUrl();
}

/**
 * 开发期 web 可能还在编译，首次 loadURL 会失败。绝不把 show:false 的窗口
 * 永远晾在后台：重试后仍失败就强制显示窗口并报错，保证用户看得见、可关闭。
 */
function loadUrlWithTimeout(win, url, timeoutMs) {
  return Promise.race([
    win.loadURL(url),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`加载 ${url} 超时`)), timeoutMs);
    }),
  ]);
}

async function loadMainWindowUrl(attempt = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const target = startupUrl(WEB_URL, app.getPath('userData'));
    await loadUrlWithTimeout(mainWindow, target, 15_000);
  } catch (error) {
    if (attempt >= 4 || !mainWindow || mainWindow.isDestroyed()) {
      mainWindow?.show();
      dialog.showErrorBox(
        'Zivith 界面加载失败',
        `无法加载 ${WEB_URL}。请确认界面服务已启动后重试。\n\n${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    setTimeout(() => {
      void loadMainWindowUrl(attempt + 1);
    }, 2_000);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Clash / 系统代理会劫持 Chromium 对 127.0.0.1:4000 的 fetch，表现为 Failed to fetch。
  app.commandLine.appendSwitch('proxy-bypass-list', '<local>;127.0.0.1;localhost;::1');

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    // 隐形窗口（加载失败兜底前）也要能被再次点击唤出。
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await session.defaultSession.setProxy({
      mode: 'direct',
      proxyBypassRules: '<local>;127.0.0.1;localhost;::1',
    });
    app.setAppUserModelId('com.zivith.studio');
    Menu.setApplicationMenu(null);
    // ADR-0017 V4 — 麦克风权限门:仅放行本应用加载面(origin)发起的 media 请求;
    // 其余权限一律拒绝。识别失败时前端禁用语音入口,绝不回退云端。
    const webOrigin = new URL(WEB_URL).origin;
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback, details) => {
        if (permission === 'media') {
          try {
            callback(
              Boolean(details.requestingUrl) && new URL(details.requestingUrl).origin === webOrigin,
            );
          } catch {
            callback(false);
          }
          return;
        }
        callback(false);
      },
    );
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission, requestingOrigin) =>
        permission === 'media' && requestingOrigin === webOrigin,
    );
    ipcMain.handle('location:persist', (_event, pathname) => {
      writeLastPath(app.getPath('userData'), pathname);
    });
    ipcMain.handle('appearance:setTheme', (_event, theme) => applyAppearanceTheme(theme));
    ipcMain.handle('window:minimize', (event) => {
      senderWindow(event)?.minimize();
    });
    ipcMain.handle('window:toggleMaximize', (event) => {
      const win = senderWindow(event);
      if (!win) return false;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return win.isMaximized();
    });
    ipcMain.handle('window:close', (event) => {
      senderWindow(event)?.close();
    });
    ipcMain.handle('window:isMaximized', (event) => Boolean(senderWindow(event)?.isMaximized()));
    ipcMain.handle('workspace:openDirectory', async (_event, defaultPath) => {
      const start = folderDialogStart(defaultPath);
      const result = await dialog.showOpenDialog({
        title: '选择世界文件夹',
        properties: ['openDirectory'],
        ...(start ? { defaultPath: start } : {}),
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
