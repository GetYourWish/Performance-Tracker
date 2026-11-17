import { memo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { deadlineState } from '@performance-tracker/core'

// v1.2.0 (user request 2026-11-18): "Deadlines button should show us a
// calendar we can pick from." The old editor relied on <input type="date">,
// whose dropdown never opens inside Electron — so this is a real month-grid
// calendar. Pure DOM (no native controls), keyboard reachable, and the week
// start follows settings.weekStartsOn (1 = Monday default, like Reviews).

const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
// Indexed by Date#getDay() (0 = Sunday)
const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function calendarIso (year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function DeadlineCalendar ({ value, onChange, today, weekStartsOn = 1 }) {
  // The view opens on the draft deadline's month (so editing an existing
  // deadline starts at the right place), falling back to today's month.
  // The component mounts fresh with every editor open, so view state never
  // needs re-anchoring afterwards.
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : today
  const [viewYear, setViewYear] = useState(Number(initial.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(Number(initial.slice(5, 7)) - 1)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => CALENDAR_WEEKDAYS[(weekStartsOn + i) % 7])

  const shiftMonth = (delta) => {
    setViewMonth(m => {
      const next = m + delta
      if (next < 0) {
        setViewYear(y => y - 1)
        return 11
      }
      if (next > 11) {
        setViewYear(y => y + 1)
        return 0
      }
      return next
    })
  }

  const cells = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="deadline-calendar" role="grid" aria-label="Deadline calendar">
      <div className="deadline-calendar-header">
        <button
          type="button"
          className="deadline-calendar-nav"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="deadline-calendar-title">{CALENDAR_MONTHS[viewMonth]} {viewYear}</span>
        <button
          type="button"
          className="deadline-calendar-nav"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="deadline-calendar-grid">
        {weekdayLabels.map(label => (
          <span key={label} className="deadline-calendar-weekday" aria-hidden="true">{label}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <span key={`blank-${i}`} className="deadline-calendar-day off-month" aria-hidden="true" />
          }
          const iso = calendarIso(viewYear, viewMonth, day)
          const classes = ['deadline-calendar-day']
          if (iso === value) classes.push('selected')
          if (iso === today) classes.push('today')
          return (
            <button
              key={iso}
              type="button"
              className={classes.join(' ')}
              onClick={() => onChange(iso)}
              aria-label={iso}
              aria-pressed={iso === value}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// v1.1.0 — the category-note popup and the deadline editor render through a
// REACT PORTAL to document.body. They used to be plain children of the board
// row, but rows carry a persistent CSS transform (`row-enter-scale` /
// `row-enter-slide` keep `animation-fill-mode: both`, so `transform` stays
// computed on the element forever). A transformed ancestor becomes the
// containing block for `position: fixed` descendants — the fullscreen popup
// was therefore sized to the ~30px marker row and squashed INTO it (the
// "category notes embed" bug, user report 2026-11-17). Portaling escapes
// every ancestor transform/clip permanently.

const BoardRow = memo(function BoardRow({ 
  id, 
  task, 
  marker, 
  category, 
  isEditing, 
  onEdit, 
  onUpdate, 
  onCancelEdit, 
  onDelete, 
  onComplete, 
  onConfirmDelete, 
  onMoveUp, 
  onMoveDown,
  isSelected,
  onSelect,
  isWorkingOn,
  onToggleWorkingOn,
  selectionSize = 1,
  onAddTaskBelow,
  onUpdateMarkerNote,
  isConsecutiveMarker = false,
  onCreateThread,
  isThreadTask = false,
  isRecurringTask = false,
  deadline,
  onSetDeadline,
  today,
  weekStartsOn = 1
}) {
  const [editText, setEditText] = useState(task?.text || '')
  const [showCategoryNotePopup, setShowCategoryNotePopup] = useState(false)
  const [categoryNoteEdit, setCategoryNoteEdit] = useState('')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [showDeadlineEditor, setShowDeadlineEditor] = useState(false)
  const [deadlineDraft, setDeadlineDraft] = useState('')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id,
    data: { 
      type: task ? 'task' : 'marker',
      boardItem: true
    }
  })
  
  // Diagnostic: completely bypass inline style to isolate React #62 source
  // If error persists, the style prop is NOT the cause — it's elsewhere in the tree
  const style = undefined
  void transform // prevent unused var warning
  void transition

  // Determine if we should enable drag on the row body (for multi-select)
  // Only when this item is selected AND there are multiple items selected
  const enableRowDrag = isSelected && selectionSize > 1
  
  // Merge listeners for row-body drag when in multi-select mode
  const rowListeners = enableRowDrag ? listeners : {}

  // Sync local editText when task changes - crucial fix for empty text tasks
  useEffect(() => {
    if (task?.text !== undefined) {
      setEditText(task.text)
    }
  }, [task?.text])

  // Sync category note from marker when it changes
  useEffect(() => {
    if (marker && marker.note !== undefined) {
      setCategoryNoteEdit(marker.note || '')
    }
  }, [marker?.note, marker?.id])

  // ----- deadline editor helpers -------------------------------------------
  const openDeadlineEditor = () => {
    setDeadlineDraft(deadline || '')
    setShowDeadlineEditor(true)
  }

  const confirmDeadline = () => {
    if (onSetDeadline) onSetDeadline(deadlineDraft || '')
    setShowDeadlineEditor(false)
  }

  const clearDeadline = () => {
    if (onSetDeadline) onSetDeadline('')
    setShowDeadlineEditor(false)
  }

  const deadlineInfo = deadlineState(deadline, today)

  if (marker) {
    return (
      <div 
        ref={setNodeRef}
        className={`board-row marker-row row-enter-scale ${isSelected ? 'selected' : ''} ${isConsecutiveMarker ? 'consecutive-marker' : ''}`}
        role="listitem"
        aria-label={`Category marker: ${String(category?.name ?? '')}`}
        data-board-item-id={id}
        onClick={(e) => {
          // Marker rows should NEVER be selected by clicking on them
          // They can only be selected programmatically or via keyboard navigation if needed
          // This prevents accidental selection when clicking near the marker
          e.stopPropagation()
        }}
        {...rowListeners}
      >
        <div 
          className="drag-handle"
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-label="Drag handle"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              listeners.onKeyDown(e)
            }
          }}
        >
          ⋮⋮
        </div>
        <div 
          className="category-marker"
          style={{ backgroundColor: category.color + '4D', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {/* Category note indicator - always visible */}
          <div 
            className="category-note-indicator"
            onClick={(e) => {
              e.stopPropagation()
              setCategoryNoteEdit(marker.note || '')
              setShowCategoryNotePopup(true)
            }}
            title="Click to add/edit category note"
          >
            i
          </div>
          <span>/{String(category.name)}</span>
          <button 
            className="add-task-marker-btn"
            onClick={(e) => {
              e.stopPropagation() // Prevent row selection
              onAddTaskBelow && onAddTaskBelow()
            }}
            title={`Add task below ${String(category.name)}`}
            aria-label={`Add task below ${String(category.name)}`}
          >
            +
          </button>
        </div>
        
        {/* Category note edit popup — PORTALED to document.body (v1.1.0):
            rendered inside the row it inherited the row's persistent
            animation transform as its containing block, which squashed the
            "fullscreen" popup into the marker row (the category-notes embed
            bug). The portal escapes all ancestor transforms and clips. */}
        {showCategoryNotePopup && createPortal(
          <div className="category-note-popup-wrapper">
            <div className="category-note-edit-popup-overlay" onClick={(e) => {
              e.stopPropagation()
              setShowCategoryNotePopup(false)
              setCategoryNoteEdit('')
              setIsEditingNote(false)
            }} />
            <div className="category-note-edit-popup" onClick={(e) => e.stopPropagation()}>
              {!isEditingNote ? (
                // View mode - similar to completion popup structure
                <div className="category-note-view-content">
                  <h3 id="category-note-popup-title">Category Note</h3>
                  <div className="category-name-display">{String(category.name)}</div>
                  <div className="category-note-text">
                    {marker.note && String(marker.note).trim() !== '' ? (
                      String(marker.note)
                    ) : (
                      <span className="no-note-message">No note added</span>
                    )}
                  </div>
                  <div className="note-view-actions">
                    <button 
                      className="btn-cancel"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowCategoryNotePopup(false)
                        setCategoryNoteEdit('')
                        setIsEditingNote(false)
                      }}
                    >
                      Close
                    </button>
                    <button 
                      className="btn-confirm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCategoryNoteEdit(marker.note || '')
                        setIsEditingNote(true)
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                // Edit mode
                <div className="category-note-edit-content">
                  <h3 id="category-note-popup-title">Edit Category Note</h3>
                  <div className="category-name-display">{String(category.name)}</div>
                  <p className="category-note-sync-hint">
                    Applies to every {String(category.name)} marker
                  </p>
                  <textarea
                    value={categoryNoteEdit}
                    onChange={(e) => setCategoryNoteEdit(e.target.value)}
                    placeholder="Enter category note..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        // Save note to marker (Board syncs it to the whole category)
                        onUpdateMarkerNote && onUpdateMarkerNote(marker.id, categoryNoteEdit)
                        setShowCategoryNotePopup(false)
                        setCategoryNoteEdit('')
                        setIsEditingNote(false)
                      } else if (e.key === 'Escape') {
                        setShowCategoryNotePopup(false)
                        setCategoryNoteEdit('')
                        setIsEditingNote(false)
                      }
                    }}
                  />
                  <div className="note-edit-actions">
                    <button 
                      className="save-note-btn btn-cancel"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Save note to marker (Board syncs it to the whole category)
                        onUpdateMarkerNote && onUpdateMarkerNote(marker.id, categoryNoteEdit)
                        setShowCategoryNotePopup(false)
                        setCategoryNoteEdit('')
                        setIsEditingNote(false)
                      }}
                    >
                      Save
                    </button>
                    <button 
                      className="cancel-note-btn btn-cancel"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowCategoryNotePopup(false)
                        setCategoryNoteEdit('')
                        setIsEditingNote(false)
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
        <div className="move-buttons">
          <button 
            className="move-btn"
            onClick={onMoveUp}
            aria-label="Move up"
            title="Move up"
          >
            ↑
          </button>
          <button 
            className="move-btn"
            onClick={onMoveDown}
            aria-label="Move down"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button 
          className="delete-marker-btn"
          onClick={onDelete}
          aria-label={`Delete ${String(category.name)} marker`}
        >
          ✕
        </button>
      </div>
    )
  }

  const handleEditChange = (e) => {
    setEditText(e.target.value)
  }

  const handleEditBlur = () => {
    if (editText.trim() !== task.text) {
      onUpdate(editText.trim() || task.text)
    }
    onCancelEdit()
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (editText.trim() !== task.text) {
        onUpdate(editText.trim() || task.text)
      }
      onCancelEdit()
    } else if (e.key === 'Escape') {
      setEditText(task.text)
      onCancelEdit()
    }
  }

  return (
    <div 
      ref={setNodeRef}
      className={`board-row task-row row-enter-slide ${isEditing ? 'editing' : ''} ${isSelected ? 'selected' : ''} ${isWorkingOn ? 'working-on' : ''} ${deadlineInfo?.overdue ? 'deadline-overdue' : ''}`}
      role="listitem"
      aria-label={`Task: ${String(task?.text ?? '')}`}
      data-board-item-id={id}
      onClick={(e) => {
        // Check if clicking on the task text with modifier key - should toggle selection, not edit
        if (e.target.closest('.task-text-display')) {
          const multiSelectModifier = window.__multiSelectModifier || 'ctrl'
          let isMultiSelect = false
          if (multiSelectModifier === 'ctrl') {
            isMultiSelect = e.ctrlKey || e.metaKey
          } else if (multiSelectModifier === 'shift') {
            isMultiSelect = e.shiftKey
          } else if (multiSelectModifier === 'alt') {
            isMultiSelect = e.altKey
          }
          
          if (isMultiSelect && onSelect) {
            e.stopPropagation()
            onSelect(id, { 
              ctrl: e.ctrlKey, 
              meta: e.metaKey, 
              shift: e.shiftKey, 
              alt: e.altKey 
            })
            return
          }
          // No modifier - proceed with edit
          onEdit()
          return
        }
        
        // Clicking elsewhere on the row (not handle, buttons, or task text)
        if (onSelect && !e.target.closest('.drag-handle') && !e.target.closest('button') && !e.target.closest('.task-input')) {
          const multiSelectModifier = window.__multiSelectModifier || 'ctrl'
          let isMultiSelect = false
          if (multiSelectModifier === 'ctrl') {
            isMultiSelect = e.ctrlKey || e.metaKey
          } else if (multiSelectModifier === 'shift') {
            isMultiSelect = e.shiftKey
          } else if (multiSelectModifier === 'alt') {
            isMultiSelect = e.altKey
          }
          
          if (isMultiSelect) {
            e.stopPropagation()
            onSelect(id, { 
              ctrl: e.ctrlKey, 
              meta: e.metaKey, 
              shift: e.shiftKey, 
              alt: e.altKey 
            })
          }
          // Plain click without modifier does NOT select - prevents accidental selection
        }
      }}
      {...rowListeners}
    >
      <div 
        className="drag-handle"
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label="Drag handle"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            listeners.onKeyDown(e)
          }
        }}
      >
        ⋮⋮
      </div>

      {category && (
        <div 
          className="category-indicator"
          style={{ backgroundColor: category.color }}
          title={category.name}
          aria-hidden="true"
        />
      )}

      {isThreadTask && (
        <span
          className="task-thread-badge"
          title="This task continues a thread (created with the thread button)"
          aria-label="Thread task"
        >
          ⧉
        </span>
      )}
      {isRecurringTask && (
        <span
          className="task-recurring-badge"
          title="Created automatically by a recurring task"
          aria-label="Recurring task"
        >
          ↻
        </span>
      )}

      {isEditing ? (
        <input
          type="text"
          className="task-input editing"
          value={editText}
          onChange={handleEditChange}
          onBlur={handleEditBlur}
          onKeyDown={handleEditKeyDown}
          autoFocus
          aria-label="Edit task"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div 
          className="task-text-display"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onEdit()
            }
          }}
        >
          {String(task?.text ?? '')}
        </div>
      )}

      {/* v1.1.0 DEADLINES: chip shows the state (overdue / due today / in Nd)
          and opens the editor. No deadline yet → the small ⏱ button lives in
          task-actions. */}
      {deadlineInfo && !isEditing && (
        <button
          type="button"
          className={`task-deadline-chip ${deadlineInfo.overdue ? 'overdue' : ''} ${deadlineInfo.dueToday ? 'due-today' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            openDeadlineEditor()
          }}
          title={`Deadline ${task.deadline} — click to edit`}
          aria-label={`Deadline ${deadlineInfo.label}, click to edit`}
        >
          ⏱ {deadlineInfo.label}
        </button>
      )}

      <div className="task-actions">
        <button 
          className={`action-btn working-on-toggle ${isWorkingOn ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleWorkingOn(id)
          }}
          aria-label={isWorkingOn ? 'Remove working on highlight' : 'Mark as working on'}
          title={isWorkingOn ? 'Stop working on' : 'Mark as working on'}
        >
          {isWorkingOn ? '★' : '☆'}
        </button>
        <button 
          className="action-btn thread-btn"
          onClick={(e) => {
            e.stopPropagation()
            onCreateThread && onCreateThread()
          }}
          disabled={!onCreateThread}
          aria-label={`Continue this task in a thread: creates the same task with the next #number below it`}
          title="Thread: continue this task on another day (creates '#2', '#3', … below it)"
        >
          ⧉
        </button>
        <button 
          className="action-btn complete-btn"
          onClick={onComplete}
          aria-label={`Complete task: ${String(task?.text ?? '')}`}
          title="Complete"
        >
          ✓
        </button>
        <div className="move-buttons">
          <button 
            className="move-btn"
            onClick={onMoveUp}
            aria-label="Move up"
            title="Move up"
          >
            ↑
          </button>
          <button 
            className="move-btn"
            onClick={onMoveDown}
            aria-label="Move down"
            title="Move down"
          >
            ↓
          </button>
        </div>
        {!deadlineInfo && (
          <button
            className="action-btn deadline-btn"
            onClick={(e) => {
              e.stopPropagation()
              openDeadlineEditor()
            }}
            aria-label="Set deadline"
            title="Set deadline"
          >
            ⏱
          </button>
        )}
        <button 
          className="action-btn delete-btn"
          onClick={() => onConfirmDelete(task)}
          aria-label={`Delete task: ${String(task?.text ?? '')}`}
          title="Delete"
        >
          🗑
        </button>
      </div>

      {/* Deadline editor — PORTALED to document.body (same transform-escape
          reason as the category note popup above). */}
      {showDeadlineEditor && createPortal(
        <div className="deadline-editor-popup-wrapper">
          <div className="category-note-edit-popup-overlay" onClick={(e) => {
            e.stopPropagation()
            setShowDeadlineEditor(false)
          }} />
          <div
            className="deadline-editor-popup"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowDeadlineEditor(false)
            }}
          >
            <h3>Deadline</h3>
            <div className="task-text" style={{ marginBottom: '12px' }}>{String(task?.text ?? '')}</div>
            <DeadlineCalendar
              value={deadlineDraft}
              onChange={setDeadlineDraft}
              today={today}
              weekStartsOn={weekStartsOn}
            />
            <p className="deadline-calendar-selected">
              {deadlineDraft
                ? <>Selected: <strong>{deadlineDraft}</strong></>
                : 'Pick a day above, then Save.'}
            </p>
            <div className="note-edit-actions" style={{ marginTop: '12px' }}>
              {deadline && (
                <button
                  className="cancel-note-btn btn-cancel"
                  onClick={clearDeadline}
                  title="Remove the deadline"
                >
                  Clear
                </button>
              )}
              <button
                className="cancel-note-btn btn-cancel"
                onClick={() => setShowDeadlineEditor(false)}
              >
                Cancel
              </button>
              <button
                className="save-note-btn btn-cancel"
                onClick={confirmDeadline}
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})

export default BoardRow
