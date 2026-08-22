import { useState, useMemo } from 'react'

function WorkingOnPopup({ tasks, boardItems, markers, categories, difficulties, onClose, onCompleteTask }) {
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')

  const activeDifficulties = difficulties.filter(d => d.active !== false)

  const handleComplete = () => {
    if (!selectedTaskId || !selectedDifficulty) return

    onCompleteTask({
      taskId: selectedTaskId,
      difficultyId: selectedDifficulty,
      date,
      note
    })
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Helper to get category for a task based on board markers
  const getTaskCategory = (taskId) => {
    const marker = markers.find(m => m.taskId === taskId);
    if (!marker) return null;
    const category = categories.find(c => c.id === marker.categoryId);
    return category ? category.color : null;
  }

  return (
    <div 
      className="popup-overlay working-on-popup-overlay"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="working-on-popup-title"
    >
      <div className="working-on-popup">
        <div className="popup-header">
          <h3 id="working-on-popup-title">Working On ({tasks.length})</h3>
          <button 
            className="close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        
        <div className="working-on-tasks-list">
          {tasks.length === 0 ? (
            <p className="empty-state">No tasks currently being worked on.</p>
          ) : (
            tasks.map(task => {
              const category = getTaskCategory(task.id)
              return (
                <div 
                  key={task.id}
                  className={`working-on-task-item ${selectedTaskId === task.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTaskId(task.id)
                    setSelectedDifficulty(null)
                  }}
                >
                  <div className="working-on-task-content">
                    {category && (
                      <span 
                        className="working-on-category-marker"
                        style={{ backgroundColor: category.color }}
                        title={category.name}
                      ></span>
                    )}
                    <span className="working-on-task-text">{task.text}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {selectedTaskId && (
          <div className="completion-section">
            <div className="form-group">
              <label id="difficulty-label">Select Difficulty</label>
              <div 
                className="difficulty-selector"
                role="radiogroup"
                aria-labelledby="difficulty-label"
              >
                {activeDifficulties.map(difficulty => (
                  <button
                    key={difficulty.id}
                    className={`difficulty-chip ${selectedDifficulty === difficulty.id ? 'selected' : ''}`}
                    style={{ 
                      backgroundColor: selectedDifficulty === difficulty.id ? difficulty.color : 'transparent',
                      color: selectedDifficulty === difficulty.id ? '#fff' : difficulty.color,
                      borderColor: difficulty.color
                    }}
                    onClick={() => setSelectedDifficulty(difficulty.id)}
                    role="radio"
                    aria-checked={selectedDifficulty === difficulty.id}
                  >
                    {difficulty.label} ({difficulty.score})
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="completion-date">Date Completed</label>
              <input
                type="date"
                id="completion-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="date-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="completion-note">Note (optional)</label>
              <textarea
                id="completion-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a short note..."
                rows={2}
                className="note-input"
                maxLength={500}
              />
            </div>

            <div className="popup-actions">
              <button 
                className="btn-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button 
                className="btn-confirm"
                onClick={handleComplete}
                disabled={!selectedDifficulty}
                aria-disabled={!selectedDifficulty}
              >
                Complete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkingOnMarker({ data, onOpenPopup }) {
  const workingOnTasks = useMemo(() => {
    if (!data?.workingOn || !data?.tasks) return []
    return data.workingOn
      .map(id => data.tasks.find(t => t.id === id))
      .filter(Boolean)
  }, [data?.workingOn, data?.tasks])

  const count = workingOnTasks.length

  if (count === 0) return null

  return (
    <>
      <button 
        className="working-on-marker"
        onClick={onOpenPopup}
        title={`View ${count} task${count !== 1 ? 's' : ''} you're working on`}
        aria-label={`Working on ${count} task${count !== 1 ? 's' : ''}`}
      >
        <span className="working-on-marker-dot"></span>
        <span className="working-on-marker-text">Working On</span>
        <span className="working-on-marker-count">{count}</span>
      </button>
    </>
  )
}

export { WorkingOnMarker, WorkingOnPopup }
