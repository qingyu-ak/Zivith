const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zivithDesktop', {
  platform: process.platform,
  hasWindowControls: process.platform !== 'darwin',
  openDirectory: (defaultPath) => ipcRenderer.invoke('workspace:openDirectory', defaultPath),
  persistLocation: (pathname) => ipcRenderer.invoke('location:persist', pathname),
  setAppearanceTheme: (theme) => ipcRenderer.invoke('appearance:setTheme', theme),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
});
