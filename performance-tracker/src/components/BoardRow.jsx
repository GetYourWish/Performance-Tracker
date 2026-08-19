import { memo, useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'

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
  selectionSize = 1
}) {
  const [editText, setEditText] = useState(task?.text || '')
  
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
      type: task ? 'task' : 'marker' 
    }
  })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  // Determine if we should enable drag on the row body (for multi-select)
  // Only when this item is selected AND there are multiple items selected
  const enableRowDrag = isSelected && selectionSize > 1
  
  // Merge listeners for row-body drag when in multi-select mode
  const rowListeners = enableRowDrag ? listeners : {}

  // Sync local editText when task changes
  useEffect(() => {
    if (task?.text) {
      setEditText(task.text)
    }
  }, [task?.text])

  if (marker) {
    return (
      <motion.div 
        ref={setNodeRef}
        layout
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        style={style}
        className={`board-row marker-row ${isSelected ? 'selected' : ''}`}
        role="listitem"
        aria-label={`Category marker: ${category.name}`}
        onClick={(e) => {
          // Check for modifier key click on marker row - should toggle selection
          const multiSelectModifier = window.__multiSelectModifier || 'ctrl'
          let isMultiSelect = false
          if (multiSelectModifier === 'ctrl') {
            isMultiSelect = e.ctrlKey || e.metaKey
          } else if (multiSelectModifier === 'shift') {
            isMultiSelect = e.shiftKey
          } else if (multiSelectModifier === 'alt') {
            isMultiSelect = e.altKey
          }
          
          if (onSelect && !e.target.closest('.drag-handle') && !e.target.closest('button')) {
            e.stopPropagation()
            onSelect(id, { 
              ctrl: e.ctrlKey, 
              meta: e.metaKey, 
              shift: e.shiftKey, 
              alt: e.altKey 
            })
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
        <div 
          className="category-marker"
          style={{ backgroundColor: category.color + '4D', color: 'var(--text-primary)' }}
        >
          /{category.name}
        </div>
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
          aria-label={`Delete ${category.name} marker`}
        >
          ✕
        </button>
      </motion.div>
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
    <motion.div 
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, rotateX: 90 }}
      transition={{ type: 'spring', stiffness: 170, damping: 26 }}
      style={style}
      className={`board-row task-row ${isEditing ? 'editing' : ''} ${isSelected ? 'selected' : ''} ${isWorkingOn ? 'working-on' : ''}`}
      role="listitem"
      aria-label={`Task: ${task.text}`}
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
          } else {
            // Plain click - select only this item
            e.stopPropagation()
            onSelect(id, { ctrl: false, meta: false, shift: false, alt: false })
          }
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
          {task.text}
        </div>
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
          className="action-btn complete-btn"
          onClick={onComplete}
          aria-label={`Complete task: ${task.text}`}
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
        <button 
          className="action-btn delete-btn"
          onClick={() => onConfirmDelete(task)}
          aria-label={`Delete task: ${task.text}`}
          title="Delete"
        >
          🗑
        </button>
      </div>
    </motion.div>
  )
})

export default BoardRow
