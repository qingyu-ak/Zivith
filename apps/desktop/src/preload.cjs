const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zivithDesktop', {
  openDirectory: (defaultPath) => ipcRenderer.invoke('workspace:openDirectory', defaultPath),
});
