const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zivithDesktop', {
  openDirectory: () => ipcRenderer.invoke('workspace:openDirectory'),
});
