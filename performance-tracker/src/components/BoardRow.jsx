import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const BoardRow = memo(function BoardRow({ id, task, marker, category, isEditing, onEdit, onUpdate, onCancelEdit, onDelete, onComplete, onConfirmDelete, onMoveUp, onMoveDown }) {
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

  if (marker) {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        className="board-row marker-row"
        role="listitem"
        aria-label={`Category marker: ${category.name}`}
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
      </div>
    )
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`board-row task-row ${isEditing ? 'editing' : ''}`}
      role="listitem"
      aria-label={`Task: ${task.text}`}
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
          value={task.text}
          onChange={(e) => onUpdate(e.target.value)}
          onBlur={onCancelEdit}
          autoFocus
          aria-label="Edit task"
        />
      ) : (
        <div 
          className="task-text-display"
          onClick={onEdit}
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
    </div>
  )
})

export default BoardRow
