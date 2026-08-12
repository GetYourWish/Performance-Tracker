import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import CompletionPopup from './CompletionPopup'
import CategoryGrabber from './CategoryGrabber'
import BoardRow from './BoardRow'
import { generateId, getCurrentDate, getTaskCategory } from '../utils/helpers'

function Board({ data, onSave }) {
  const [tasks, setTasks] = useState(data?.tasks?.filter(t => !t.completion) || [])
  const [boardItems, setBoardItems] = useState(data?.board || [])
  const [markers, setMarkers] = useState(data?.markers || [])
  const [categories, setCategories] = useState(data?.categories || [])
  const [difficulties] = useState(data?.difficulties || [])
  const [editingTask, setEditingTask] = useState(null)
  const [newTaskText, setNewTaskText] = useState('')
  const [completionTask, setCompletionTask] = useState(null)
  const [showCategoryGrabber, setShowCategoryGrabber] = useState(false)
  const [draggingItem, setDraggingItem] = useState(null)

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

    setTasks(updatedTasks)
    setBoardItems(updatedBoard)
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
    }
  }

  const handleUpdateTask = useCallback((taskId, newText) => {
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, text: newText, updatedAt: new Date().toISOString() }
      }
      return t
    })

    setTasks(updatedTasks)

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

    setTasks(updatedTasks)
    setBoardItems(updatedBoard)

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
    const updatedTasks = tasks.map(t => {
      if (t.id === completionData.taskId) {
        // Get category at time of completion
        const taskIndex = boardItems.findIndex(item => item.type === 'task' && item.taskId === t.id)
        const category = getTaskCategory(taskIndex, boardItems, markers, categories)
        
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

    setTasks(updatedTasks)
    setBoardItems(updatedBoard)

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })

    setCompletionTask(null)
  }, [tasks, boardItems, markers, categories, data, onSave])

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

    setBoardItems(newBoard)

    onSave({
      ...data,
      board: newBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }

  const handleMarkerDrop = (categoryId) => {
    const newMarker = {
      id: generateId(),
      categoryId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const updatedMarkers = [...markers, newMarker]
    const updatedBoard = [...boardItems, { type: 'marker', markerId: newMarker.id }]

    setMarkers(updatedMarkers)
    setBoardItems(updatedBoard)

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

    setMarkers(updatedMarkers)
    setBoardItems(updatedBoard)

    onSave({
      ...data,
      markers: updatedMarkers,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [markers, boardItems, data, onSave])

  // Render board rows in order
  const renderBoardRows = () => {
    return boardItems.map((item) => {
      if (item.type === 'task') {
        const task = tasks.find(t => t.id === item.taskId)
        if (!task || task.completion) return null

        const taskIndex = boardItems.indexOf(item)
        const category = getTaskCategory(taskIndex, boardItems, markers, categories)

        return (
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
      }

      if (item.type === 'marker') {
        const marker = markers.find(m => m.id === item.markerId)
        if (!marker) return null

        const category = categories.find(c => c.id === marker.categoryId)
        if (!category) return null

        return (
          <BoardRow
            key={item.markerId}
            id={item.markerId}
            marker={marker}
            category={category}
            onDelete={() => handleDeleteMarker(item.markerId)}
          />
        )
      }

      return null
    })
  }

  return (
    <div className="board-container">
      <div className="board-header">
        <h2>Board</h2>
        <button 
          className="categories-toggle"
          onClick={() => setShowCategoryGrabber(!showCategoryGrabber)}
        >
          {showCategoryGrabber ? 'Hide Categories' : 'Show Categories'}
        </button>
      </div>

      <div className="board-content">
        {showCategoryGrabber && (
          <CategoryGrabber 
            categories={categories}
            onDrop={handleMarkerDrop}
          />
        )}

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
