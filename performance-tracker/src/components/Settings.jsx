import { useState } from 'react'

function Settings({ data, onSave, dataFile, conflicts, onBackupNow, onOpenFolder, onChangeDataFolder }) {
  const [activeTab, setActiveTab] = useState('data')
  const [moveStatus, setMoveStatus] = useState(null) // null | 'choosing' | 'confirming' | 'moving'
  const [pendingFolder, setPendingFolder] = useState(null)
  const [error, setError] = useState('')

  const settings = data?.settings || {}
  const difficulties = data?.difficulties || []
  const categories = data?.categories || []

  const handleSettingChange = (key, value) => {
    onSave({
      ...data,
      settings: {
        ...settings,
        [key]: value
      },
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleDifficultyUpdate = (index, field, value) => {
    const updated = [...difficulties]
    updated[index] = { ...updated[index], [field]: value }
    onSave({
      ...data,
      difficulties: updated,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleMoveDifficulty = (index, direction) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= difficulties.length) return
    
    const updated = [...difficulties]
    const temp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = temp
    
    // Update order values
    updated.forEach((d, i) => {
      d.order = i
    })
    
    onSave({
      ...data,
      difficulties: updated,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleAddDifficulty = () => {
    const newDifficulty = {
      id: `diff-${Date.now()}`,
      label: 'New Difficulty',
      score: 1,
      color: '#60a5fa',
      order: difficulties.length,
      active: true
    }
    onSave({
      ...data,
      difficulties: [...difficulties, newDifficulty],
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleCategoryUpdate = (index, field, value) => {
    const updated = [...categories]
    updated[index] = { ...updated[index], [field]: value }
    onSave({
      ...data,
      categories: updated,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleMoveCategory = (index, direction) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= categories.length) return
    
    const updated = [...categories]
    const temp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = temp
    
    // Update order values
    updated.forEach((c, i) => {
      c.order = i
    })
    
    onSave({
      ...data,
      categories: updated,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleAddCategory = () => {
    const newCategory = {
      id: `cat-${Date.now()}`,
      name: 'New Category',
      color: '#60a5fa',
      order: categories.length,
      active: true
    }
    onSave({
      ...data,
      categories: [...categories, newCategory],
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleChangeFolderClick = async () => {
    setError('')
    setMoveStatus('choosing')
    try {
      const result = await window.api.chooseDataFolder()
      if (result) {
        setPendingFolder(result.folder)
        setMoveStatus('confirming')
      } else {
        setMoveStatus(null)
      }
    } catch (err) {
      setError('Failed to choose folder: ' + (err.message || 'Unknown error'))
      setMoveStatus(null)
    }
  }

  const confirmMove = async () => {
    if (!pendingFolder) return
    setMoveStatus('moving')
    setError('')
    try {
      const result = await onChangeDataFolder(pendingFolder)
      if (result && result.success) {
        setMoveStatus('success')
        setPendingFolder(null)
      }
    } catch (err) {
      setError('Failed to move data: ' + (err.message || 'Unknown error'))
      setMoveStatus(null)
      setPendingFolder(null)
    }
  }

  const cancelMove = () => {
    setMoveStatus(null)
    setPendingFolder(null)
    setError('')
  }

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      <div className="settings-tabs">
        <button 
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Data
        </button>
        <button 
          className={`tab ${activeTab === 'difficulties' ? 'active' : ''}`}
          onClick={() => setActiveTab('difficulties')}
        >
          Difficulties
        </button>
        <button 
          className={`tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
        <button 
          className={`tab ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
        <button 
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
        <button 
          className={`tab ${activeTab === 'scoring' ? 'active' : ''}`}
          onClick={() => setActiveTab('scoring')}
        >
          Scoring
        </button>
      </div>

      <div className="settings-content scrollable">
        {activeTab === 'data' && (
          <div className="settings-section">
            <h3>Data File</h3>
            <div className="setting-item">
              <label>Current Data Folder</label>
              <div className="file-path">{dataFile ? dataFile.replace(/[\\/][^\\/]+$/, '') : 'Not set'}</div>
            </div>
            <div className="setting-item">
              <label>Data File</label>
              <div className="file-path" style={{ fontSize: '0.85em', opacity: 0.8 }}>{dataFile || 'Not set'}</div>
            </div>
            
            <div className="data-actions">
              <button className="action-btn" onClick={onOpenFolder}>
                Open Data Folder
              </button>
              <button className="action-btn" onClick={onBackupNow}>
                Backup Now
              </button>
              <button 
                className="action-btn" 
                onClick={handleChangeFolderClick}
                disabled={moveStatus === 'moving'}
              >
                {moveStatus === 'moving' ? 'Moving…' : 'Change Data Folder'}
              </button>
            </div>

            {/* Folder picker confirmation dialog */}
            {moveStatus === 'confirming' && pendingFolder && (
              <div className="folder-confirm-dialog">
                <p><strong>Move your data to:</strong></p>
                <div className="file-path">{pendingFolder}</div>
                <p className="setting-note">
                  A backup will be created first. Your <code>tracker.json</code> will be copied to the new folder
                  and the app will switch to using that location.
                </p>
                <div className="data-actions">
                  <button className="action-btn" onClick={confirmMove}>Confirm Move</button>
                  <button className="action-btn" onClick={cancelMove}>Cancel</button>
                </div>
              </div>
            )}

            {/* Success message */}
            {moveStatus === 'success' && (
              <div className="folder-move-success">
                Data moved successfully. The new location will take full effect on the next save.
              </div>
            )}

            {error && <div className="error-message" style={{ marginTop: '8px' }}>{error}</div>}
            
            {conflicts && conflicts.length > 0 && (
              <div className="conflict-warning">
                <strong>Conflict Files Detected:</strong>
                <ul>
                  {conflicts.map((conflict, idx) => (
                    <li key={idx}>{conflict}</li>
                  ))}
                </ul>
                <p className="setting-note">
                  Syncthing has created conflict files. Please review them manually to avoid data loss.
                </p>
              </div>
            )}
            
            <p className="setting-note">
              Choose any folder to store your data. If you use Syncthing, pick your synced folder for automatic cross-device sync.
            </p>
          </div>
        )}

        {activeTab === 'difficulties' && (
          <div className="settings-section">
            <h3>Difficulty Levels</h3>
            <p className="setting-note">
              Changing scores will recalculate all historical data.
            </p>
            
            <div className="difficulties-list">
              {difficulties.map((difficulty, index) => (
                <div key={difficulty.id} className="difficulty-item">
                  <input
                    type="text"
                    value={difficulty.label}
                    onChange={(e) => handleDifficultyUpdate(index, 'label', e.target.value)}
                    placeholder="Label"
                  />
                  <input
                    type="number"
                    value={difficulty.score}
                    onChange={(e) => handleDifficultyUpdate(index, 'score', parseFloat(e.target.value))}
                    step="0.1"
                    min="0"
                    style={{ width: '80px' }}
                  />
                  <input
                    type="color"
                    value={difficulty.color}
                    onChange={(e) => handleDifficultyUpdate(index, 'color', e.target.value)}
                  />
                  <div className="reorder-buttons">
                    <button 
                      className="reorder-btn" 
                      onClick={() => handleMoveDifficulty(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button 
                      className="reorder-btn" 
                      onClick={() => handleMoveDifficulty(index, 1)}
                      disabled={index === difficulties.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={difficulty.active !== false}
                      onChange={(e) => handleDifficultyUpdate(index, 'active', e.target.checked)}
                    />
                    Active
                  </label>
                </div>
              ))}
              
              <button className="add-btn" onClick={handleAddDifficulty}>
                + Add Difficulty
              </button>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="settings-section">
            <h3>Categories</h3>
            
            <div className="categories-list">
              {categories.map((category, index) => (
                <div key={category.id} className="category-item">
                  <input
                    type="text"
                    value={category.name}
                    onChange={(e) => handleCategoryUpdate(index, 'name', e.target.value)}
                    placeholder="Name"
                  />
                  <input
                    type="color"
                    value={category.color}
                    onChange={(e) => handleCategoryUpdate(index, 'color', e.target.value)}
                  />
                  <div className="reorder-buttons">
                    <button 
                      className="reorder-btn" 
                      onClick={() => handleMoveCategory(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button 
                      className="reorder-btn" 
                      onClick={() => handleMoveCategory(index, 1)}
                      disabled={index === categories.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={category.active !== false}
                      onChange={(e) => handleCategoryUpdate(index, 'active', e.target.checked)}
                    />
                    Active
                  </label>
                </div>
              ))}
              
              <button className="add-btn" onClick={handleAddCategory}>
                + Add Category
              </button>
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="settings-section">
            <h3>Appearance</h3>
            
            <div className="setting-item">
              <label>Theme</label>
              <select
                value={settings.theme || 'system'}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            
            <div className="setting-item">
              <label>Multi-Select Modifier</label>
              <select
                value={settings.multiSelectModifier || 'ctrl'}
                onChange={(e) => handleSettingChange('multiSelectModifier', e.target.value)}
              >
                <option value="ctrl">Ctrl (Cmd on macOS)</option>
                <option value="shift">Shift</option>
                <option value="alt">Alt</option>
              </select>
              <p className="setting-note">
                Hold this key while clicking to select multiple items
              </p>
            </div>
            
            <div className="setting-item">
              <label>Consecutive Marker Spacing</label>
              <input
                type="number"
                value={parseInt(settings.consecutiveMarkerMargin) || 150}
                onChange={(e) => handleSettingChange('consecutiveMarkerMargin', `${Math.max(0, parseInt(e.target.value) || 0)}px`)}
                min="0"
                max="500"
                step="10"
                style={{ width: '100px' }}
              />
              <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>px</span>
              <p className="setting-note">
                Space between consecutive category markers on the board (default: 150px)
              </p>
            </div>
            
            <div className="setting-item">
              <label>Flow State Chart Color</label>
              <input
                type="color"
                value={settings.flowStateColor || '#8b5cf6'}
                onChange={(e) => handleSettingChange('flowStateColor', e.target.value)}
                style={{ width: '60px', height: '40px', padding: '2px' }}
              />
              <p className="setting-note">
                Choose the color for the Flow State chart
              </p>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="settings-section">
            <h3>Calendar Settings</h3>
            
            <div className="setting-item">
              <label>Week Starts On</label>
              <select
                value={settings.weekStartsOn || 1}
                onChange={(e) => handleSettingChange('weekStartsOn', parseInt(e.target.value))}
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'scoring' && (
          <div className="settings-section">
            <h3>Scoring Settings</h3>
            
            <div className="setting-item">
              <label>Fatigue Bonus Per Task</label>
              <input
                type="number"
                value={settings.fatigueIncrement || 0.10}
                onChange={(e) => handleSettingChange('fatigueIncrement', parseFloat(e.target.value))}
                step="0.01"
                min="0"
                max="1"
              />
              <p className="setting-note">
                Default: 0.10 (10% bonus per additional task)
              </p>
            </div>

            <div className="setting-item">
              <label>Maximum Fatigue Multiplier</label>
              <input
                type="number"
                value={settings.fatigueCap || 3.0}
                onChange={(e) => handleSettingChange('fatigueCap', parseFloat(e.target.value))}
                step="0.1"
                min="1"
                max="10"
              />
              <p className="setting-note">
                Default: 3.0 (maximum 3x score multiplier)
              </p>
            </div>

            <div className="setting-item">
              <label>Heatmap Mode</label>
              <select
                value={settings.heatmapMode || 'score'}
                onChange={(e) => handleSettingChange('heatmapMode', e.target.value)}
              >
                <option value="score">Score</option>
                <option value="count">Task Count</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
