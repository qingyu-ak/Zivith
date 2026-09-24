const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zivithDesktop', {
  openDirectory: (defaultPath) => ipcRenderer.invoke('workspace:openDirectory', defaultPath),
  persistLocation: (pathname) => ipcRenderer.invoke('location:persist', pathname),
});
