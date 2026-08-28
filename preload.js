const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  collapse: () => ipcRenderer.send('collapse-overlay'),
  expand: () => ipcRenderer.send('expand-overlay'),
  toggle: () => ipcRenderer.send('toggle-overlay'),
  snapToCorner: () => ipcRenderer.send('snap-corner'),
  reloadContent: () => ipcRenderer.send('reload-content'),
  setCustomShortcut: (key) => ipcRenderer.invoke('set-shortcut', key),
  moveBubble: (movement) => ipcRenderer.send('move-bubble', movement),
  onStateChange: (callback) => ipcRenderer.on('state-change', (_event, value) => callback(value)),
});
