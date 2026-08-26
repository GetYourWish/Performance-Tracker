import { useState, useEffect, useCallback, useRef } from 'react'
import Board from './components/Board'
import Reviews from './components/Reviews'
import Settings from './components/Settings'
import SetupScreen from './components/SetupScreen'
import { WorkingOnMarker, WorkingOnPopup } from './components/WorkingOnMarker'
import { validateAndHealData, generateId, calculateTaskScoreBreakdown } from './utils/helpers'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('board')
  const [dataFile, setDataFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showWorkingOnPopup, setShowWorkingOnPopup] = useState(false)
  
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
      setLoading(false);
      return;
    }
    
    try {
      const loadedData = await window.api.loadData();
      
      // Handle null (file doesn't exist) - shouldn't happen after setup, but be safe
      if (!loadedData) {
        console.warn('Loaded data is null, using default');
        const healedData = validateAndHealData(null);
        setData(healedData);
        setLoading(false);
        return;
      }
      
      // Validate and heal data on load
      const healedData = validateAndHealData(loadedData);
      
      // Only update state if data actually changed (for external changes)
      if (isExternalChange && data) {
        // For external changes, we could preserve more state here if needed
        setData(healedData);
      } else {
        setData(healedData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      // Corrupt file or other error - trigger setup to let user choose a new location
      setSetupRequired(true);
    } finally {
      setLoading(false);
    }
  };

  // Debounced save function - does NOT await backup, saves immediately for responsive UI
  const debouncedSave = useCallback((newData) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Store the pending save data
    pendingSaveRef.current = newData;
    
    // Schedule save after 100ms debounce for responsive feel
    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingSaveRef.current && dataFile) {
        try {
          // Save first without awaiting backup - backup is non-critical
          window.api.saveData(pendingSaveRef.current).catch(err => {
            console.error('Failed to save data:', err);
          });
          
          // Create backup in background (non-blocking, non-critical)
          window.api.backupNow().catch(err => {
            console.warn('Backup failed (non-critical):', err);
          });
          
          // Update UI state immediately for responsive feel
          setData(pendingSaveRef.current);
          pendingSaveRef.current = null;
        } catch (error) {
          console.error('Failed to save data:', error);
          throw error;
        }
      }
    }, 100);
  }, [dataFile]);

  const saveData = useCallback(async (newData) => {
    if (!dataFile) return;
    
    // Use debounced save instead of immediate save
    debouncedSave(newData);
  }, [debouncedSave]);
  
  // Flush pending saves immediately (for when switching views or closing)
  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (pendingSaveRef.current && dataFile) {
      try {
        // Save immediately
        await window.api.saveData(pendingSaveRef.current);
        
        // Backup in background (non-blocking)
        window.api.backupNow().catch(err => {
          console.warn('Backup failed (non-critical):', err);
        });
        
        setData(pendingSaveRef.current);
        pendingSaveRef.current = null;
      } catch (error) {
        console.error('Failed to flush save:', error);
        throw error;
      }
    }
  }, [dataFile]);

  const handleSetupComplete = async (filePath) => {
    try {
      // Get default path from backend if no specific path selected
      let finalPath = filePath;
      if (!filePath || filePath === 'default') {
        finalPath = await window.api.getDefaultPath();
      }
      
      // Set app state FIRST with the new path - this ensures loadData uses the correct path
      await window.api.setAppState({ dataPath: finalPath });
      setDataFile(finalPath);
      
      // Check if file exists at the NEW path - if not, create default data
      let existingData = null;
      try {
        existingData = await window.api.loadData();
      } catch (e) {
        // File doesn't exist or is invalid, will create new
        existingData = null;
      }
      
      if (!existingData) {
        // Create default data with difficulties if file doesn't exist
        const defaultData = {
          schemaVersion: 1,
          meta: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          settings: {
            theme: 'system',
            weekStartsOn: 1,
            heatmapMode: 'score',
            fatigueIncrement: 0.10,
            fatigueCap: 3.0
          },
          difficulties: [
            { id: generateId(), label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
            { id: generateId(), label: 'Medium', score: 2, color: '#fbbf24', order: 1, active: true },
            { id: generateId(), label: 'Hard', score: 3, color: '#f87171', order: 2, active: true },
            { id: generateId(), label: 'Very Hard', score: 5, color: '#dc2626', order: 3, active: true }
          ],
          categories: [],
          markers: [],
          board: [],
          tasks: []
        };
        await window.api.saveData(defaultData);
      }
      
      // Now load the data from the correct path
      await loadData(finalPath);
      setSetupRequired(false);
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  };

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
        <div style={{ flex: 1 }}></div>
        <WorkingOnMarker 
          data={data} 
          onOpenPopup={() => setShowWorkingOnPopup(true)} 
        />
      </nav>
      
      <main className="main-content">
        {currentView === 'board' && (
          <Board data={data} onSave={saveData} />
        )}
        {currentView === 'reviews' && (
          <Reviews 
            data={data} 
            selectedDate={selectedDate}
            onDayClick={(date) => setSelectedDate(date)} 
            onSave={saveData}
          />
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
            onChangeDataFolder={async (folderPath) => {
              try {
                const result = await window.api.moveDataToFolder(folderPath)
                // Update the in-memory dataFile so the UI reflects the new path
                if (result && result.filePath) {
                  setDataFile(result.filePath)
                }
                return result
              } catch (error) {
                console.error('Failed to move data:', error)
                alert('Failed to move data: ' + error.message)
                throw error
              }
            }}
          />
        )}
      </main>

      {showWorkingOnPopup && (
        <WorkingOnPopup
          tasks={(data?.workingOn || []).map(id => data.tasks.find(t => t.id === id)).filter(Boolean)}
          boardItems={data?.board || []}
          markers={data?.markers || []}
          categories={data?.categories || []}
          difficulties={data?.difficulties || []}
          onClose={() => setShowWorkingOnPopup(false)}
          onCompleteTask={({ taskId, difficultyId, date, note }) => {
            // Find task index in boardItems to determine category based on markers ONLY
            const boardItems = data?.board || []
            const markers = data?.markers || []
            const taskIndex = boardItems.findIndex(item => item.type === 'task' && item.taskId === taskId)
            
            // Strict marker-based category derivation
            let aboveMarker = null
            let belowMarker = null
            
            for (let i = taskIndex - 1; i >= 0; i--) {
              const item = boardItems[i]
              if (item && item.type === 'marker') {
                aboveMarker = item
                break
              }
            }
            
            for (let i = taskIndex + 1; i < boardItems.length; i++) {
              const item = boardItems[i]
              if (item && item.type === 'marker') {
                belowMarker = item
                break
              }
            }
            
            let categoryId = null
            if (aboveMarker && belowMarker && aboveMarker.markerId === belowMarker.markerId) {
              const marker = markers.find(m => m.id === aboveMarker.markerId)
              if (marker) categoryId = marker.categoryId
            } else if (aboveMarker && belowMarker) {
              const aboveMarkerObj = markers.find(m => m.id === aboveMarker.markerId)
              const belowMarkerObj = markers.find(m => m.id === belowMarker.markerId)
              if (aboveMarkerObj && belowMarkerObj && aboveMarkerObj.categoryId === belowMarkerObj.categoryId) {
                categoryId = aboveMarkerObj.categoryId
              }
            }

            const completedAt = new Date().toISOString()

            // Build the completed task object to compute score breakdown
            const completedTask = {
              id: taskId,
              text: data.tasks.find(t => t.id === taskId)?.text || '',
              completion: {
                completedDate: date,
                completedAt,
                difficultyId,
                categoryId,
                note: note || ''
              }
            }

            const appDifficulties = data?.difficulties || []
            const appCategories = data?.categories || []
            const appSettings = data?.settings || {}
            const allCompleted = [...(data?.tasks || []).filter(t => t.completion), completedTask]
            const breakdown = calculateTaskScoreBreakdown(
              completedTask,
              allCompleted,
              appDifficulties,
              appSettings.fatigueIncrement || 0.10,
              appSettings.fatigueCap || 3.0,
              appCategories
            )

            // Create log entry
            const logEntry = {
              id: generateId(),
              timestamp: completedAt,
              taskId,
              taskText: completedTask.text,
              difficultyLabel: breakdown.difficultyLabel,
              difficultyColor: breakdown.difficultyColor,
              categoryName: breakdown.categoryName,
              categoryColor: breakdown.categoryColor,
              priorityMultiplier: breakdown.priorityMultiplier,
              fatigueMultiplier: breakdown.fatigueMultiplier,
              basePoints: breakdown.basePoints,
              finalScore: breakdown.finalScore
            }

            const updatedTasks = data.tasks.map(t => {
              if (t.id === taskId) {
                return {
                  ...t,
                  completion: {
                    completedDate: date,
                    completedAt,
                    difficultyId,
                    categoryId,
                    note: note || ''
                  }
                }
              }
              return t
            })

            const updatedBoard = boardItems.filter(item => 
              !(item.type === 'task' && item.taskId === taskId)
            )
            
            const updatedWorkingOn = (data.workingOn || []).filter(id => id !== taskId)

            // Cap logs at 500 entries
            const existingLogs = data.logs || []
            const updatedLogs = existingLogs.length >= 500
              ? [...existingLogs.slice(existingLogs.length - 499), logEntry]
              : [...existingLogs, logEntry]

            saveData({
              ...data,
              tasks: updatedTasks,
              board: updatedBoard,
              workingOn: updatedWorkingOn,
              logs: updatedLogs,
              meta: { ...data.meta, updatedAt: completedAt }
            })

            setShowWorkingOnPopup(false)
          }}
        />
      )}
    </div>
  )
}

export default App
