import { useState, useEffect, useCallback, useRef } from 'react'
import Board from './components/Board'
import Reviews from './components/Reviews'
import CalendarPage from './components/CalendarPage'
import Settings from './components/Settings'
import SetupScreen from './components/SetupScreen'
import { WorkingOnMarker, WorkingOnPopup } from './components/WorkingOnMarker'
import { DeadlineToastStack } from './components/DeadlineToast'
import {
  validateAndHealData,
  generateId,
  calculateTaskScoreBreakdown,
  checkSchemaVersion,
  materializeRecurringTasks,
  applyDueDeadlines,
  getCurrentDate
} from '@performance-tracker/core'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('board')
  const [dataFile, setDataFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [conflicts, setConflicts] = useState([])
  // selectedDate is managed internally by Reviews — no need to lift it here
  const [showWorkingOnPopup, setShowWorkingOnPopup] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  // Set when the data file was written by a newer app version (schemaVersion > 1)
  const [schemaError, setSchemaError] = useState(null)
  // v1.3.0: in-app bottom-right toasts for tasks that just auto-joined
  // Working On because their deadline was reached (no Windows notification)
  const [deadlineToasts, setDeadlineToasts] = useState([])
  // v1.4.0 calendar → board handoff: set by the Calendar page's "Go to
  // Board" button. Board scrolls the task's row into view and flashes it,
  // then reports back here so the request is consumed exactly once.
  // `nonce` makes repeat clicks on the same task fire again.
  const [boardFocus, setBoardFocus] = useState(null)

  // Debounce save to avoid constant disk writes
  const saveTimeoutRef = useRef(null)
  const pendingSaveRef = useRef(null)
  // Latest data file path, reachable from ANY closure. Load-time saves
  // (recurring materialization, deadline auto-add) run through closures
  // created on render 1, BEFORE setDataFile landed — a plain [dataFile]
  // dependency captured null there and silently swallowed the first disk
  // write (state updated, disk did not). The ref is always current.
  const dataFileRef = useRef(null)
  useEffect(() => {
    dataFileRef.current = dataFile
  }, [dataFile])
  // Serialized form of the last content known to be on disk. Saves identical
  // to this are skipped — no-change-no-write (prevents Syncthing churn).
  const lastPersistedRef = useRef(null)
  // Latest data reference for the day-rollover recurring check below.
  const dataRef = useRef(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  // Calendar day the recurring tasks were last materialized for — an
  // always-open app still gets its per-day instances at midnight.
  const lastRecurringDayRef = useRef(null)

  // Load app state and data file path on mount
  useEffect(() => {
    loadAppState()
  }, [])

  // Sync watcher state from main process on mount
  useEffect(() => {
    window.api.getWatcherEnabled().then(enabled => {
      setAutoSync(enabled)
    }).catch(() => {})
  }, [])

  // Watch for external file changes (only when autoSync is on)
  useEffect(() => {
    if (!dataFile) return
    if (!autoSync) return // no listener when manual mode

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
  }, [dataFile, autoSync])
  
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

      // Refuse files from newer app versions (never heal them downgraded).
      // Primary guard lives in the main process; this is defense in depth.
      const schemaCheck = checkSchemaVersion(loadedData);
      if (!schemaCheck.ok) {
        setSchemaError(schemaCheck.schemaVersion);
        setLoading(false);
        return;
      }
      
      // Validate and heal data on load
      const healedData = validateAndHealData(loadedData);
      lastPersistedRef.current = JSON.stringify(healedData);
      
      // Only update state if data actually changed (for external changes)
      if (isExternalChange && data) {
        // For external changes, we could preserve more state here if needed
        setData(healedData);
      } else {
        setData(healedData);
      }

      // Weekday-scheduled recurring tasks: materialize today's instances
      // (every load — startup, external change, refresh; the core helper's
      // lastRun stamp makes repeats no-ops, sync-safe across devices).
      applyDailyAutomation(healedData);
    } catch (error) {
      const msg = String(error?.message || error);
      const tooNew = msg.match(/SCHEMA_VERSION_TOO_NEW:(\d+)/);
      if (tooNew) {
        setSchemaError(parseInt(tooNew[1], 10));
        setLoading(false);
        return;
      }
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
      // Capture BEFORE any await — a flushSave() running while this timer
      // waits can null the ref; reading it again after the await would
      // setData(null) and crash every view that reads data unguarded.
      const pending = pendingSaveRef.current;
      if (pending && dataFileRef.current) {
        try {
          const incoming = JSON.stringify(pending);
          // No-change-no-write: identical content must never hit the disk
          if (lastPersistedRef.current === null || incoming !== lastPersistedRef.current) {
            window.api.saveData(pending).catch(err => {
              console.error('Failed to save data:', err);
            });
            lastPersistedRef.current = incoming;
          }
          
          // Update UI state immediately for responsive feel
          setData(pending);
          pendingSaveRef.current = null;
        } catch (error) {
          console.error('Failed to save data:', error);
          throw error;
        }
      }
    }, 100);
  }, []);

  const saveData = useCallback(async (newData) => {
    // Use debounced save instead of immediate save. The final data-file
    // guard lives INSIDE the debounce timer (dataFileRef) so saves scheduled
    // before the data file landed still persist once it has.
    debouncedSave(newData);
  }, [debouncedSave]);
  
  // Flush pending saves immediately (for when switching views or closing)
  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    // Capture BEFORE the await — two flushes can interleave (e.g. Calendar
    // nav click + "Go to Board" moments later): the first await resolves
    // after the second already consumed the ref, and re-reading it here
    // yielded null → setData(null) crashed the whole app (v1.4.0 fix; the
    // calendar integration test is the regression test).
    const pending = pendingSaveRef.current;
    if (pending && dataFile) {
      try {
        await window.api.saveData(pending);
        
        setData(pending);
        pendingSaveRef.current = null;
      } catch (error) {
        console.error('Failed to flush save:', error);
        throw error;
      }
    }
  }, [dataFile]);

  // Daily automation (both rules are pure core helpers, v1.1.0 + v1.2.0):
  //  - weekday-scheduled recurring tasks: materialize today's instances
  //    (idempotent per day via the persisted lastRun stamp — sync-safe)
  //  - deadline day reached: the task joins workingOn automatically (user
  //    request 2026-11-18; idempotent via tasks[].deadlineAutoAdded, and a
  //    manual removal afterwards sticks)
  // Both helpers return the SAME data reference when nothing is due, so
  // no-change-no-write protects the disk.
  const applyDailyAutomation = useCallback((healedData) => {
    if (!healedData) return
    try {
      const today = getCurrentDate()
      const now = new Date().toISOString()
      const { data: withRecurring, created } = materializeRecurringTasks({
        data: healedData,
        today,
        now,
        generateId
      })
      const { data: nextData, added } = applyDueDeadlines({
        data: withRecurring,
        today,
        now
      })
      lastRecurringDayRef.current = today
      // v1.3.0: surface newly auto-added deadline tasks as in-app toasts
      // (bottom-right, close button, auto-dismiss — see DeadlineToast)
      if (added.length > 0) {
        const taskById = new Map((withRecurring.tasks || []).map(t => [t.id, t]))
        const addedTasks = added
          .map(id => taskById.get(id))
          .filter(Boolean)
        if (addedTasks.length > 0) {
          setDeadlineToasts(prev => [
            ...prev,
            ...addedTasks.map(t => ({
              id: `toast-${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              taskId: t.id,
              text: t.text
            }))
          ].slice(-4)) // keep the stack small: at most 4 toasts
        }
      }
      if (created.length > 0 || nextData !== healedData) {
        setData(nextData)
        saveData(nextData)
      }
    } catch (error) {
      console.error('Failed to apply daily automation:', error)
    }
  }, [saveData])

  // Day-rollover watch: an app left open across midnight still gets the
  // new day's recurring instances and deadline auto-adds. Checks once a
  // minute; the helpers' stamps make every extra check a no-op.
  useEffect(() => {
    const interval = setInterval(() => {
      const today = getCurrentDate()
      if (lastRecurringDayRef.current && today !== lastRecurringDayRef.current && dataRef.current) {
        applyDailyAutomation(dataRef.current)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [applyDailyAutomation])

  const handleBackupNow = useCallback(async () => {
    try {
      const backupPath = await window.api.backupNow()
      alert(`Backup created at: ${backupPath}`)
    } catch (error) {
      console.error('Failed to create backup:', error)
      alert('Failed to create backup: ' + error.message)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await flushSave()
      const loadedData = await window.api.refreshData()
      if (loadedData) {
        const schemaCheck = checkSchemaVersion(loadedData)
        if (!schemaCheck.ok) {
          setSchemaError(schemaCheck.schemaVersion)
          return
        }
        const healedData = validateAndHealData(loadedData)
        lastPersistedRef.current = JSON.stringify(healedData)
        setData(healedData)
        // Manual refresh may cross a day boundary too — materialize if due.
        applyDailyAutomation(healedData)
      }
    } catch (error) {
      console.error('Refresh failed:', error)
    } finally {
      // Keep the spin animation visible for at least 400ms so it feels intentional
      setTimeout(() => setRefreshing(false), 400)
    }
  }, [refreshing, flushSave, applyDailyAutomation])

  const handleToggleAutoSync = useCallback(async (enabled) => {
    setAutoSync(enabled)
    try {
      await window.api.setWatcherEnabled(enabled)
      // Persist preference in app-state so it survives restarts
      await window.api.setAppState({ watcherEnabled: enabled })
    } catch (error) {
      console.error('Failed to toggle auto-sync:', error)
    }
  }, [])

  const handleOpenFolder = useCallback(async () => {
    try {
      await window.api.openDataFolder()
    } catch (error) {
      console.error('Failed to open folder:', error)
      alert('Failed to open folder: ' + error.message)
    }
  }, [])

  const dismissDeadlineToast = useCallback((id) => {
    setDeadlineToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleChangeDataFolder = useCallback(async (folderPath) => {
    try {
      const result = await window.api.moveDataToFolder(folderPath)
      if (result && result.filePath) {
        setDataFile(result.filePath)
      }
      return result
    } catch (error) {
      console.error('Failed to move data:', error)
      alert('Failed to move data: ' + error.message)
      throw error
    }
  }, [])

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

  // v1.4.0 — Calendar "Go to Board": switch to the board and hand the task
  // to Board (scroll + flash, the randomizer treatment). handleBoardFocusHandled
  // must stay referentially stable (useCallback, no deps) — Board's focus
  // effect depends on it.
  const handleBoardFocusHandled = useCallback(() => {
    setBoardFocus(null)
  }, [])

  const handleGoToBoard = useCallback((task) => {
    if (!task || typeof task.id !== 'string') return
    flushSave()
    setBoardFocus({ taskId: task.id, nonce: Date.now() })
    setCurrentView('board')
  }, [flushSave])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (schemaError !== null) {
    return (
      <div className="loading-screen">
        <h2>Data file is from a newer version</h2>
        <p className="error-message">
          This tracker.json uses schemaVersion {schemaError}, but this app supports schemaVersion 1.
        </p>
        <p>The file was not modified. Update this app to a version that supports schema {schemaError}.</p>
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
          className={`nav-item ${currentView === 'calendar' ? 'active' : ''}`}
          onClick={() => {
            flushSave()
            setCurrentView('calendar')
          }}
        >
          Calendar
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
        <button 
          className={`nav-refresh-btn ${refreshing ? 'spinning' : ''}`}
          onClick={handleRefresh}
          title={autoSync ? 'Refresh data' : 'Refresh data (auto-sync is off)'}
          aria-label="Refresh data"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13.65 2.35A7.96 7.96 0 0 0 8 0C3.58 0 0 3.58 0 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 8 14 6 6 0 1 1 8 2c1.66 0 3.14.69 4.22 1.78L9 7h7V0l-2.35 2.35z" fill="currentColor"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}></div>
        <WorkingOnMarker 
          data={data} 
          onOpenPopup={() => setShowWorkingOnPopup(true)} 
        />
      </nav>
      
      <main className="main-content">
        {currentView === 'board' && (
          <Board
            data={data}
            onSave={saveData}
            focusRequest={boardFocus}
            onFocusHandled={handleBoardFocusHandled}
          />
        )}
        {currentView === 'calendar' && (
          <CalendarPage data={data} onGoToBoard={handleGoToBoard} />
        )}
        {currentView === 'reviews' && (
          <Reviews 
            data={data} 
            onSave={saveData}
          />
        )}
        {currentView === 'settings' && (
          <Settings 
            data={data} 
            onSave={saveData}
            dataFile={dataFile}
            conflicts={conflicts}
            onBackupNow={handleBackupNow}
            onOpenFolder={handleOpenFolder}
            onChangeDataFolder={handleChangeDataFolder}
            autoSync={autoSync}
            onToggleAutoSync={handleToggleAutoSync}
          />
        )}
      </main>

      {/* v1.3.0: in-app deadline toasts (bottom-right) */}
      <DeadlineToastStack
        toasts={deadlineToasts}
        onDismiss={dismissDeadlineToast}
        onOpenWorkingOn={() => setShowWorkingOnPopup(true)}
      />

      {showWorkingOnPopup && (
        <WorkingOnPopup
          tasks={(data?.workingOn || []).map(id => data?.tasks?.find(t => t.id === id)).filter(Boolean)}
          boardItems={data?.board || []}
          markers={data?.markers || []}
          categories={data?.categories || []}
          difficulties={data?.difficulties || []}
          onClose={() => setShowWorkingOnPopup(false)}
          onClearAll={() => {
            // "Clear all" = deselect every task from working on (user
            // request 2026-11-17). Mutating action → bumps meta.updatedAt.
            if (!data) return
            saveData({
              ...data,
              workingOn: [],
              meta: { ...(data.meta || {}), updatedAt: new Date().toISOString() }
            })
          }}
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
              text: data?.tasks?.find(t => t.id === taskId)?.text || '',
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

            const updatedTasks = (data?.tasks || []).map(t => {
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
            
            const updatedWorkingOn = (data?.workingOn || []).filter(id => id !== taskId)

            // Cap logs at 500 entries
            const existingLogs = data?.logs || []
            const updatedLogs = existingLogs.length >= 500
              ? [...existingLogs.slice(existingLogs.length - 499), logEntry]
              : [...existingLogs, logEntry]

            saveData({
              ...(data || {}),
              tasks: updatedTasks,
              board: updatedBoard,
              workingOn: updatedWorkingOn,
              logs: updatedLogs,
              meta: { ...(data?.meta || {}), updatedAt: completedAt }
            })

            setShowWorkingOnPopup(false)
          }}
        />
      )}
    </div>
  )
}

export default App
