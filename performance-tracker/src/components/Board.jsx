import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  DndContext,
  closestCorners,
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
import { AnimatePresence } from 'framer-motion'
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
function InsertionPoint({ id, onDrop, active }) {
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
      className={`insertion-point ${isOver || active ? 'is-over' : ''} ${active ? 'is-active' : ''}`}
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
  const [selectedItems, setSelectedItems] = useState([])
  const [activeInsertionPoint, setActiveInsertionPoint] = useState(null)
  const [workingOnId, setWorkingOnId] = useState(null)
  
  // Derived memoized array for working on tasks (persisted in data.workingOn)
  const workingOnTasks = useMemo(() => data?.workingOn || [], [data?.workingOn])
  
  // Apply theme from settings and persist resolved value
  useEffect(() => {
    const theme = settings.theme || 'system'
    const root = document.documentElement
    let resolvedTheme = theme
    
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      // System theme
      root.removeAttribute('data-theme')
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.setAttribute('data-theme', 'dark')
        resolvedTheme = 'dark'
      } else {
        resolvedTheme = 'light'
      }
    }
    
    // Persist resolved theme to localStorage for instant bootstrap on reload
    localStorage.setItem('pt-theme', resolvedTheme)
    
    // Store multi-select modifier for BoardRow to access
    window.__multiSelectModifier = settings.multiSelectModifier || 'ctrl'
  }, [settings.theme, settings.multiSelectModifier])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
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

    const updatedTasks = [...data.tasks, newTask]
    const updatedBoard = [{ type: 'task', taskId: newTask.id }, ...boardItems]

    setNewTaskText('')

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [newTaskText, data.tasks, boardItems, data, onSave])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreateTask()
    } else if (e.key === 'Escape') {
      // Cancel new task input and clear selection
      setNewTaskText('')
      handleClearSelection()
    }
  }

  // Handle Escape key for clearing selection at document level
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClearSelection()
      }
    }
    
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const handleUpdateTask = useCallback((taskId, newText) => {
    const updatedTasks = data.tasks.map(t => {
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
  }, [data, onSave])

  const handleDeleteTask = useCallback((taskId) => {
    const updatedTasks = data.tasks.filter(t => t.id !== taskId)
    const updatedBoard = boardItems.filter(item => 
      !(item.type === 'task' && item.taskId === taskId)
    )
    // Remove from workingOn if present
    const updatedWorkingOn = (data.workingOn || []).filter(id => id !== taskId)

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      workingOn: updatedWorkingOn,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [data.tasks, boardItems, data.workingOn, data, onSave])

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
    
    // Remove from workingOn if present
    const updatedWorkingOn = (data.workingOn || []).filter(id => id !== completionData.taskId)

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      workingOn: updatedWorkingOn,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })

    setCompletionTask(null)
  }, [boardItems, markers, categories, data.workingOn, data, onSave])

  const handleToggleWorkingOn = useCallback((itemId) => {
    const currentWorkingOn = data.workingOn || []
    let newWorkingOn
    if (currentWorkingOn.includes(itemId)) {
      newWorkingOn = currentWorkingOn.filter(id => id !== itemId)
    } else {
      newWorkingOn = [...currentWorkingOn, itemId]
    }
    
    onSave({
      ...data,
      workingOn: newWorkingOn,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })
  }, [data, onSave])

  const handleSelectItem = useCallback((itemId, modifierKey) => {
    // Determine which modifier is configured in settings
    const multiSelectModifier = settings.multiSelectModifier || 'ctrl'
    
    // Check if the correct modifier key is pressed based on settings
    let isMultiSelect = false
    if (multiSelectModifier === 'ctrl') {
      isMultiSelect = modifierKey.ctrl || modifierKey.meta
    } else if (multiSelectModifier === 'shift') {
      isMultiSelect = modifierKey.shift
    } else if (multiSelectModifier === 'alt') {
      isMultiSelect = modifierKey.alt
    }
    
    setSelectedItems(prev => {
      if (isMultiSelect) {
        // Toggle selection with modifier click
        if (prev.includes(itemId)) {
          return prev.filter(id => id !== itemId)
        } else {
          return [...prev, itemId]
        }
      } else {
        // Single click - select only this item
        return [itemId]
      }
    })
  }, [settings.multiSelectModifier])

  const handleClearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  const handleDragStart = (event) => {
    setDraggingItem(event.active)
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) {
      setActiveInsertionPoint(null)
      return
    }
    
    // If over is an insertion point, use it directly
    if (over.data.current?.type === 'insertion-point') {
      setActiveInsertionPoint(over.id)
      return
    }
    
    // If over is a row, determine which gap to show based on pointer position
    const draggedIndex = boardItems.findIndex(item => {
      if (active.data.current?.type === 'task') {
        return item.type === 'task' && item.taskId === active.id
      }
      if (active.data.current?.type === 'marker') {
        return item.type === 'marker' && item.markerId === active.id
      }
      return false
    })
    
    if (draggedIndex === -1) {
      setActiveInsertionPoint(null)
      return
    }
    
    const overIndex = boardItems.findIndex(item => {
      if (over.data.current?.type === 'task') {
        return item.type === 'task' && item.taskId === over.id
      }
      if (over.data.current?.type === 'marker') {
        return item.type === 'marker' && item.markerId === over.id
      }
      return false
    })
    
    if (overIndex === -1) {
      setActiveInsertionPoint(null)
      return
    }
    
    // Determine if we should show the gap above or below the over item
    // Compare dragged item's translated rect with over item's midpoint
    const activeRect = active.rect.current.translated
    const overRect = over.rect
    
    if (activeRect && overRect) {
      const activeBottom = activeRect.top + activeRect.height
      const overMidpoint = overRect.top + overRect.height / 2
      
      if (activeBottom < overMidpoint) {
        // Show gap above the over item
        if (overIndex === 0) {
          setActiveInsertionPoint('insert-top')
        } else {
          const prevItem = boardItems[overIndex - 1]
          setActiveInsertionPoint(prevItem.type === 'task' ? prevItem.taskId : prevItem.markerId)
        }
      } else {
        // Show gap below the over item
        const overItem = boardItems[overIndex]
        setActiveInsertionPoint(overItem.type === 'task' ? overItem.taskId : overItem.markerId)
      }
    } else {
      setActiveInsertionPoint(null)
    }
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

  const handleRandomizeTask = useCallback(() => {
    const availableTaskIds = boardItems
      .map(item => item.type === 'task' ? item.taskId : null)
      .filter(id => id !== null)
      .filter(id => tasks.some(t => t.id === id && !t.completion));

    if (availableTaskIds.length === 0) return;

    let randomId;
    if (availableTaskIds.length === 1) {
      randomId = availableTaskIds[0];
    } else {
      const candidates = availableTaskIds.filter(id => id !== workingOnId);
      randomId = candidates[Math.floor(Math.random() * candidates.length)];
    }

    setWorkingOnId(randomId);

    setTimeout(() => {
      const rowElement = document.querySelector(`.board-row[aria-label*="${tasks.find(t => t.id === randomId)?.text}"]`);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowElement.classList.add('random-flash');
        setTimeout(() => rowElement.classList.remove('random-flash'), 1000);
      }
    }, 100);
  }, [boardItems, tasks, workingOnId]);

  const handleAddTaskBelowMarker = useCallback((markerId) => {
    const newTask = {
      id: generateId(),
      text: '', // Empty string so it enters edit mode
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completion: null
    }

    const insertIndex = boardItems.findIndex(item => item.type === 'marker' && item.markerId === markerId)
    if (insertIndex === -1) return

    const updatedBoard = [
      ...boardItems.slice(0, insertIndex + 1),
      { type: 'task', taskId: newTask.id },
      ...boardItems.slice(insertIndex + 1)
    ]

    onSave({
      ...data,
      tasks: [...data.tasks, newTask],
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: new Date().toISOString() }
    })

    // Enter edit mode immediately so the user can start typing
    setEditingTask(newTask.id)
  }, [boardItems, data, onSave])

  const handleDragEnd = (event) => {
    const { active, over } = event
    setDraggingItem(null)
    setActiveInsertionPoint(null)

    // Handle reordering of tasks and markers within the board with proper gap-drop support
    if (!over) return
    if (active.id === over.id) return

    // Check if we're dragging multiple selected items
    const isDraggingSelected = selectedItems.includes(active.id)
    const itemsToMove = isDraggingSelected ? selectedItems : [active.id]

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

    // Splice out the dragged items
    const newBoard = [...boardItems]
    
    if (isDraggingSelected && selectedItems.length > 1) {
      // Multi-select drag: move all selected items together
      // First, collect all selected items in their original order
      const selectedBoardItems = []
      const remainingBoardItems = []
      
      newBoard.forEach(item => {
        const itemId = item.type === 'task' ? item.taskId : item.markerId
        if (selectedItems.includes(itemId)) {
          selectedBoardItems.push(item)
        } else {
          remainingBoardItems.push(item)
        }
      })
      
      // Adjust target index: count how many selected items were BEFORE the target
      // This ensures correct insertion after removing selected items
      let adjustedTargetIndex = targetIndex
      const selectedBeforeTarget = remainingBoardItems.slice(0, targetIndex).filter((item, idx) => {
        const itemId = item.type === 'task' ? item.taskId : item.markerId
        // We need to check against original positions
        return false // We'll recalculate below
      }).length
      
      // Count selected items that were originally before targetIndex
      let selectedCountBeforeTarget = 0
      for (let i = 0; i < targetIndex && i < boardItems.length; i++) {
        const item = boardItems[i]
        const itemId = item.type === 'task' ? item.taskId : item.markerId
        if (selectedItems.includes(itemId)) {
          selectedCountBeforeTarget++
        }
      }
      
      // Adjust target index by subtracting selected items that were removed before it
      adjustedTargetIndex = targetIndex - selectedCountBeforeTarget
      adjustedTargetIndex = Math.max(0, Math.min(adjustedTargetIndex, remainingBoardItems.length))
      
      remainingBoardItems.splice(adjustedTargetIndex, 0, ...selectedBoardItems)
      
      onSave({
        ...data,
        board: remainingBoardItems,
        meta: { ...data.meta, updatedAt: new Date().toISOString() }
      })
      // Keep selection active after group drag - don't clear it
    } else {
      // Single item drag (original behavior)
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
      
      // Clear selection after single-item drag
      setSelectedItems([])
    }
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
            isSelected={selectedItems.includes(item.taskId)}
            onSelect={handleSelectItem}
            isWorkingOn={workingOnTasks.includes(item.taskId)}
            onToggleWorkingOn={handleToggleWorkingOn}
            selectionSize={selectedItems.length}
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
            isSelected={selectedItems.includes(item.markerId)}
            onSelect={handleSelectItem}
            selectionSize={selectedItems.length}
            onAddTaskBelow={() => handleAddTaskBelowMarker(item.markerId)}
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
      <div className="board-header">
        <h2>Board</h2>
        <input
          type="text"
          className="new-task-input header-input"
          placeholder="Type a task and press Enter..."
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
      <div 
        className="board-content-wrapper"
        onClick={(e) => {
          // Clear selection when clicking on empty board area
          if (e.target === e.currentTarget) {
            handleClearSelection()
          }
        }}
      >
        <div className="board-main">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={boardItems.map(i => i.type === 'task' ? i.taskId : i.markerId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="board-list">
                <AnimatePresence mode="popLayout">
                  {renderBoardRows()}
                </AnimatePresence>
                
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
                  {selectedItems.length > 1 
                    ? `Dragging ${selectedItems.length} items`
                    : draggingItem.data.current?.type === 'task' 
                      ? tasks.find(t => t.id === draggingItem.id)?.text
                      : 'Category Marker'
                  }
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        
        <div className="board-right-panel">
          <button
            type="button"
            className="randomizer-btn"
            onClick={handleRandomizeTask}
            title="Pick a random task to work on"
          >
            🎲 Randomizer
          </button>
          <div className="board-sidebar">
            <CategorySidebar 
              categories={categories}
              onCreateCategory={(updatedCategories) => onSave({ ...data, categories: updatedCategories, meta: { ...data.meta, updatedAt: new Date().toISOString() } })}
              onAddMarker={handleAddMarker}
            />
          </div>
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
