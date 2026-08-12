import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function BoardRow({ id, task, marker, category, isEditing, onEdit, onUpdate, onCancelEdit, onDelete, onComplete }) {
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
      >
        <div 
          className="drag-handle"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </div>
        <div 
          className="category-marker"
          style={{ 
            backgroundColor: category.color,
            opacity: 0.3
          }}
        >
          /{category.name}
        </div>
        <button 
          className="delete-marker-btn"
          onClick={onDelete}
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
    >
      <div 
        className="drag-handle"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </div>

      {category && (
        <div 
          className="category-indicator"
          style={{ backgroundColor: category.color }}
          title={category.name}
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
        />
      ) : (
        <div 
          className="task-text-display"
          onClick={onEdit}
        >
          {task.text}
        </div>
      )}

      <div className="task-actions">
        <button 
          className="action-btn complete-btn"
          onClick={onComplete}
          title="Complete"
        >
          ✓
        </button>
        <button 
          className="action-btn delete-btn"
          onClick={onDelete}
          title="Delete"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

export default BoardRow
