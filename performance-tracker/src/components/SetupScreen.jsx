import { useState } from 'react'

function SetupScreen({ onComplete }) {
  const [selectedPath, setSelectedPath] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  
  const handleSelectFile = async () => {
    try {
      const filePath = await window.api.chooseDataLocation()
      
      if (filePath) {
        setSelectedPath(filePath)
        setError('')
      }
    } catch (err) {
      console.error('Failed to select file:', err)
      setError('Failed to select file: ' + (err.message || 'Unknown error'))
    }
  }

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.api.chooseFolder()
      
      if (folderPath) {
        // Append tracker.json to the selected folder path
        const fullPath = folderPath.endsWith('tracker.json') ? folderPath : `${folderPath}${folderPath.endsWith('/') || folderPath.endsWith('\\') ? '' : '/'}tracker.json`
        setSelectedPath(fullPath)
        setError('')
      }
    } catch (err) {
      setError('Failed to select folder: ' + (err.message || 'Unknown error'))
    }
  }

  const handleUseDefault = async () => {
    try {
      const defaultPath = await window.api.getDefaultPath()
      setSelectedPath(defaultPath)
      setError('')
    } catch (err) {
      setError('Failed to get default path: ' + err.message)
    }
  }

  const handleSubmit = async () => {
    if (!selectedPath) {
      setError('Please select a file or folder, or use the default location')
      return
    }

    setIsProcessing(true)
    try {
      // Pass the selected path to the handler
      await onComplete(selectedPath)
    } catch (err) {
      setError('Setup failed: ' + err.message)
      setIsProcessing(false)
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-content">
        <h1>Welcome to Performance Tracker</h1>
        <p className="setup-description">
          Let's set up your data file. All your tasks and history will be stored in a single JSON file 
          that can be synced across devices using Syncthing.
        </p>

        <div className="setup-options">
          <div className="setup-option">
            <button onClick={handleSelectFile} className="option-btn" disabled={isProcessing}>
              Select Existing tracker.json
            </button>
            <p>Choose an existing data file from your SyncThis folder</p>
          </div>

          <div className="setup-option">
            <button onClick={handleSelectFolder} className="option-btn" disabled={isProcessing}>
              Select Folder
            </button>
            <p>Choose a folder where tracker.json will be created/used</p>
          </div>

          <div className="setup-option">
            <button onClick={handleUseDefault} className="option-btn" disabled={isProcessing}>
              Use Default Location
            </button>
            <p>Create/use SyncThis/tracker.json next to the app</p>
          </div>
        </div>

        {selectedPath && selectedPath !== 'default' && (
          <div className="selected-path">
            <strong>Selected:</strong> {selectedPath}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <button 
          onClick={handleSubmit}
          className="continue-btn"
          disabled={!selectedPath || isProcessing}
        >
          {isProcessing ? 'Setting Up...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

export default SetupScreen
