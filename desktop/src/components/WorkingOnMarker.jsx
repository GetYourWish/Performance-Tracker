import { useState, useMemo, useRef, useCallback } from 'react'
import { toPng } from 'html-to-image'
import {
  sortWorkingOnByPriority,
  deadlineState,
  getCurrentDate
} from '@performance-tracker/core'

function WorkingOnPopup({ tasks, boardItems, markers, categories, difficulties, onClose, onClearAll, onCompleteTask }) {
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const [date, setDate] = useState(getCurrentDate())
  const [note, setNote] = useState('')

  const activeDifficulties = useMemo(() => difficulties.filter(d => d.active !== false), [difficulties])

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

  const [exporting, setExporting] = useState(false)
  const tasksListRef = useRef(null)

  // Export the working-on list as a PNG (user-facing "Export Image" button).
  //
  // RESULT FIX (user request 2026-11-17): the tasks list scrolls inside a
  // max-height container. html-to-image sizes its canvas from the node's
  // clientWidth/clientHeight — the VISIBLE area only — so the old export was
  // clipped to whatever was on screen. Passing explicit width/height
  // (clientWidth × scrollHeight = the FULL content) plus un-clipping the
  // clone (maxHeight none, overflow visible) captures every task.
  const handleExportImage = useCallback(async () => {
    const node = tasksListRef.current
    if (!node) return

    setExporting(true)
    try {
      const dataUrl = await toPng(node, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#1a1a2e',
        pixelRatio: 2,
        // Full content size — NOT the scrolled viewport (see comment above).
        width: node.clientWidth,
        height: node.scrollHeight,
        style: {
          // Un-clip the clone so the whole list lays out inside the canvas.
          overflow: 'visible',
          maxHeight: 'none'
        }
      })
      const exportDate = new Date().toISOString().split('T')[0]
      await window.api.saveImage(dataUrl, `working-on-${exportDate}.png`)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [])

  // Pre-compute category lookup for each working-on task
  const taskCategoryMap = useMemo(() => {
    const markerMap = new Map(markers.map(m => [m.id, m]))
    const catMap = new Map(categories.map(c => [c.id, c]))
    const map = new Map()
    for (let i = 0; i < boardItems.length; i++) {
      const item = boardItems[i]
      if (item.type !== 'task') continue
      let aboveMarker = null
      for (let j = i - 1; j >= 0; j--) {
        if (boardItems[j].type === 'marker') { aboveMarker = boardItems[j]; break }
      }
      let belowMarker = null
      for (let j = i + 1; j < boardItems.length; j++) {
        if (boardItems[j].type === 'marker') { belowMarker = boardItems[j]; break }
      }
      let category = null
      if (aboveMarker && belowMarker) {
        const aboveCat = markerMap.get(aboveMarker.markerId)?.categoryId
        const belowCat = markerMap.get(belowMarker.markerId)?.categoryId
        if (aboveCat && aboveCat === belowCat) {
          category = catMap.get(aboveCat) || null
        }
      }
      if (category) map.set(item.taskId, category)
    }
    return map
  }, [boardItems, markers, categories])

  // Display order: category priority FIRST, not the time tasks were added
  // (user request 2026-11-17). Core helper = canonical rule shared with the
  // Android app; stable within the same priority.
  const sortedTasks = useMemo(() => {
    const byId = new Map(tasks.map(t => [t.id, t]))
    const sortedIds = sortWorkingOnByPriority(
      tasks.map(t => t.id),
      boardItems,
      markers,
      categories
    )
    return sortedIds.map(id => byId.get(id)).filter(Boolean)
  }, [tasks, boardItems, markers, categories])

  const today = getCurrentDate()

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
          <div className="working-on-header-actions">
            <button 
              className="working-on-clear-btn"
              onClick={onClearAll}
              disabled={tasks.length === 0}
              title="Deselect every task from Working On"
            >
              Clear All
            </button>
            <button 
              className="working-on-export-btn"
              onClick={handleExportImage}
              disabled={exporting || tasks.length === 0}
              title="Export as image"
            >
              {exporting ? 'Saving...' : 'Export Image'}
            </button>
            <button 
              className="close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="working-on-tasks-list" ref={tasksListRef}>
          {tasks.length === 0 ? (
            <p className="empty-state">No tasks currently being worked on.</p>
          ) : (
            sortedTasks.map(task => {
              const category = taskCategoryMap.get(task.id) || null
              const backgroundColor = category ? `${category.color}22` : 'transparent'
              const deadline = deadlineState(task.deadline, today)
              return (
                <div 
                  key={task.id}
                  className={`working-on-task-item ${selectedTaskId === task.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTaskId(task.id)
                    setSelectedDifficulty(null)
                  }}
                  style={{ backgroundColor }}
                >
                  <div className="working-on-task-content">
                    {category && (
                      <span 
                        className="working-on-category-marker"
                        style={{ backgroundColor: category.color }}
                        title={category.name}
                      ></span>
                    )}
                    <span className="working-on-task-text">{String(task?.text ?? '')}</span>
                    {deadline && (
                      <span
                        className={`working-on-deadline-chip ${deadline.overdue ? 'overdue' : ''} ${deadline.dueToday ? 'due-today' : ''}`}
                        title={`Deadline: ${task.deadline}`}
                      >
                        ⏱ {deadline.label}
                      </span>
                    )}
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
