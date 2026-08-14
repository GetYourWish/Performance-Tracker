const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const chokidar = require('chokidar')

// App state file location
const APP_STATE_FILE = path.join(app.getPath('userData'), 'app-state.json')

// Track if we're currently writing to avoid watching our own writes
let isWriting = false
let watcher = null

// Load app state (data file path)
function loadAppState() {
  try {
    if (fs.existsSync(APP_STATE_FILE)) {
      const data = fs.readFileSync(APP_STATE_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Failed to load app state:', e)
  }
  return { dataFilePath: null }
}

// Save app state
function saveAppState(state) {
  try {
    const tempPath = APP_STATE_FILE + '.tmp'
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8')
    fs.renameSync(tempPath, APP_STATE_FILE)
  } catch (e) {
    console.error('Failed to save app state:', e)
  }
}

// Get default data path (next to executable in SyncThis folder, fallback to Documents)
function getDefaultDataPath() {
  try {
    const exeDir = path.dirname(process.execPath)
    const syncThisPath = path.join(exeDir, 'SyncThis', 'tracker.json')
    // Check if SyncThis folder exists next to executable
    try {
      fs.accessSync(path.dirname(syncThisPath))
      return syncThisPath
    } catch {
      // Fallback to Documents
      const docsPath = app.getPath('documents')
      return path.join(docsPath, 'tracker.json')
    }
  } catch {
    const docsPath = app.getPath('documents')
    return path.join(docsPath, 'tracker.json')
  }
}

// Atomic write with temp-file-then-rename
function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath)
  const tempPath = path.join(dir, '.tmp-' + path.basename(filePath))
  
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tempPath, filePath)
}

// Read data file
function readDataFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found: ' + filePath)
  }
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

// Write data file atomically
function writeDataFile(filePath, data) {
  isWriting = true
  try {
    atomicWrite(filePath, data)
  } finally {
    // Small delay before resetting flag to ensure watcher ignores it
    setTimeout(() => { isWriting = false }, 100)
  }
}

// Create backup
function createBackup(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null
    }
    
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, '.json')
    const backupDir = path.join(dir, '.backups')
    
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    // Create timestamped backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const backupPath = path.join(backupDir, `${baseName}-${timestamp}.json`)
    
    fs.copyFileSync(filePath, backupPath)
    
    // Clean up old backups (keep ~20)
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(baseName + '-') && f.endsWith('.json'))
      .sort()
    
    while (backups.length > 20) {
      const oldest = backups.shift()
      fs.unlinkSync(path.join(backupDir, oldest))
    }
    
    return backupPath
  } catch (e) {
    console.error('Failed to create backup:', e)
    return null
  }
}

// Setup file watcher
function setupWatcher(filePath, mainWindow) {
  if (watcher) {
    watcher.close()
  }
  
  const dir = path.dirname(filePath)
  
  watcher = chokidar.watch([filePath, dir], {
    ignored: (watchedPath) => {
      // Ignore our own writes and temp files
      if (isWriting) return true
      if (path.basename(watchedPath).startsWith('.tmp')) return true
      if (watchedPath.includes('.backups')) return true
      return false
    },
    persistent: true,
    ignoreInitial: true
  })
  
  watcher.on('change', (changedPath) => {
    if (changedPath === filePath && !isWriting) {
      console.log('File changed externally:', changedPath)
      mainWindow.webContents.send('external-change', filePath)
    }
  })
  
  watcher.on('error', (error) => {
    console.error('Watcher error:', error)
  })
}

// Create window
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  
  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  
  return mainWindow
}

// IPC Handlers
ipcMain.handle('load-data', async (event, filePath) => {
  try {
    return readDataFile(filePath)
  } catch (e) {
    throw new Error('Failed to load data: ' + e.message)
  }
})

ipcMain.handle('save-data', async (event, filePath, data) => {
  try {
    writeDataFile(filePath, data)
    return true
  } catch (e) {
    throw new Error('Failed to save data: ' + e.message)
  }
})

ipcMain.handle('get-app-state', async () => {
  return loadAppState()
})

ipcMain.handle('set-app-state', async (event, state) => {
  saveAppState(state)
  return true
})

ipcMain.handle('get-default-path', async () => {
  return getDefaultDataPath()
})

ipcMain.handle('choose-data-location', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select tracker.json file',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Folder',
    properties: ['openDirectory']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('open-data-folder', async (event, filePath) => {
  const dir = path.dirname(filePath)
  try {
    await shell.openPath(dir)
  } catch (e) {
    throw new Error('Failed to open folder: ' + e.message)
  }
})

ipcMain.handle('backup-data', async (event, filePath) => {
  const backupPath = createBackup(filePath)
  return backupPath
})

ipcMain.handle('check-conflicts', async (event, filePath) => {
  try {
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, '.json')
    const files = fs.readdirSync(dir)
    
    // Look for conflict files (Syncthing creates files like tracker.conflict-xxxxx.json)
    const conflicts = files.filter(f => 
      f.startsWith(baseName + '.conflict') || 
      f.includes('.sync-conflict')
    )
    
    return conflicts.map(f => path.join(dir, f))
  } catch (e) {
    console.error('Failed to check conflicts:', e)
    return []
  }
})

// App lifecycle
app.whenReady().then(() => {
  const mainWindow = createWindow()
  
  // Setup watcher when data file is set
  ipcMain.handle('setup-watcher', async (event, filePath) => {
    setupWatcher(filePath, mainWindow)
    return true
  })
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (watcher) {
    watcher.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Import shell for opening folders
const { shell } = require('electron')
