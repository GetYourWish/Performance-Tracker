import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import CompletionPopup from './CompletionPopup'
import BoardRow from './BoardRow'
import { generateId, getCurrentDate, getTaskCategory } from '../utils/helpers'

// Simple category chip with + button to add marker
function CategoryChip({ category, onAddMarker }) {
  return (
    <div className="category-chip" style={{ backgroundColor: category.color }}>
      <span className="category-chip-name">{category.name}</span>
      <button
        className="chip-add-marker-btn"
        title="Add marker to board"
        aria-label={`Add ${category.name} marker to the board`}
        onClick={onAddMarker}
      >
        +
      </button>
    </div>
  )
}

// Insertion point component for precise drop locations
function InsertionPoint({ id, onDrop }) {
  const { setNodeRef, isOver } = useDroppable({ 
    id,
    data: {
      type: 'insertion-point',
      insertionId: id
    }
  })
  
  return (
    <div
      ref={setNodeRef}
      className={`insertion-point ${isOver ? 'is-over' : ''}`}
      data-insertion-id={id}
    />
  )
}

// Sidebar component for categories - simple list with + button on chips
function CategorySidebar({ categories, onCreateCategory, onAddMarker }) {
  const [isCreating, setIsCreating] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#60a5fa')
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return

    const newCategory = {
      id: generateId(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
      order: 0,
      active: true
    }

    // Insert at top and re-index all orders
    const updatedCategories = [newCategory, ...categories].map((cat, idx) => ({
      ...cat,
      order: idx
    }))

    onCreateCategory(updatedCategories)

    setNewCategoryName('')
    setIsCreating(false)
  }
  
  if (isCollapsed) {
    return (
      <div className="category-grabber collapsed">
        <button 
          className="categories-toggle"
          onClick={() => setIsCollapsed(false)}
        >
          Show Categories ({categories.length})
        </button>
      </div>
    );
  }
  
  return (
    <div className="category-grabber">
      <div className="category-grabber-header">
        <h4>Categories</h4>
        <button 
          className="collapse-btn"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse categories"
        >
          −
        </button>
      </div>
      <p className="drag-hint">Click + on a category to add a marker to the board</p>
      
      <div className="categories-list">
        {categories.filter(c => c.active !== false).map((category) => (
          <CategoryChip
            key={category.id}
            category={category}
            onAddMarker={() => onAddMarker(category)}
          />
        ))}

        {isCreating ? (
          <div className="new-category-form">
            <input
              type="text"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            <input
              type="color"
              value={newCategoryColor}
              onChange={(e) => setNewCategoryColor(e.target.value)}
            />
            <button onClick={handleCreateCategory}>Add</button>
            <button onClick={() => setIsCreating(false)}>Cancel</button>
          </div>
        ) : (
          <button 
            className="add-category-btn"
            onClick={() => setIsCreating(true)}
          >
            + Add Category
          </button>
        )}
      </div>
    </div>
  )
}

function Board({ data, onSave }) {
  // Derive state directly from props - no duplication
  const tasks = useMemo(() => data?.tasks?.filter(t => !t.completion) || [], [data?.tasks])
  const boardItems = useMemo(() => data?.board || [], [data?.board])
  const markers = useMemo(() => data?.markers || [], [data?.markers])
  const categories = useMemo(() => data?.categories || [], [data?.categories])
  const difficulties = useMemo(() => data?.difficulties || [], [data?.difficulties])
  const settings = useMemo(() => data?.settings || {}, [data?.settings])
  
  const [editingTask, setEditingTask] = useState(null)
  const [newTaskText, setNewTaskText] = useState('')
  const [completionTask, setCompletionTask] = useState(null)
  const [showCategoryGrabber, setShowCategoryGrabber] = useState(false)
  const [draggingItem, setDraggingItem] = useState(null)
  const [deleteTask, setDeleteTask] = useState(null)
  
  // Apply theme from settings
  useEffect(() => {
    const theme = settings.theme || 'system'
    const root = document.documentElement
    
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      // System theme
      root.removeAttribute('data-theme')
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.setAttribute('data-theme', 'dark')
      }
    }
  }, [settings.theme])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleCreateTask = useCallback(() => {
    if (!newTaskText.trim()) return

    const newTask = {
      id: generateId(),
      text: newTaskText.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completion: null
    }

    const updatedTasks = [...tasks, newTask]
    const updatedBoard = [{ type: 'task', taskId: newTask.id }, ...boardItems]

    setNewTaskText('')

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [newTaskText, tasks, boardItems, data, onSave])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreateTask()
    } else if (e.key === 'Escape') {
      // Cancel new task input
      setNewTaskText('')
    }
  }

  const handleUpdateTask = useCallback((taskId, newText) => {
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, text: newText, updatedAt: new Date().toISOString() }
      }
      return t
    })

    onSave({
      ...data,
      tasks: updatedTasks,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [tasks, data, onSave])

  const handleDeleteTask = useCallback((taskId) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId)
    const updatedBoard = boardItems.filter(item => 
      !(item.type === 'task' && item.taskId === taskId)
    )

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [tasks, boardItems, data, onSave])

  const handleMoveItem = useCallback((itemId, direction) => {
    const itemIndex = boardItems.findIndex(item => {
      if (item.type === 'task') return item.taskId === itemId
      if (item.type === 'marker') return item.markerId === itemId
      return false
    })
    
    if (itemIndex === -1) return
    
    const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1
    if (newIndex < 0 || newIndex >= boardItems.length) return
    
    const newBoard = [...boardItems]
    const temp = newBoard[itemIndex]
    newBoard[itemIndex] = newBoard[newIndex]
    newBoard[newIndex] = temp
    
    onSave({
      ...data,
      board: newBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [boardItems, data, onSave])

  const handleCompleteClick = useCallback((task) => {
    setCompletionTask(task)
  }, [])

  const handleCompletionConfirm = useCallback((completionData) => {
    // Since state is derived from props, we directly compute updated data
    // Find task index in boardItems to determine category based on markers ONLY
    const taskIndex = boardItems.findIndex(item => item.type === 'task' && item.taskId === completionData.taskId)
    
    // Strict marker-based category derivation: scan boardItems for MARKER entries only
    // Find nearest marker above and nearest marker below; task gets that category ONLY if
    // both exist and both reference the same category ID
    let aboveMarker = null
    let belowMarker = null
    
    for (let i = taskIndex - 1; i >= 0; i--) {
      const item = boardItems[i]
      if (item && item.type === 'marker') {
        aboveMarker = item
        break
      }
    }
    
    for (let i = taskIndex + 1; i < boardItems.length; i++) {
      const item = boardItems[i]
      if (item && item.type === 'marker') {
        belowMarker = item
        break
      }
    }
    
    let categoryId = null
    if (aboveMarker && belowMarker && aboveMarker.markerId === belowMarker.markerId) {
      // Same marker above and below (shouldn't happen normally, but just in case)
      const marker = markers.find(m => m.id === aboveMarker.markerId)
      if (marker) categoryId = marker.categoryId
    } else if (aboveMarker && belowMarker) {
      // Check if both markers reference the same category
      const aboveMarkerObj = markers.find(m => m.id === aboveMarker.markerId)
      const belowMarkerObj = markers.find(m => m.id === belowMarker.markerId)
      if (aboveMarkerObj && belowMarkerObj && aboveMarkerObj.categoryId === belowMarkerObj.categoryId) {
        categoryId = aboveMarkerObj.categoryId
      }
    }
    
    const updatedTasks = data.tasks.map(t => {
      if (t.id === completionData.taskId) {
        return {
          ...t,
          completion: {
            completedDate: completionData.date,
            completedAt: new Date().toISOString(),
            difficultyId: completionData.difficultyId,
            categoryId: categoryId,
            note: completionData.note || ''
          }
        }
      }
      return t
    })

    const updatedBoard = boardItems.filter(item => 
      !(item.type === 'task' && item.taskId === completionData.taskId)
    )

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })

    setCompletionTask(null)
  }, [boardItems, markers, categories, data, onSave])

  const handleDragStart = (event) => {
    setDraggingItem(event.active)
  }

  const handleAddMarker = useCallback((category) => {
    const newMarker = {
      id: generateId(),
      categoryId: category.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    onSave({
      ...data,
      markers: [...markers, newMarker],
      board: [...boardItems, { type: 'marker', markerId: newMarker.id }],
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [data, markers, boardItems, onSave])

  const handleDragEnd = (event) => {
    const { active, over } = event
    setDraggingItem(null)

    // Handle reordering of tasks and markers within the board with proper gap-drop support
    if (!over) return
    if (active.id === over.id) return

    // Compute draggedIndex
    const draggedIndex = boardItems.findIndex(item => {
      if (active.data.current?.type === 'task') {
        return item.type === 'task' && item.taskId === active.id
      }
      if (active.data.current?.type === 'marker') {
        return item.type === 'marker' && item.markerId === active.id
      }
      return false
    })

    if (draggedIndex === -1) return

    // Compute targetIndex based on drop target
    let targetIndex
    if (over.data.current?.type === 'insertion-point') {
      // Gap drop: compute index based on insertion point position
      if (over.id === 'insert-top') {
        targetIndex = 0
      } else {
        // Find the index of the item before this insertion point
        const itemId = over.id // insertion point id is the item id it follows
        targetIndex = boardItems.findIndex(item => {
          if (item.type === 'task') return item.taskId === itemId
          if (item.type === 'marker') return item.markerId === itemId
        }) + 1
      }
    } else {
      // Drop on item: use indexOf(over.id)
      targetIndex = boardItems.findIndex(item => {
        if (over.data.current?.type === 'task') {
          return item.type === 'task' && item.taskId === over.id
        }
        if (over.data.current?.type === 'marker') {
          return item.type === 'marker' && item.markerId === over.id
        }
        return false
      })
    }

    if (targetIndex === -1) return

    // Splice out the dragged item
    const newBoard = [...boardItems]
    const [removed] = newBoard.splice(draggedIndex, 1)
    
    // Decrement targetIndex if it's after draggedIndex (since we removed an item before it)
    const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
    
    // Splice in at the adjusted position
    newBoard.splice(adjustedTargetIndex, 0, removed)

    onSave({
      ...data,
      board: newBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleMarkerDrop = (categoryId, isNewCategory = false, insertionId = null, categoryObj = null, appendToEnd = false) => {
    // If this is a new category being created, we need to add it to categories first
    if (isNewCategory && typeof categoryId === 'object') {
      // categoryId is actually the new category object
      const newCategory = categoryId
      const updatedCategories = [...categories, newCategory]
      
      const newMarker = {
        id: generateId(),
        categoryId: newCategory.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const updatedMarkers = [...markers, newMarker]
      let updatedBoard
      
      // Insert at specific position if insertionId is provided
      if (insertionId !== null) {
        const insertIndex = boardItems.findIndex(item => {
          if (item.type === 'task') return item.taskId === insertionId
          if (item.type === 'marker') return item.markerId === insertionId
          return false
        })
        if (insertIndex >= 0) {
          updatedBoard = [
            ...boardItems.slice(0, insertIndex + 1),
            { type: 'marker', markerId: newMarker.id },
            ...boardItems.slice(insertIndex + 1)
          ]
        } else {
          updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
        }
      } else if (appendToEnd) {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
      } else {
        updatedBoard = [{ type: 'marker', markerId: newMarker.id }, ...boardItems]
      }

      onSave({
        ...data,
        categories: updatedCategories,
        markers: updatedMarkers,
        board: updatedBoard,
        meta: { ...data.meta, updatedAt: new Date().toISOString() }
      })
      return
    }
    
    // Normal case - existing category from sidebar
    if (categoryObj) {
      // We have the category object passed directly
      const newMarker = {
        id: generateId(),
        categoryId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const updatedMarkers = [...markers, newMarker]
      let updatedBoard
      
      // Insert at specific position if insertionId is provided
      if (insertionId !== null) {
        const insertIndex = boardItems.findIndex(item => {
          if (item.type === 'task') return item.taskId === insertionId
          if (item.type === 'marker') return item.markerId === insertionId
          return false
        })
        if (insertIndex >= 0) {
          updatedBoard = [
            ...boardItems.slice(0, insertIndex + 1),
            { type: 'marker', markerId: newMarker.id },
            ...boardItems.slice(insertIndex + 1)
          ]
        } else if (appendToEnd) {
          updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
        } else {
          updatedBoard = [{ type: 'marker', markerId: newMarker.id }, ...boardItems]
        }
      } else if (appendToEnd) {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
      } else {
        updatedBoard = [{ type: 'marker', markerId: newMarker.id }, ...boardItems]
      }

      onSave({
        ...data,
        markers: updatedMarkers,
        board: updatedBoard,
        meta: { ...data.meta, updatedAt: new Date().toISOString() }
      })
      return
    }
    
    // Fallback case - existing category without object
    const newMarker = {
      id: generateId(),
      categoryId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const updatedMarkers = [...markers, newMarker]
    let updatedBoard
    
    // Insert at specific position if insertionId is provided
    if (insertionId !== null) {
      const insertIndex = boardItems.findIndex(item => {
        if (item.type === 'task') return item.taskId === insertionId
        if (item.type === 'marker') return item.markerId === insertionId
        return false
      })
      if (insertIndex >= 0) {
        updatedBoard = [
          ...boardItems.slice(0, insertIndex + 1),
          { type: 'marker', markerId: newMarker.id },
          ...boardItems.slice(insertIndex + 1)
        ]
      } else if (appendToEnd) {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
      } else {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
      }
    } else if (appendToEnd) {
      updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
    } else {
      updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
    }

    onSave({
      ...data,
      markers: updatedMarkers,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleDeleteMarker = useCallback((markerId) => {
    const updatedMarkers = markers.filter(m => m.id !== markerId)
    const updatedBoard = boardItems.filter(item => 
      !(item.type === 'marker' && item.markerId === markerId)
    )

    onSave({
      ...data,
      markers: updatedMarkers,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [markers, boardItems, data, onSave])


  // Render board rows with insertion points
  const renderBoardRows = () => {
    const rows = []
    
    // Add insertion point at the top
    rows.push(
      <InsertionPoint 
        key="insert-top" 
        id="insert-top" 
        onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, null)} 
      />
    )
    
    boardItems.forEach((item, index) => {
      if (item.type === 'task') {
        const task = tasks.find(t => t.id === item.taskId)
        if (!task || task.completion) return

        const taskIndex = boardItems.indexOf(item)
        const category = getTaskCategory(taskIndex, boardItems, markers, categories)

        rows.push(
          <BoardRow
            key={item.taskId}
            id={item.taskId}
            task={task}
            category={category}
            isEditing={editingTask === task.id}
            onEdit={() => setEditingTask(task.id)}
            onUpdate={(text) => {
              handleUpdateTask(task.id, text)
              setEditingTask(null)
            }}
            onCancelEdit={() => setEditingTask(null)}
            onDelete={() => handleDeleteTask(task.id)}
            onComplete={() => handleCompleteClick(task)}
            onConfirmDelete={(t) => setDeleteTask(t)}
            onMoveUp={() => handleMoveItem(item.taskId, 'up')}
            onMoveDown={() => handleMoveItem(item.taskId, 'down')}
          />
        )
        
        // Add insertion point after this task
        rows.push(
          <InsertionPoint 
            key={`insert-${item.taskId}`} 
            id={item.taskId} 
            onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, item.taskId)} 
          />
        )
      } else if (item.type === 'marker') {
        const marker = markers.find(m => m.id === item.markerId)
        if (!marker) return

        const category = categories.find(c => c.id === marker.categoryId)
        if (!category) return

        rows.push(
          <BoardRow
            key={item.markerId}
            id={item.markerId}
            marker={marker}
            category={category}
            onDelete={() => handleDeleteMarker(item.markerId)}
            onMoveUp={() => handleMoveItem(item.markerId, 'up')}
            onMoveDown={() => handleMoveItem(item.markerId, 'down')}
          />
        )
        
        // Add insertion point after this marker
        rows.push(
          <InsertionPoint 
            key={`insert-${item.markerId}`} 
            id={item.markerId} 
            onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, item.markerId)} 
          />
        )
      }
    })
    
    return rows
  }

  return (
    <div className="board-container">
      <div className="board-content-wrapper">
        <div className="board-main">
          <div className="board-header">
            <h2>Board</h2>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={boardItems.map(i => i.type === 'task' ? i.taskId : i.markerId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="board-list">
                {/* New task input at the TOP */}
                <div className="new-task-row">
                  <input
                    type="text"
                    className="new-task-input"
                    placeholder="Type a task and press Enter..."
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                </div>
                
                {renderBoardRows()}
                
                {tasks.length === 0 && boardItems.length === 0 && (
                  <div className="board-empty-state">
                    <h3>No tasks yet</h3>
                    <p>Type above to add your first task and start tracking your performance!</p>
                  </div>
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {draggingItem ? (
                <div className="drag-overlay">
                  {draggingItem.data.current?.type === 'task' 
                    ? tasks.find(t => t.id === draggingItem.id)?.text
                    : 'Category Marker'
                  }
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        
        <div className="board-sidebar">
          <CategorySidebar 
            categories={categories}
            onCreateCategory={(updatedCategories) => onSave({ ...data, categories: updatedCategories, meta: { ...data.meta, updatedAt: new Date().toISOString() } })}
            onAddMarker={handleAddMarker}
          />
        </div>
      </div>

      {completionTask && (
        <CompletionPopup
          task={completionTask}
          difficulties={difficulties}
          onConfirm={handleCompletionConfirm}
          onCancel={() => setCompletionTask(null)}
        />
      )}

      {deleteTask && (
        <div className="popup-overlay" onClick={() => setDeleteTask(null)}>
          <div className="completion-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="popup-header">
              <h3>Delete task?</h3>
              <button 
                className="close-btn"
                onClick={() => setDeleteTask(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="popup-content">
              <p className="task-text">{deleteTask.text}</p>
              <p className="warning-text">This cannot be undone.</p>
            </div>
            <div className="popup-actions">
              <button 
                className="cancel-btn"
                onClick={() => setDeleteTask(null)}
              >
                Cancel
              </button>
              <button 
                className="delete-btn confirm-delete"
                onClick={() => {
                  handleDeleteTask(deleteTask.id)
                  setDeleteTask(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Board
