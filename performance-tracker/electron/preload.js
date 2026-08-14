const { contextBridge, ipcRenderer } = require('electron')

// Expose minimal IPC API to renderer process
contextBridge.exposeInMainWorld('api', {
  // Load data from file
  loadData: (filePath) => ipcRenderer.invoke('load-data', filePath),
  
  // Save data to file
  saveData: (filePath, data) => ipcRenderer.invoke('save-data', filePath, data),
  
  // Get app state (stores data file path)
  getAppState: () => ipcRenderer.invoke('get-app-state'),
  
  // Set app state
  setAppState: (state) => ipcRenderer.invoke('set-app-state', state),
  
  // Get default data path
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  
  // Choose data location (file picker)
  chooseDataLocation: () => ipcRenderer.invoke('choose-data-location'),
  
  // Choose folder
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  
  // Open data folder in system file explorer
  openDataFolder: (filePath) => ipcRenderer.invoke('open-data-folder', filePath),
  
  // Create backup now
  backupNow: (filePath) => ipcRenderer.invoke('backup-data', filePath),
  
  // Check for conflict files
  checkConflicts: (filePath) => ipcRenderer.invoke('check-conflicts', filePath),
  
  // Listen for external file changes
  onExternalChange: (callback) => {
    const listener = (event, filePath) => callback(filePath)
    ipcRenderer.on('external-change', listener)
    return () => ipcRenderer.removeListener('external-change', listener)
  }
})
