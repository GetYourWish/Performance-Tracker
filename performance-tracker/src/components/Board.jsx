import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import CompletionPopup from './CompletionPopup'
import BoardRow from './BoardRow'
import { generateId, getCurrentDate, getTaskCategory } from '../utils/helpers'

// Draggable and droppable category chip for sidebar with inline editing
function DraggableCategoryChip({ category, onUpdateCategory, index }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `sidebar-category-${category.id}`,
    data: {
      type: 'sidebar-category',
      categoryId: category.id,
      category
    }
  })
  
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `sidebar-drop-${category.id}`,
    data: {
      type: 'sidebar-category-drop',
      categoryId: category.id,
      index
    }
  })
  
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
  } : undefined
  
  const handleSave = () => {
    if (editName.trim()) {
      onUpdateCategory({ ...category, name: editName.trim() })
    } else {
      setEditName(category.name)
    }
    setIsEditing(false)
  }
  
  const handleColorChange = (newColor) => {
    onUpdateCategory({ ...category, color: newColor })
    setShowColorPicker(false)
  }
  
  const handleDeactivate = () => {
    onUpdateCategory({ ...category, active: false })
  }
  
  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDroppableRef(node)
      }}
      className={`category-chip ${isOver ? 'drop-over' : ''} ${!category.active ? 'inactive' : ''}`}
      style={{ 
        backgroundColor: category.color,
        opacity: category.active ? 0.8 : 0.5,
        textDecoration: category.active ? 'none' : 'line-through',
        ...style
      }}
      {...listeners}
      {...attributes}
    >
      {isEditing ? (
        <>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') {
                setEditName(category.name)
                setIsEditing(false)
              }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            className="category-edit-input"
          />
          <button 
            className="category-color-btn"
            onClick={(e) => {
              e.stopPropagation()
              setShowColorPicker(!showColorPicker)
            }}
          >
            🎨
          </button>
          <button 
            className="category-delete-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleDeactivate()
            }}
          >
            ✕
          </button>
          {showColorPicker && (
            <div 
              className="color-picker-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="color"
                value={category.color}
                onChange={(e) => handleColorChange(e.target.value)}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <span onClick={() => setIsEditing(true)}>{category.name}</span>
          <div className="chip-actions">
            <button 
              className="category-color-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowColorPicker(!showColorPicker)
              }}
            >
              🎨
            </button>
            <button 
              className="category-delete-btn"
              onClick={(e) => {
                e.stopPropagation()
                handleDeactivate()
              }}
            >
              ✕
            </button>
            {showColorPicker && (
              <div 
                className="color-picker-dropdown"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => handleColorChange(e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}
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

// Sidebar component for categories - collapsible per spec with DndContext for reordering
function CategorySidebar({ categories, onCreateCategory, onUpdateCategory, onReorderCategories }) {
  const [isCreating, setIsCreating] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#60a5fa')
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return

    const newCategory = {
      id: generateId(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
      order: categories.length,
      active: true
    }

    onCreateCategory(newCategory)

    setNewCategoryName('')
    setIsCreating(false)
  }
  
  const handleDragEnd = (event) => {
    const { active, over } = event
    
    if (!over || !onReorderCategories) return
    
    const activeData = active.data.current
    const overData = over.data.current
    
    if (activeData?.type !== 'sidebar-category' || overData?.type !== 'sidebar-category-drop') return
    
    const fromIndex = activeData.index
    const toIndex = overData.index
    
    if (fromIndex === toIndex) return
    
    // Reorder categories array
    const newCategories = [...categories]
    const [removed] = newCategories.splice(fromIndex, 1)
    newCategories.splice(toIndex, 0, removed)
    
    // Update order field for all categories
    const updatedCategories = newCategories.map((cat, idx) => ({
      ...cat,
      order: idx
    }))
    
    onReorderCategories(updatedCategories)
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
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
        <p className="drag-hint">Drag a category to the board to add a marker</p>
        
        <div className="categories-list">
          {categories.filter(c => c.active !== false).map((category, index) => (
            <DraggableCategoryChip
              key={category.id}
              category={category}
              onUpdateCategory={onUpdateCategory}
              index={index}
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
    </DndContext>
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
    const updatedBoard = [...boardItems, { type: 'task', taskId: newTask.id }]

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

  const handleCompleteClick = useCallback((task) => {
    setCompletionTask(task)
  }, [])

  const handleCompletionConfirm = useCallback((completionData) => {
    // Since state is derived from props, we directly compute updated data
    const taskIndex = boardItems.findIndex(item => item.type === 'task' && item.taskId === completionData.taskId)
    const category = getTaskCategory(taskIndex, boardItems, markers, categories)
    
    const updatedTasks = data.tasks.map(t => {
      if (t.id === completionData.taskId) {
        return {
          ...t,
          completion: {
            completedDate: completionData.date,
            completedAt: new Date().toISOString(),
            difficultyId: completionData.difficultyId,
            categoryId: category ? category.id : null,
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

  const handleDragEnd = (event) => {
    const { active, over } = event
    setDraggingItem(null)

    // Handle sidebar category being dropped
    if (active.data.current?.type === 'sidebar-category') {
      const category = active.data.current.category
      const categoryId = active.data.current.categoryId
      
      // If dropped on an insertion point, insert at that position
      if (over && over.data.current?.type === 'insertion-point' && over.id) {
        let insertionId = null
        if (over.id === 'insert-top') {
          insertionId = null // Insert at top
        } else {
          insertionId = over.id // Insert after this item
        }
        
        handleMarkerDrop(categoryId, false, insertionId, category)
      } else {
        // Dropped outside any insertion point - append to end of board
        handleMarkerDrop(categoryId, false, null, category, true) // true = appendToEnd
      }
      return
    }

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
                {renderBoardRows()}
                
                {tasks.length === 0 && boardItems.length === 0 && (
                  <div className="board-empty-state">
                    <h3>No tasks yet</h3>
                    <p>Type below to add your first task and start tracking your performance!</p>
                  </div>
                )}
                
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
              </div>
            </SortableContext>

            <DragOverlay>
              {draggingItem ? (
                <div className="drag-overlay">
                  {draggingItem.data.current?.type === 'task' 
                    ? tasks.find(t => t.id === draggingItem.id)?.text
                    : draggingItem.data.current?.type === 'sidebar-category'
                      ? draggingItem.data.current.category?.name
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
            onCreateCategory={(newCategory) => onSave({ ...data, categories: [...categories, newCategory], meta: { ...data.meta, updatedAt: new Date().toISOString() } })}
            onUpdateCategory={(updatedCategory) => {
              const updatedCategories = categories.map(c => 
                c.id === updatedCategory.id ? updatedCategory : c
              )
              onSave({ ...data, categories: updatedCategories, meta: { ...data.meta, updatedAt: new Date().toISOString() } })
            }}
            onReorderCategories={(reorderedCategories) => {
              onSave({ ...data, categories: reorderedCategories, meta: { ...data.meta, updatedAt: new Date().toISOString() } })
            }}
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
    </div>
  )
}

export default Board
