// actions.js — the pure mutation transforms the Android app applies to
// tracker.json data. Every function mirrors the EXACT desktop behavior
// (desktop/src/components/Board.jsx / App.jsx / Settings.jsx) and goes
// through @performance-tracker/core, so both apps write byte-identical
// structures from the same base. Inputs are never mutated.
//
// Every function takes an explicit `now` ISO timestamp (the mutation's
// wall-clock moment) — no hidden Date.now(), fully testable.

import {
  generateId,
  getTaskCategory,
  calculateTaskScoreBreakdown
} from '@performance-tracker/core'

function withMeta(data, now) {
  return { ...data, meta: { ...(data.meta || {}), updatedAt: now } }
}

// --- Tasks ---------------------------------------------------------------

// desktop Board.handleCreateTask: new task + board PREPEND
export function createTask(data, text, now) {
  const newTask = {
    id: generateId(),
    text,
    createdAt: now,
    updatedAt: now,
    completion: null
  }
  return withMeta(
    {
      ...data,
      tasks: [...(data.tasks || []), newTask],
      board: [{ type: 'task', taskId: newTask.id }, ...(data.board || [])]
    },
    now
  )
}

// desktop Board.handleAddTaskBelowMarker — insert right below the marker item
export function addTaskBelowMarker(data, markerId, text, now) {
  const board = data.board || []
  const insertIndex = board.findIndex(
    item => item.type === 'marker' && item.markerId === markerId
  )
  if (insertIndex === -1) return withMeta(data, now)

  const newTask = {
    id: generateId(),
    text,
    createdAt: now,
    updatedAt: now,
    completion: null
  }
  const updatedBoard = [
    ...board.slice(0, insertIndex + 1),
    { type: 'task', taskId: newTask.id },
    ...board.slice(insertIndex + 1)
  ]
  return withMeta({ ...data, tasks: [...(data.tasks || []), newTask], board: updatedBoard }, now)
}

// desktop Board.handleUpdateTask
export function updateTaskText(data, taskId, text, now) {
  return withMeta(
    {
      ...data,
      tasks: (data.tasks || []).map(t =>
        t.id === taskId ? { ...t, text, updatedAt: now } : t
      )
    },
    now
  )
}

// desktop Board.handleDeleteTask — also drops board + workingOn references
export function deleteTask(data, taskId, now) {
  return withMeta(
    {
      ...data,
      tasks: (data.tasks || []).filter(t => t.id !== taskId),
      board: (data.board || []).filter(
        item => !(item.type === 'task' && item.taskId === taskId)
      ),
      workingOn: (data.workingOn || []).filter(id => id !== taskId)
    },
    now
  )
}

// desktop Board.handleToggleWorkingOn
export function toggleWorkingOn(data, taskId, now) {
  const current = data.workingOn || []
  const workingOn = current.includes(taskId)
    ? current.filter(id => id !== taskId)
    : [...current, taskId]
  return withMeta({ ...data, workingOn }, now)
}

// desktop Board.handleCompletionConfirm — THE completion flow.
// Category derivation uses core getTaskCategory (strict marker-above/
// marker-below same-category rule) — the same rule the desktop board
// implements inline; core is the shared canonical implementation.
export function completeTask(data, { taskId, difficultyId, date, note }, now) {
  const boardItems = data.board || []
  const markers = data.markers || []
  const categories = data.categories || []
  const settings = data.settings || {}
  const difficulties = data.difficulties || []

  const taskIndex = boardItems.findIndex(
    item => item.type === 'task' && item.taskId === taskId
  )
  const category = getTaskCategory(taskIndex, boardItems, markers, categories)
  const categoryId = category ? category.id : null

  const completedTask = {
    id: taskId,
    text: (data.tasks || []).find(t => t.id === taskId)?.text || '',
    completion: {
      completedDate: date,
      completedAt: now,
      difficultyId,
      categoryId,
      note: note || ''
    }
  }

  const allCompleted = [...(data.tasks || []).filter(t => t.completion), completedTask]
  const breakdown = calculateTaskScoreBreakdown(
    completedTask,
    allCompleted,
    difficulties,
    settings.fatigueIncrement || 0.10,
    settings.fatigueCap || 3.0,
    categories
  )

  const logEntry = {
    id: generateId(),
    timestamp: now,
    taskId,
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

  const existingLogs = data.logs || []
  const updatedLogs =
    existingLogs.length >= 500
      ? [...existingLogs.slice(existingLogs.length - 499), logEntry]
      : [...existingLogs, logEntry]

  return withMeta(
    {
      ...data,
      tasks: (data.tasks || []).map(t =>
        t.id === taskId
          ? {
              ...t,
              completion: {
                completedDate: date,
                completedAt: now,
                difficultyId,
                categoryId,
                note: note || ''
              }
            }
          : t
      ),
      board: boardItems.filter(
        item => !(item.type === 'task' && item.taskId === taskId)
      ),
      workingOn: (data.workingOn || []).filter(id => id !== taskId),
      logs: updatedLogs
    },
    now
  )
}

// --- Markers & categories ------------------------------------------------

// desktop Board.handleAddMarker — marker entity + board item APPENDED at end
export function addMarker(data, categoryId, now) {
  const newMarker = {
    id: generateId(),
    categoryId,
    createdAt: now,
    updatedAt: now
  }
  return withMeta(
    {
      ...data,
      markers: [...(data.markers || []), newMarker],
      board: [...(data.board || []), { type: 'marker', markerId: newMarker.id }]
    },
    now
  )
}

// desktop Board.handleDeleteMarker
export function deleteMarker(data, markerId, now) {
  return withMeta(
    {
      ...data,
      markers: (data.markers || []).filter(m => m.id !== markerId),
      board: (data.board || []).filter(
        item => !(item.type === 'marker' && item.markerId === markerId)
      )
    },
    now
  )
}

// desktop Board.handleUpdateMarkerNote
export function updateMarkerNote(data, markerId, note, now) {
  return withMeta(
    {
      ...data,
      markers: (data.markers || []).map(m =>
        m.id === markerId ? { ...m, note: String(note || '').trim(), updatedAt: now } : m
      )
    },
    now
  )
}

// desktop quick-create category (Board.handleQuickCreateCategory): appended,
// order = categories.length, priorityMultiplier 1, active.
export function createCategory(data, { name, color }, now) {
  const newCategory = {
    id: generateId(),
    name,
    color,
    order: (data.categories || []).length,
    active: true,
    priorityMultiplier: 1
  }
  return withMeta({ ...data, categories: [...(data.categories || []), newCategory] }, now)
}

// --- Board layout --------------------------------------------------------

// desktop Board.handleDragEnd (single-item path): move one item after the
// anchor id ('__top__' = very top), or by ±1 for the move buttons.
export function moveItem(data, itemId, direction, now) {
  const board = data.board || []
  const idOf = item => (item.type === 'task' ? item.taskId : item.markerId)
  const itemIndex = board.findIndex(item => idOf(item) === itemId)
  if (itemIndex === -1) return withMeta(data, now)

  const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1
  if (newIndex < 0 || newIndex >= board.length) return withMeta(data, now)

  const newBoard = [...board]
  const tmp = newBoard[itemIndex]
  newBoard[itemIndex] = newBoard[newIndex]
  newBoard[newIndex] = tmp
  return withMeta({ ...data, board: newBoard }, now)
}

// DraggableFlatList onDragEnd → ordered item ids → new board layout.
// Items not present in orderedIds keep their relative order at the end
// (defensive parity with desktop's insertion-point semantics).
export function reorderBoard(data, orderedIds, now) {
  const board = data.board || []
  const idOf = item => (item.type === 'task' ? item.taskId : item.markerId)
  const byId = new Map()
  for (const item of board) byId.set(idOf(item), item)

  const newBoard = []
  const consumed = new Set()
  for (const id of orderedIds) {
    const item = byId.get(id)
    if (item && !consumed.has(id)) {
      newBoard.push(item)
      consumed.add(id)
    }
  }
  for (const item of board) {
    if (!consumed.has(idOf(item))) newBoard.push(item)
  }
  return withMeta({ ...data, board: newBoard }, now)
}

// --- Settings ------------------------------------------------------------

// desktop Settings.handleSettingChange — merge one key into data.settings
export function updateSettings(data, patch, now) {
  return withMeta(
    { ...data, settings: { ...(data.settings || {}), ...patch } },
    now
  )
}
