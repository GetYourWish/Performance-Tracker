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

// Insertion point component for precise drop locations
function InsertionPoint({ id, onDrop }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  
  return (
    <div
      ref={setNodeRef}
      className={`insertion-point ${isOver ? 'is-over' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const categoryId = e.dataTransfer.getData('categoryId')
        const type = e.dataTransfer.getData('type')
        if (categoryId && type === 'existing-category') {
          onDrop(categoryId, false, id)
        }
      }}
    />
  )
}

// Sidebar component for categories
function CategorySidebar({ categories, onDrop }) {
  const [isCreating, setIsCreating] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#60a5fa')
  
  const handleDragStart = (e, categoryId) => {
    e.dataTransfer.setData('categoryId', categoryId)
    e.dataTransfer.setData('type', 'existing-category')
  }
  
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return

    const newCategory = {
      id: generateId(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
      order: categories.length,
      active: true
    }

    onDrop(newCategory, true)

    setNewCategoryName('')
    setIsCreating(false)
  }
  
  return (
    <div className="category-grabber">
      <h4>Categories</h4>
      <p className="drag-hint">Drag a category to the board to add a marker</p>
      
      <div className="categories-list">
        {categories.map(category => (
          <div
            key={category.id}
            className="category-chip"
            draggable
            onDragStart={(e) => handleDragStart(e, category.id)}
            style={{ 
              backgroundColor: category.color,
              opacity: 0.8
            }}
          >
            {category.name}
          </div>
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

    if (!over || active.id === over.id) return

    const oldIndex = boardItems.findIndex(item => {
      if (active.data.current?.type === 'task') {
        return item.type === 'task' && item.taskId === active.id
      }
      if (active.data.current?.type === 'marker') {
        return item.type === 'marker' && item.markerId === active.id
      }
      return false
    })

    const newIndex = boardItems.findIndex(item => {
      if (over.data.current?.type === 'task') {
        return item.type === 'task' && item.taskId === over.id
      }
      if (over.data.current?.type === 'marker') {
        return item.type === 'marker' && item.markerId === over.id
      }
      return false
    })

    if (oldIndex === -1 || newIndex === -1) return

    const newBoard = [...boardItems]
    const [removed] = newBoard.splice(oldIndex, 1)
    newBoard.splice(newIndex, 0, removed)

    onSave({
      ...data,
      board: newBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleMarkerDrop = (categoryId, isNewCategory = false, insertionId = null) => {
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
            ...boardItems.slice(0, insertIndex),
            { type: 'marker', markerId: newMarker.id },
            ...boardItems.slice(insertIndex)
          ]
        } else {
          updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
        }
      } else {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
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
    
    // Normal case - existing category
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
          ...boardItems.slice(0, insertIndex),
          { type: 'marker', markerId: newMarker.id },
          ...boardItems.slice(insertIndex)
        ]
      } else {
        updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]
      }
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
            onDrop={handleMarkerDrop}
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
