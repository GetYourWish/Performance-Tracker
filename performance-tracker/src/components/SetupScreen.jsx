import { useState } from 'react'

function SetupScreen({ onComplete }) {
  const [selectedPath, setSelectedPath] = useState('')
  const [error, setError] = useState('')

  const handleSelectFile = async () => {
    // This will be implemented with Tauri dialog in the actual app
    // For now, just use default
    setSelectedPath('default')
    setError('')
  }

  const handleSelectFolder = async () => {
    // This will be implemented with Tauri dialog in the actual app
    // For now, just use default
    setSelectedPath('default')
    setError('')
  }

  const handleUseDefault = () => {
    // Default path will be handled by Tauri backend
    setSelectedPath('default')
    setError('')
  }

  const handleSubmit = () => {
    if (!selectedPath) {
      setError('Please select a file or folder, or use the default location')
      return
    }

    // Backend will create default path
    onComplete(null)
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
            <button onClick={handleSelectFile} className="option-btn">
              Select Existing tracker.json
            </button>
            <p>Choose an existing data file from your SyncThis folder</p>
          </div>

          <div className="setup-option">
            <button onClick={handleSelectFolder} className="option-btn">
              Select Folder
            </button>
            <p>Choose a folder where tracker.json will be created/used</p>
          </div>

          <div className="setup-option">
            <button onClick={handleUseDefault} className="option-btn">
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
          disabled={!selectedPath}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default SetupScreen
