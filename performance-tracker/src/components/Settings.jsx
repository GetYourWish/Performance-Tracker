import { useState } from 'react'

function Settings({ data, onSave, dataFile }) {
  const [activeTab, setActiveTab] = useState('data')

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
              <label>Current File Location</label>
              <div className="file-path">{dataFile || 'Not set'}</div>
            </div>
            <p className="setting-note">
              The data file is synced with Syncthing. Keep it in your SyncThis folder for best results.
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
