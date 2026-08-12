import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import Board from './components/Board'
import Reviews from './components/Reviews'
import Settings from './components/Settings'
import SetupScreen from './components/SetupScreen'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('board')
  const [dataFile, setDataFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)

  // Load app state and data file path on mount
  useEffect(() => {
    loadAppState()
  }, [])

  // Watch for external file changes
  useEffect(() => {
    if (!dataFile) return

    let unsubscribeFn = null
    
    const setupListener = async () => {
      unsubscribeFn = await listen('tauri://file-watcher', async (event) => {
        console.log('File changed externally:', event.payload)
        await loadData()
      })
    }
    
    setupListener()

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn()
      }
    }
  }, [dataFile])

  const loadAppState = async () => {
    try {
      const appState = await invoke('get_app_state')
      if (appState.dataFilePath) {
        setDataFile(appState.dataFilePath)
        await loadData(appState.dataFilePath)
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

  const loadData = async (filePath = dataFile) => {
    if (!filePath) {
      setLoading(false)
      return
    }
    
    try {
      const loadedData = await invoke('load_data', { filePath })
      setData(loadedData)
    } catch (error) {
      console.error('Failed to load data:', error)
      if (error.message.includes('not found') || error.message.includes('corrupt')) {
        setSetupRequired(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const saveData = useCallback(async (newData) => {
    if (!dataFile) return
    
    try {
      await invoke('save_data', { filePath: dataFile, data: newData })
      setData(newData)
    } catch (error) {
      console.error('Failed to save data:', error)
      throw error
    }
  }, [dataFile])

  const handleSetupComplete = async (filePath) => {
    try {
      // Get default path from backend if no specific path selected
      let finalPath = filePath
      if (!filePath || filePath === 'default') {
        finalPath = await invoke('get_default_path')
      }
      
      // Create default data if file doesn't exist
      const defaultData = await invoke('create_default_data')
      await invoke('save_data', { filePath: finalPath, data: defaultData })
      
      await invoke('set_app_state', { dataFilePath: finalPath })
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
          onClick={() => setCurrentView('board')}
        >
          Board
        </button>
        <button 
          className={`nav-item ${currentView === 'reviews' ? 'active' : ''}`}
          onClick={() => setCurrentView('reviews')}
        >
          Reviews
        </button>
        <button 
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => setCurrentView('settings')}
        >
          Settings
        </button>
      </nav>
      
      <main className="main-content">
        {currentView === 'board' && (
          <Board data={data} onSave={saveData} />
        )}
        {currentView === 'reviews' && (
          <Reviews data={data} />
        )}
        {currentView === 'settings' && (
          <Settings 
            data={data} 
            onSave={saveData}
            dataFile={dataFile}
          />
        )}
      </main>
    </div>
  )
}

export default App
