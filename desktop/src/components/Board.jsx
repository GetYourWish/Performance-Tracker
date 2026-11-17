import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCorners,
  rectIntersection,
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
import {
  generateId,
  getCurrentDate,
  getTaskCategory,
  calculateTaskScoreBreakdown,
  createThreadContinuation,
  hasThreadSuffix
} from '@performance-tracker/core'

// Simple category chip with + button to add marker
function CategoryChip({ category, onAddMarker, onNavigateToMarker }) {
  return (
    <div 
      className="category-chip" 
      style={{ backgroundColor: category.color }}
      onClick={onNavigateToMarker}
      title="Click to navigate to this category on the board"
    >
      <span className="category-chip-name">{category.name}</span>
      <button
        className="chip-add-marker-btn"
        title="Add marker to board"
        aria-label={`Add ${category.name} marker to the board`}
        onClick={(e) => {
          e.stopPropagation() // Prevent triggering the chip click
          onAddMarker()
        }}
      >
        +
      </button>
    </div>
  )
}

// Drop indicator overlay component - appears as a glowing blue line without affecting layout
function DropIndicator({ activeId }) {
  const [position, setPosition] = useState({ top: 0, width: 0 })
  
  useEffect(() => {
    // Calculate position based on the active insertion point ID
    const isInsertTop = activeId === 'insert-top'
    
    // Find the element to position relative to
    let targetElement
    if (isInsertTop) {
      targetElement = document.querySelector('.board-list')
    } else {
      targetElement = document.querySelector(`[data-board-item-id="${activeId}"]`)
    }
    
    if (!targetElement) return
    
    const containerRect = document.querySelector('.board-list')?.getBoundingClientRect()
    if (!containerRect) return
    
    let topPosition
    if (isInsertTop) {
      topPosition = 0
    } else {
      const rect = targetElement.getBoundingClientRect()
      topPosition = rect.bottom - containerRect.top + 2
    }
    
    setPosition({
      top: topPosition,
      width: containerRect.width
    })
  }, [activeId])
  
  return (
    <div 
      className="drop-indicator-overlay"
      style={{
        top: `${position.top}px`,
        width: `${position.width}px`
      }}
    >
      <div className="drop-indicator-line" />
    </div>
  )
}

// Insertion point component for precise drop locations
function InsertionPoint({ id, forceActive, onDrop, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ 
    id,
    data: {
      type: 'insertion-point',
      insertionId: id
    }
  })
  
  // Show as active when droppable is over OR when forceActive is true (for drop indicator)
  const isActive = isOver || forceActive
  
  return (
    <div
      ref={setNodeRef}
      className={`insertion-point ${isActive ? 'is-over' : ''} ${className}`}
      data-insertion-id={id}
      style={{
        // Ensure insertion points are always rendered and have height
        minHeight: '8px',
        display: 'block',
        // Make sure pointer events work for drop detection
        pointerEvents: 'auto'
      }}
    />
  )
}

// Sidebar component for categories - simple list with + button on chips.
// v1.3.0 (user follow-up 2026-11-18): categories stack VERTICALLY, one
// chip per row, inside a scrollable card (.categories-scroll) — with many
// categories the list scrolls instead of needing a taller window. The
// collapse toggle lives in the nav row at the TOP of this area and slides
// the WHOLE panel to the side (see board-right-panel below).
function CategorySidebar({ categories, onCreateCategory, onAddMarker, onNavigateToCategory }) {
  const [isCreating, setIsCreating] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#60a5fa')
  // v1.1.0 info bubble (user request: the hint text below the Categories
  // header must disappear and come up from an info bubble instead)
  const [showInfo, setShowInfo] = useState(false)
  
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
  
  return (
    <div className="category-grabber">
      <div className="category-grabber-header">
        <h4>Categories</h4>
        <button
          className="sidebar-info-btn"
          onClick={() => setShowInfo(v => !v)}
          aria-label={showInfo ? 'Hide categories info' : 'Show categories info'}
          aria-expanded={showInfo}
          title="How categories work"
        >
          i
        </button>
      </div>
      {showInfo && (
        <p className="drag-hint category-info-popover" role="status">
          Click + on a category to add a marker to the board
        </p>
      )}
      
      <div className="categories-list categories-scroll vertical">
        {[...categories].sort((a, b) => {
          const pa = a.priorityMultiplier ?? 1
          const pb = b.priorityMultiplier ?? 1
          if (pb !== pa) return pb - pa
          return (a.name || '').localeCompare(b.name || '')
        }).filter(c => c.active !== false).map((category) => (
          <CategoryChip
            key={category.id}
            category={category}
            onAddMarker={() => onAddMarker(category)}
            onNavigateToMarker={() => onNavigateToCategory(category)}
          />
        ))}
      </div>

      {/* v1.4.0: "+ Add Category" (and its inline form) live BELOW the
          scroll area — always reachable without scrolling to the bottom of
          a long category list */}
      <div className="categories-add">
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

function Board({ data, onSave, focusRequest, onFocusHandled }) {
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
  const [draggingItem, setDraggingItem] = useState(null)
  const [deleteTask, setDeleteTask] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [activeInsertionPoint, setActiveInsertionPoint] = useState(null)
  const [workingOnId, setWorkingOnId] = useState(null)
  const [dropIndicatorId, setDropIndicatorId] = useState(null)
  // v1.3.0 (user follow-up 2026-11-18): the toggle collapses the WHOLE right
  // panel to the side (a 48px strip stays for expanding + Randomizer), so
  // the board reclaims the panel width — the pre-v1.2.0 minimize-tray
  // behavior the user asked to bring back
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false)
  const dropIndicatorRef = useRef(null)
  const pointerYRef = useRef(0)
  const dragMoveListenerRef = useRef(null)
  const dragMoveRafRef = useRef(null)

  const setDropIndicator = (id) => {
    dropIndicatorRef.current = id
    setDropIndicatorId(id)
  }

  const cleanupDragListeners = () => {
    if (dragMoveListenerRef.current) {
      window.removeEventListener('pointermove', dragMoveListenerRef.current)
      dragMoveListenerRef.current = null
    }
  }
  
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
    
    // Apply consecutive marker margin CSS variable from settings
    const consecutiveMarkerMargin = settings.consecutiveMarkerMargin || '150px'
    root.style.setProperty('--consecutive-marker-margin', consecutiveMarkerMargin)
  }, [settings.theme, settings.multiSelectModifier, settings.consecutiveMarkerMargin])

  // dnd-kit sensors — hooks must be called unconditionally at the top level.
  // (Previously wrapped in useMemo(() => useSensors(...), []) which violated
  // the Rules of Hooks: on updates the memo factory was skipped, so the inner
  // useSensor hooks never ran and shifted every subsequent hook, crashing
  // areHookInputsEqual with "Cannot read properties of undefined (reading 'length')".)
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
    
    const completedAt = new Date().toISOString()
    
    // Build the completed task object to compute score breakdown
    const completedTask = {
      id: completionData.taskId,
      text: data.tasks.find(t => t.id === completionData.taskId)?.text || '',
      completion: {
        completedDate: completionData.date,
        completedAt,
        difficultyId: completionData.difficultyId,
        categoryId,
        note: completionData.note || ''
      }
    }

    // Compute score breakdown using all completed tasks (including this one)
    const allCompleted = [...data.tasks.filter(t => t.completion), completedTask]
    const breakdown = calculateTaskScoreBreakdown(
      completedTask,
      allCompleted,
      difficulties,
      settings.fatigueIncrement || 0.10,
      settings.fatigueCap || 3.0,
      categories
    )

    // Create log entry
    const logEntry = {
      id: generateId(),
      timestamp: completedAt,
      taskId: completionData.taskId,
      taskText: completedTask.text,
      difficultyLabel: breakdown.difficultyLabel,
      difficultyColor: breakdown.difficultyColor,
      categoryName: breakdown.categoryName,
      categoryColor: breakdown.categoryColor,
      priorityMultiplier: breakdown.priorityMultiplier,
      fatigueMultiplier: breakdown.fatigueMultiplier,
      basePoints: breakdown.basePoints,
      finalScore: breakdown.finalScore
    }

    const updatedTasks = data.tasks.map(t => {
      if (t.id === completionData.taskId) {
        return {
          ...t,
          completion: {
            completedDate: completionData.date,
            completedAt,
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

    // Cap logs at 500 entries
    const existingLogs = data.logs || []
    const updatedLogs = existingLogs.length >= 500
      ? [...existingLogs.slice(existingLogs.length - 499), logEntry]
      : [...existingLogs, logEntry]

    onSave({
      ...data,
      tasks: updatedTasks,
      board: updatedBoard,
      workingOn: updatedWorkingOn,
      logs: updatedLogs,
      meta: { ...data.meta, updatedAt: completedAt }
    })

    setCompletionTask(null)
  }, [boardItems, markers, categories, data.workingOn, data, onSave, difficulties, settings])

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

  const handleDragStart = useCallback((event) => {
    setDraggingItem(event.active)
    pointerYRef.current = event.activatorEvent?.clientY ?? 0
    const onMove = (e) => { pointerYRef.current = e.clientY }
    dragMoveListenerRef.current = onMove
    window.addEventListener('pointermove', onMove)
  }, [])

  const handleDragMove = useCallback((event) => {
    const { active, over } = event
    if (!over) { 
      setDropIndicator(null)
      return 
    }

    // Throttle to once per animation frame to avoid excessive re-renders
    if (dragMoveRafRef.current) return
    dragMoveRafRef.current = requestAnimationFrame(() => {
      dragMoveRafRef.current = null

      if (over.data.current?.type === 'insertion-point') {
        setDropIndicator(over.id)
        return
      }

      // over is a row: highlight the gap ABOVE or BELOW it based on pointer Y
      const idx = boardItems.findIndex(item => (item.type === 'task' ? item.taskId : item.markerId) === over.id)
      if (idx === -1) { 
        setDropIndicator(null)
        return 
      }

      const el = document.querySelector(`[data-board-item-id="${over.id}"]`)
      const rect = el?.getBoundingClientRect()
      const before = rect ? pointerYRef.current < rect.top + rect.height / 2 : false

      if (before) {
        if (idx === 0) {
          setDropIndicator('insert-top')
        } else {
          const prev = boardItems[idx - 1]
          const prevId = prev.type === 'task' ? prev.taskId : prev.markerId
          setDropIndicator(prevId)
        }
      } else {
        setDropIndicator(over.id)
      }
    })
  }, [boardItems])

  const handleAddMarker = useCallback((category) => {
    const now = new Date().toISOString()
    const newMarker = {
      id: generateId(),
      categoryId: category.id,
      createdAt: now,
      updatedAt: now
    }
    // v1.1.0: a new marker inherits the CATEGORY-level note so the note
    // "applies to all markers of the same category" without re-typing it
    // (user request 2026-11-17).
    if (typeof category.note === 'string' && category.note.trim() !== '') {
      newMarker.note = category.note
    }
    onSave({
      ...data,
      markers: [...markers, newMarker],
      board: [...boardItems, { type: 'marker', markerId: newMarker.id }],
      meta: { ...data.meta, updatedAt: now }
    })
  }, [data, markers, boardItems, onSave])

  const handleCreateCategory = useCallback((updatedCategories) => {
    onSave({ ...data, categories: updatedCategories, meta: { ...data.meta, updatedAt: new Date().toISOString() } })
  }, [data, onSave])

  const handleNavigateToCategory = useCallback((category) => {
    // Find the first marker of this category on the board
    const firstMarkerItem = boardItems.find(item => {
      if (item.type !== 'marker') return false
      const marker = markers.find(m => m.id === item.markerId)
      return marker && marker.categoryId === category.id
    })
    
    if (firstMarkerItem) {
      const marker = markers.find(m => m.id === firstMarkerItem.markerId)
      if (marker) {
        // Scroll to the marker element on the board
        setTimeout(() => {
          const markerElement = document.querySelector(`[data-board-item-id="${firstMarkerItem.markerId}"]`)
          if (markerElement) {
            markerElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            markerElement.classList.add('random-flash')
            setTimeout(() => markerElement.classList.remove('random-flash'), 1000)
          }
        }, 100)
      }
    }
  }, [boardItems, markers])

  const handleRandomizeTask = useCallback(() => {
    const availableTaskIds = boardItems
      .filter(item => item.type === 'task')
      .map(item => item.taskId)
      .filter(id => tasks.some(t => t.id === id))

    if (availableTaskIds.length === 0) return

    const currentWorkingOn = data.workingOn || []
    const candidates = availableTaskIds.filter(id => !currentWorkingOn.includes(id))
    const pool = candidates.length > 0 ? candidates : availableTaskIds
    const randomId = pool[Math.floor(Math.random() * pool.length)]

    if (!currentWorkingOn.includes(randomId)) {
      onSave({
        ...data,
        workingOn: [...currentWorkingOn, randomId],
        meta: { ...data.meta, updatedAt: new Date().toISOString() }
      })
    }

    setTimeout(() => {
      const rowElement = document.querySelector(`[data-board-item-id="${randomId}"]`)
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        rowElement.classList.add('random-flash')
        setTimeout(() => rowElement.classList.remove('random-flash'), 1000)
      }
    }, 100)
  }, [boardItems, tasks, data, onSave])

  // v1.4.0 — calendar "Go to Board" handoff: scroll the requested task's
  // row into view and flash it (the randomizer treatment), then consume the
  // request so it fires exactly once. Runs on mount too — Board MOUNTS when
  // App switches back to the board view, and the effect fires after the
  // rows have rendered, so no extra timeout is needed. A task whose row is
  // missing (data changed since the popup opened) is consumed silently.
  useEffect(() => {
    if (!focusRequest || !focusRequest.taskId) return
    const rowElement = document.querySelector(`[data-board-item-id="${focusRequest.taskId}"]`)
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      rowElement.classList.add('random-flash')
      setTimeout(() => rowElement.classList.remove('random-flash'), 1000)
    }
    if (typeof onFocusHandled === 'function') onFocusHandled()
  }, [focusRequest, onFocusHandled])

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
    const { active } = event
    const indicatorId = dropIndicatorRef.current
    if (dragMoveRafRef.current) {
      cancelAnimationFrame(dragMoveRafRef.current)
      dragMoveRafRef.current = null
    }
    setDraggingItem(null)
    setDropIndicator(null)
    cleanupDragListeners()

    if (!indicatorId) return

    const draggedIndex = boardItems.findIndex(item => (item.type === 'task' ? item.taskId : item.markerId) === active.id)
    if (draggedIndex === -1) return

    const isDraggingSelected = selectedItems.includes(active.id)

    if (isDraggingSelected && selectedItems.length > 1) {
      const selectedBoardItems = []
      const remainingBoardItems = []
      boardItems.forEach(item => {
        const itemId = item.type === 'task' ? item.taskId : item.markerId
        if (selectedItems.includes(itemId)) selectedBoardItems.push(item)
        else remainingBoardItems.push(item)
      })
      let insertIndex
      if (indicatorId === 'insert-top') insertIndex = 0
      else {
        const anchor = remainingBoardItems.findIndex(item => (item.type === 'task' ? item.taskId : item.markerId) === indicatorId)
        insertIndex = anchor === -1 ? remainingBoardItems.length : anchor + 1
      }
      remainingBoardItems.splice(insertIndex, 0, ...selectedBoardItems)
      onSave({ ...data, board: remainingBoardItems, meta: { ...data.meta, updatedAt: new Date().toISOString() } })
    } else {
      let targetIndex
      if (indicatorId === 'insert-top') targetIndex = 0
      else {
        const idx = boardItems.findIndex(item => (item.type === 'task' ? item.taskId : item.markerId) === indicatorId)
        if (idx === -1) return
        targetIndex = idx + 1
      }
      const newBoard = [...boardItems]
      const [removed] = newBoard.splice(draggedIndex, 1)
      const adjusted = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
      newBoard.splice(adjusted, 0, removed)
      onSave({ ...data, board: newBoard, meta: { ...data.meta, updatedAt: new Date().toISOString() } })
    }

    setSelectedItems([])
  }

  const handleDragCancel = useCallback(() => {
    if (dragMoveRafRef.current) {
      cancelAnimationFrame(dragMoveRafRef.current)
      dragMoveRafRef.current = null
    }
    setDraggingItem(null)
    setDropIndicator(null)
    cleanupDragListeners()
  }, [cleanupDragListeners])

  const handleMarkerDrop = useCallback((categoryId, isNewCategory = false, insertionId = null, categoryObj = null, appendToEnd = false) => {
    // v1.1.0 helper: marker factory that inherits the CATEGORY-level note
    // (user request: the category note applies to all markers of the same
    // category — new markers must not ask for it again).
    const buildMarker = (catId, catEntity) => {
      const now = new Date().toISOString()
      const marker = {
        id: generateId(),
        categoryId: catId,
        createdAt: now,
        updatedAt: now
      }
      const noteSource = catEntity || categories.find(c => c.id === catId)
      if (noteSource && typeof noteSource.note === 'string' && noteSource.note.trim() !== '') {
        marker.note = noteSource.note
      }
      return marker
    }

    // If this is a new category being created, we need to add it to categories first
    if (isNewCategory && typeof categoryId === 'object') {
      // categoryId is actually the new category object
      const newCategory = categoryId
      const updatedCategories = [...categories, newCategory]
      
      const newMarker = buildMarker(newCategory.id, newCategory)

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
      const newMarker = buildMarker(categoryId, categoryObj)

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
    const newMarker = buildMarker(categoryId)

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
  }, [data, markers, boardItems, categories, onSave])

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

  const handleUpdateMarkerNote = useCallback((markerId, note) => {
    const now = new Date().toISOString()
    const trimmed = note.trim()

    // v1.1.0 — the note applies to ALL markers of the same category (user
    // request 2026-11-17: "make the category note apply to all markers of the
    // same category wihtout me having to add it everytime"). The edited
    // marker's category is resolved, every marker of that category gets the
    // SAME note, and the category entity stores it as the source of truth so
    // FUTURE markers inherit it (see handleAddMarker / handleMarkerDrop).
    const editedMarker = markers.find(m => m.id === markerId)
    const targetCategoryId = editedMarker ? editedMarker.categoryId : null

    const updatedMarkers = markers.map(m => {
      if (m.id === markerId || (targetCategoryId && m.categoryId === targetCategoryId)) {
        return {
          ...m,
          note: trimmed,
          updatedAt: now
        }
      }
      return m
    })

    const nextData = {
      ...data,
      markers: updatedMarkers,
      meta: { ...data.meta, updatedAt: now }
    }

    // Store the note on the category too — future markers copy it.
    if (targetCategoryId) {
      nextData.categories = categories.map(c =>
        c.id === targetCategoryId ? { ...c, note: trimmed } : c
      )
    }

    onSave(nextData)
  }, [markers, categories, data, onSave])

  // v1.1.0 — "threads": create a continuation task for work that spans more
  // than one day. Same base text plus a " #N" suffix (core
  // createThreadContinuation; N continues the thread even across completed
  // members), inserted DIRECTLY BELOW the source task, linked via
  // task.threadOf (user request 2026-11-17).
  const handleCreateThreadTask = useCallback((taskId) => {
    const allTasks = data.tasks || []
    const sourceTask = allTasks.find(t => t.id === taskId)
    if (!sourceTask) return

    const now = new Date().toISOString()
    const newTask = createThreadContinuation({
      sourceTask,
      tasks: allTasks,
      now,
      generateId
    })

    const sourceIndex = boardItems.findIndex(
      item => item.type === 'task' && item.taskId === taskId
    )
    const insertIndex = sourceIndex === -1 ? boardItems.length : sourceIndex + 1
    const updatedBoard = [
      ...boardItems.slice(0, insertIndex),
      { type: 'task', taskId: newTask.id },
      ...boardItems.slice(insertIndex)
    ]

    onSave({
      ...data,
      tasks: [...allTasks, newTask],
      board: updatedBoard,
      meta: { ...data.meta, updatedAt: now }
    })
  }, [data, boardItems, onSave])

  // v1.1.0 — DEADLINES: set or clear a task's deadline ('YYYY-MM-DD'; empty
  // string removes the field entirely). Presentation only — scoring is
  // untouched (user request 2026-11-17).
  const handleSetDeadline = useCallback((taskId, deadline) => {
    const now = new Date().toISOString()
    const updatedTasks = (data.tasks || []).map(t => {
      if (t.id !== taskId) return t
      const next = { ...t, updatedAt: now }
      if (deadline) next.deadline = deadline
      else delete next.deadline // clear = the key is gone entirely
      return next
    })
    onSave({
      ...data,
      tasks: updatedTasks,
      meta: { ...data.meta, updatedAt: now }
    })
  }, [data, onSave])


  // Filter boardItems to only include items that will actually be rendered
  // This ensures index-based lookups work correctly for consecutive marker detection
  const visibleBoardItems = useMemo(() => {
    return boardItems.filter(item => {
      if (item.type === 'task') {
        const task = tasks.find(t => t.id === item.taskId)
        return task && !task.completion
      } else if (item.type === 'marker') {
        const marker = markers.find(m => m.id === item.markerId)
        return marker
      }
      return false
    })
  }, [boardItems, tasks, markers])

  // Pre-compute task→category lookup map for O(1) per task instead of O(n) getTaskCategory scans
  const categoryLookup = useMemo(() => {
    const map = new Map()
    for (let i = 0; i < boardItems.length; i++) {
      const item = boardItems[i]
      if (item.type !== 'task') continue
      const cat = getTaskCategory(i, boardItems, markers, categories)
      if (cat) map.set(item.taskId, cat)
    }
    return map
  }, [boardItems, markers, categories])

  // Pre-compute task map for O(1) lookups
  const taskMap = useMemo(() => {
    const map = new Map()
    for (const t of tasks) map.set(t.id, t)
    return map
  }, [tasks])

  // Pre-compute marker map for O(1) lookups
  const markerMap = useMemo(() => {
    const map = new Map()
    for (const m of markers) map.set(m.id, m)
    return map
  }, [markers])

  // Pre-compute category map for O(1) lookups
  const categoryMap = useMemo(() => {
    const map = new Map()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  // Memoize sortable item IDs
  const sortableItemIds = useMemo(() =>
    boardItems.map(i => i.type === 'task' ? i.taskId : i.markerId)
  , [boardItems])

  // Today's local calendar date — read fresh on every render pass so the
  // deadline chips in board rows stay correct across midnight rollovers
  // (no memo: getCurrentDate() is a trivial local-calendar format).
  const today = getCurrentDate()

  // Render board rows with insertion points
  const renderBoardRows = useMemo(() => {
    const rows = []
    
    // Add insertion point at the top
    rows.push(
      <InsertionPoint 
        key="insert-top" 
        id="insert-top" 
        onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, null)} 
        forceActive={dropIndicatorId === 'insert-top'}
      />
    )
    
    visibleBoardItems.forEach((item, index) => {
      const prevItem = visibleBoardItems[index - 1]
      
      if (item.type === 'task') {
        const task = taskMap.get(item.taskId)
        const category = categoryLookup.get(item.taskId) || null

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
            onCreateThread={() => handleCreateThreadTask(task.id)}
            isThreadTask={Boolean(task.threadOf)}
            isRecurringTask={Boolean(task.recurringOf)}
            deadline={task.deadline}
            onSetDeadline={(deadline) => handleSetDeadline(task.id, deadline)}
            today={today}
            weekStartsOn={settings.weekStartsOn ?? 1}
          />
        )
        
        // Add insertion point after this task
        rows.push(
          <InsertionPoint 
            key={`insert-${item.taskId}`} 
            id={item.taskId} 
            onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, item.taskId)} 
            forceActive={dropIndicatorId === item.taskId}
          />
        )
      } else if (item.type === 'marker') {
        const marker = markerMap.get(item.markerId)
        if (!marker) return

        const category = categoryMap.get(marker.categoryId)
        if (!category) return

        // Check if previous visible item is also a marker (for consecutive spacing)
        const isConsecutiveMarker = prevItem?.type === 'marker'

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
            onUpdateMarkerNote={handleUpdateMarkerNote}
            isConsecutiveMarker={isConsecutiveMarker}
          />
        )
        
        // Add insertion point after this marker (always normal height for precise DnD)
        rows.push(
          <InsertionPoint 
            key={`insert-${item.markerId}`} 
            id={item.markerId} 
            onDrop={(categoryId, isNew, _) => handleMarkerDrop(categoryId, isNew, item.markerId)} 
            forceActive={dropIndicatorId === item.markerId}
          />
        )
      }
    })
    
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBoardItems, editingTask, selectedItems, workingOnTasks, dropIndicatorId, categoryLookup, taskMap, markerMap, handleSelectItem, handleCompleteClick, handleDeleteTask, handleUpdateTask, handleDeleteMarker, handleMoveItem, handleAddTaskBelowMarker, handleMarkerDrop, handleUpdateMarkerNote, handleToggleWorkingOn, handleCreateThreadTask, handleSetDeadline, today, settings])

  return (
    <div className="board-container">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={sortableItemIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="board-list" style={{ position: 'relative' }}>
                {/* Drop indicator overlay */}
                {dropIndicatorId && (
                  <DropIndicator 
                    activeId={dropIndicatorId} 
                    boardItems={boardItems}
                  />
                )}
                {renderBoardRows}
                
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
                      ? String(taskMap.get(draggingItem.id)?.text ?? '')
                      : 'Category Marker'
                  }
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        
        {/* v1.3.0 right panel (user follow-up 2026-11-18): the nav-bar row
            (Randomizer + collapse toggle) stays at the TOP of the categories
            area. Collapsing now slides the WHOLE panel to the SIDE — the
            board reclaims the 280px — leaving a slim strip with the expand
            toggle (‹) and a Randomizer icon. Chevron direction signals the
            action: › (right) while expanded = collapse to the right side,
            ‹ (left) while collapsed = expand back out. */}
        <div className={`board-right-panel${categoriesCollapsed ? ' collapsed' : ''}`}>
          {categoriesCollapsed ? (
            <div className="sidebar-collapsed-strip">
              <button
                type="button"
                className="sidebar-toggle-btn"
                onClick={() => setCategoriesCollapsed(false)}
                aria-label="Expand categories"
                aria-expanded={false}
                title="Expand categories"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 6 9 12 15 18" />
                </svg>
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                onClick={handleRandomizeTask}
                title="Pick a random task to work on"
                aria-label="Randomizer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="sidebar-nav">
                <button
                  type="button"
                  className="randomizer-btn"
                  onClick={handleRandomizeTask}
                  title="Pick a random task to work on"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: '-2px' }}>
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                  Randomizer
                </button>
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={() => setCategoriesCollapsed(true)}
                  aria-label="Collapse categories"
                  aria-expanded
                  title="Collapse categories"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              </div>
              <div className="board-sidebar">
                <CategorySidebar
                  categories={categories}
                  onCreateCategory={handleCreateCategory}
                  onAddMarker={handleAddMarker}
                  onNavigateToCategory={handleNavigateToCategory}
                />
              </div>
            </>
          )}
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
              <p className="task-text">{String(deleteTask?.text ?? '')}</p>
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
