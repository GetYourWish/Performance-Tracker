import { useState, useEffect, useCallback, useRef } from 'react'
import Board from './components/Board'
import Reviews from './components/Reviews'
import Settings from './components/Settings'
import SetupScreen from './components/SetupScreen'
import { validateAndHealData } from './utils/helpers'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('board')
  const [dataFile, setDataFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [conflicts, setConflicts] = useState([])
  
  // Debounce save to avoid constant disk writes
  const saveTimeoutRef = useRef(null)
  const pendingSaveRef = useRef(null)

  // Load app state and data file path on mount
  useEffect(() => {
    loadAppState()
  }, [])

  // Watch for external file changes
  useEffect(() => {
    if (!dataFile) return

    let unsubscribeFn = null
    
    const setupListener = async () => {
      unsubscribeFn = window.api.onExternalChange(async (event) => {
        console.log('File changed externally:', event.payload)
        await loadData(true) // true = external change, preserve typing
      })
      
      // Check for conflicts on initial load and periodically
      checkForConflicts()
    }
    
    setupListener()

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn()
      }
    }
  }, [dataFile])
  
  // Check for conflict files
  const checkForConflicts = useCallback(async () => {
    if (!dataFile) return
    
    try {
      const conflictFiles = await window.api.checkConflicts(dataFile)
      if (conflictFiles && conflictFiles.length > 0) {
        setConflicts(conflictFiles)
        console.warn('Conflict files detected:', conflictFiles)
      } else {
        setConflicts([])
      }
    } catch (error) {
      console.error('Failed to check conflicts:', error)
    }
  }, [dataFile])

  const loadAppState = async () => {
    try {
      const appState = await window.api.getAppState()
      if (appState.dataPath) {
        setDataFile(appState.dataPath)
        await loadData(appState.dataPath)
      } else {
        setSetupRequired(true)
        setLoading(false)
      }
    } catch (error) {
      console.error('Failed to load app state:', error)
      setSetupRequired(true)
      setLoading(false)
    }
  }

  const loadData = async (filePath = dataFile, isExternalChange = false) => {
    if (!filePath) {
      setLoading(false)
      return
    }
    
    try {
      const loadedData = await window.api.loadData()
      
      // Validate and heal data on load
      const healedData = validateAndHealData(loadedData)
      
      // Only update state if data actually changed (for external changes)
      if (isExternalChange && data) {
        // For external changes, we could preserve more state here if needed
        setData(healedData)
      } else {
        setData(healedData)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      if (error.message.includes('not found') || error.message.includes('corrupt')) {
        setSetupRequired(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // Debounced save function
  const debouncedSave = useCallback((newData) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Store the pending save data
    pendingSaveRef.current = newData
    
    // Schedule save after 300ms debounce
    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveRef.current && dataFile) {
        try {
          // Create backup before saving
          await window.api.backupNow()
          
          await window.api.saveData(pendingSaveRef.current)
          setData(pendingSaveRef.current)
          pendingSaveRef.current = null
        } catch (error) {
          console.error('Failed to save data:', error)
          throw error
        }
      }
    }, 300)
  }, [dataFile])

  const saveData = useCallback(async (newData) => {
    if (!dataFile) return
    
    // Use debounced save instead of immediate save
    debouncedSave(newData)
  }, [debouncedSave])
  
  // Flush pending saves immediately (for when switching views or closing)
  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    
    if (pendingSaveRef.current && dataFile) {
      try {
        await window.api.backupNow()
        await window.api.saveData(pendingSaveRef.current)
        setData(pendingSaveRef.current)
        pendingSaveRef.current = null
      } catch (error) {
        console.error('Failed to flush save:', error)
        throw error
      }
    }
  }, [dataFile])

  const handleSetupComplete = async (filePath) => {
    try {
      // Get default path from backend if no specific path selected
      let finalPath = filePath
      if (!filePath || filePath === 'default') {
        finalPath = await window.api.getDefaultPath()
      }
      
      // Check if file exists - if not, create default data
      let existingData = null
      try {
        existingData = await window.api.loadData()
      } catch (e) {
        // File doesn't exist or is invalid, will create new
        existingData = null
      }
      
      if (!existingData) {
        // Create default data if file doesn't exist
        const defaultData = {
          entries: {},
          categories: [],
          difficulties: [],
          settings: {}
        }
        await window.api.saveData(defaultData)
      }
      
      await window.api.setAppState({ dataPath: finalPath })
      setDataFile(finalPath)
      await loadData(finalPath)
      setSetupRequired(false)
    } catch (error) {
      console.error('Setup failed:', error)
      throw error
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (setupRequired) {
    return <SetupScreen onComplete={handleSetupComplete} />
  }

  return (
    <div className="app">
      <nav className="nav">
        <button 
          className={`nav-item ${currentView === 'board' ? 'active' : ''}`}
          onClick={() => {
            flushSave()
            setCurrentView('board')
          }}
        >
          Board
        </button>
        <button 
          className={`nav-item ${currentView === 'reviews' ? 'active' : ''}`}
          onClick={() => {
            flushSave()
            setCurrentView('reviews')
          }}
        >
          Reviews
        </button>
        <button 
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => {
            flushSave()
            setCurrentView('settings')
          }}
        >
          Settings
        </button>
      </nav>
      
      <main className="main-content">
        {currentView === 'board' && (
          <Board data={data} onSave={saveData} />
        )}
        {currentView === 'reviews' && (
          <Reviews data={data} onDayClick={(date) => {
            setSelectedDate(date)
            setCurrentView('daily')
          }} />
        )}
        {currentView === 'settings' && (
          <Settings 
            data={data} 
            onSave={saveData}
            dataFile={dataFile}
            conflicts={conflicts}
            onBackupNow={async () => {
              try {
                const backupPath = await window.api.backupNow()
                console.log('Backup created:', backupPath)
                alert(`Backup created at: ${backupPath}`)
              } catch (error) {
                console.error('Failed to create backup:', error)
                alert('Failed to create backup: ' + error.message)
              }
            }}
            onOpenFolder={async () => {
              try {
                await window.api.openDataFolder()
              } catch (error) {
                console.error('Failed to open folder:', error)
                alert('Failed to open folder: ' + error.message)
              }
            }}
            onChangeDataLocation={async () => {
              // Reset app state to trigger setup screen
              try {
                await window.api.setAppState({ dataPath: null })
                window.location.reload()
              } catch (error) {
                console.error('Failed to reset data location:', error)
              }
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
