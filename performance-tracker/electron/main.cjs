const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');
const chokidar = require('chokidar');

// Global variables
let mainWindow;
let dataFilePath = null;
let watcher = null;
let debounceTimer = null;
let isExternalWrite = false;

// App state file path
const appStatePath = path.join(app.getPath('userData'), 'app-state.json');

// Load saved data path or set default - uses SyncThis folder next to executable per spec
async function initializeDataPath() {
  try {
    const stateExists = await fs.access(appStatePath).then(() => true).catch(() => false);
    if (stateExists) {
      const appState = JSON.parse(await fs.readFile(appStatePath, 'utf8'));
      if (appState.dataPath) {
        dataFilePath = appState.dataPath;
        return;
      }
    }
  } catch (e) {
    console.log('Could not load app state, will use default:', e.message);
  }

  // Default location: SyncThis folder next to executable (per spec)
  const exeDir = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
  const syncThisDir = path.join(exeDir, 'SyncThis');
  const defaultPath = path.join(syncThisDir, 'tracker.json');
  
  // Check if we can write to executable directory
  try {
    await fs.access(exeDir, fs.constants.W_OK);
    // Create SyncThis folder if it doesn't exist
    await fs.mkdir(syncThisDir, { recursive: true });
    dataFilePath = defaultPath;
  } catch (e) {
    // Fallback to Documents folder with SyncThis subfolder
    const documentsPath = app.getPath('documents');
    const fallbackDir = path.join(documentsPath, 'SyncThis');
    await fs.mkdir(fallbackDir, { recursive: true }).catch(() => {});
    dataFilePath = path.join(fallbackDir, 'tracker.json');
  }
}

// Save current data path to app state
async function saveDataPath(filePath) {
  if (!filePath) return;
  
  const appState = { dataPath: filePath };
  await fs.writeFile(appStatePath, JSON.stringify(appState, null, 2));
}

// Atomic save using temp file
async function atomicSave(filePath, data) {
  const tempPath = filePath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

// Debounced save
function debouncedSave(data) {
  if (debounceTimer) clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(async () => {
    try {
      if (dataFilePath) {
        isExternalWrite = true;
        await atomicSave(dataFilePath, data);
        isExternalWrite = false;
        console.log(`Saved data to ${dataFilePath}`);
      }
    } catch (error) {
      console.error('Error during auto-save:', error);
    }
  }, 100); // 100ms debounce - fast enough to feel responsive, slow enough to batch writes
}

// Create backups - handles non-existent file gracefully
async function createBackup() {
  if (!dataFilePath) return null;
  
  try {
    // Check if file exists before backing up
    try {
      await fs.access(dataFilePath);
    } catch (e) {
      // File doesn't exist yet, nothing to backup
      return null;
    }
    
    const backupDir = path.join(path.dirname(dataFilePath), '.backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `tracker-${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFileName);
    
    await fs.copyFile(dataFilePath, backupPath);
    
    // Clean up old backups (keep ~20 most recent)
    const files = await fs.readdir(backupDir);
    const jsonFiles = files.filter(f => f.startsWith('tracker-') && f.endsWith('.json'))
                          .sort();
    
    if (jsonFiles.length > 20) {
      const toDelete = jsonFiles.slice(0, jsonFiles.length - 20);
      for (const file of toDelete) {
        await fs.unlink(path.join(backupDir, file));
      }
    }
    
    return backupPath;
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
}

// Set up file watcher
async function setupWatcher() {
  if (watcher) {
    await watcher.close();
  }
  
  if (!dataFilePath) return;
  
  const dirPath = path.dirname(dataFilePath);
  watcher = chokidar.watch([dirPath], {
    ignoreInitial: true,
    ignored: (filePath) => {
      // Ignore temporary files created by our atomic save
      return filePath.includes('.tmp') || 
             filePath.includes('~') ||
             filePath.endsWith('.bak');
    }
  });

  watcher.on('change', async (changedPath) => {
    if (changedPath === dataFilePath && !isExternalWrite) {
      // External change detected (not from our own write)
      mainWindow.webContents.send('external-change', changedPath);
    }
  });
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the Vite dev server or built HTML
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// IPC handlers
ipcMain.handle('load-data', async () => {
  if (!dataFilePath) {
    await initializeDataPath();
  }
  
  try {
    const data = await fs.readFile(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist - return null to signal caller to create default data
      return null;
    }
    // Corrupt JSON or other error - throw to signal problem
    throw error;
  }
});

ipcMain.handle('save-data', async (event, data) => {
  if (!dataFilePath) {
    await initializeDataPath();
  }
  
  debouncedSave(data);
});

ipcMain.handle('choose-data-location', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Choose Data Location',
    defaultPath: dataFilePath || path.join(app.getPath('documents'), 'tracker.json'),
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    dataFilePath = result.filePath;
    await saveDataPath(dataFilePath);
    await setupWatcher();
    return dataFilePath;
  }
  
  return null;
});

ipcMain.handle('open-data-folder', async () => {
  if (dataFilePath) {
    await shell.openPath(path.dirname(dataFilePath));
  }
});

ipcMain.handle('backup-now', async () => {
  return await createBackup();
});

ipcMain.handle('get-app-state', async () => {
  try {
    const stateExists = await fs.access(appStatePath).then(() => true).catch(() => false);
    if (stateExists) {
      const appState = JSON.parse(await fs.readFile(appStatePath, 'utf8'));
      return appState;
    }
  } catch (e) {
    console.error('Error loading app state:', e);
  }
  return {};
});

ipcMain.handle('set-app-state', async (event, newState) => {
  const appState = { ...newState };
  await fs.writeFile(appStatePath, JSON.stringify(appState, null, 2));
  if (newState.dataPath) {
    dataFilePath = newState.dataPath;
    await setupWatcher();
  }
});

// Get default path - returns SyncThis folder next to executable per spec
ipcMain.handle('get-default-path', async () => {
  const exeDir = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
  const syncThisDir = path.join(exeDir, 'SyncThis');
  const defaultPath = path.join(syncThisDir, 'tracker.json');
  
  try {
    await fs.access(exeDir, fs.constants.W_OK);
    await fs.mkdir(syncThisDir, { recursive: true });
    return defaultPath;
  } catch (e) {
    const documentsPath = app.getPath('documents');
    const fallbackDir = path.join(documentsPath, 'SyncThis');
    await fs.mkdir(fallbackDir, { recursive: true }).catch(() => {});
    return path.join(fallbackDir, 'tracker.json');
  }
});

ipcMain.handle('check-conflicts', async (event, { filePath }) => {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath, '.json');
  
  try {
    const files = await fs.readdir(dirPath);
    const conflictFiles = files.filter(f => 
      f.startsWith(baseName) && 
      f.includes('-conflict-') && 
      f !== path.basename(filePath)
    );
    return conflictFiles.map(f => path.join(dirPath, f));
  } catch (e) {
    return [];
  }
});

// Initialize when ready
app.whenReady().then(async () => {
  await initializeDataPath();
  await setupWatcher();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
