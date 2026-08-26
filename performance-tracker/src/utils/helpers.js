// Generate unique ID using crypto API if available, fallback to Date.now
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
}

// Sanitize text input - prevent XSS and limit length
export function sanitizeInput(text, maxLength = 500) {
  if (!text) return ''
  const trimmed = text.trim().slice(0, maxLength)
  // Basic XSS prevention - escape HTML entities
  return trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Get current date as YYYY-MM-DD
export function getCurrentDate() {
  const now = new Date()
  return formatDate(now)
}

// Format date to YYYY-MM-DD
export function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Parse date string
export function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Get start of week
export function getStartOfWeek(date, weekStartsOn = 1) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Get end of week
export function getEndOfWeek(date, weekStartsOn = 1) {
  const start = getStartOfWeek(date, weekStartsOn)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

// Get week number
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// Get days in month
export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// Calculate the score breakdown for a SINGLE task at the moment of completion
// Returns an object with all formula components for logging
// Accepts pre-built Maps for performance when called in bulk
export function calculateTaskScoreBreakdown(task, completedTasks, difficulties, fatigueIncrement, fatigueCap, categories, _difficultyMap, _categoryMap, _tasksByDate) {
  const difficultyMap = _difficultyMap || new Map(difficulties.map(d => [d.id, d]))
  const categoryMap = _categoryMap || new Map(categories.map(c => [c.id, c]))

  const difficulty = difficultyMap.get(task.completion.difficultyId)
  const basePoints = difficulty ? difficulty.score : 0
  const difficultyLabel = difficulty ? difficulty.label : 'Unknown'
  const difficultyColor = difficulty ? difficulty.color : '#888'

  // Determine category info
  let categoryName = null
  let categoryColor = null
  let priorityMultiplier = 1.0
  if (task.completion.categoryId) {
    const category = categoryMap.get(task.completion.categoryId)
    if (category) {
      categoryName = category.name
      categoryColor = category.color
      if (typeof category.priorityMultiplier === 'number') {
        priorityMultiplier = category.priorityMultiplier
      }
    }
  }

  // Calculate fatigue multiplier: count tasks completed earlier on the same date
  const completionDate = task.completion.completedDate
  let taskIndex = 0
  if (_tasksByDate && _tasksByDate.has(completionDate)) {
    // O(k) for k tasks on that day instead of O(n) for all tasks
    const dayTasks = _tasksByDate.get(completionDate)
    const taskTime = new Date(task.completion.completedAt).getTime()
    for (let i = 0; i < dayTasks.length; i++) {
      if (dayTasks[i].id !== task.id && new Date(dayTasks[i].completion.completedAt).getTime() < taskTime) {
        taskIndex++
      }
    }
  } else if (!_tasksByDate) {
    // Fallback: original O(n) filter (only when no pre-grouped map provided)
    const earlierTasks = completedTasks.filter(t =>
      t.id !== task.id &&
      t.completion &&
      t.completion.completedDate === completionDate &&
      new Date(t.completion.completedAt) < new Date(task.completion.completedAt)
    )
    taskIndex = earlierTasks.length
  }
  const fatigueMultiplier = Math.min(1.0 + (taskIndex * fatigueIncrement), fatigueCap)

  const finalScore = basePoints * fatigueMultiplier * priorityMultiplier

  return {
    basePoints,
    difficultyLabel,
    difficultyColor,
    categoryName,
    categoryColor,
    priorityMultiplier,
    fatigueMultiplier,
    finalScore: Math.round(finalScore * 100) / 100 // 2 decimal places
  }
}

// Calculate score for a set of completed tasks - OPTIMIZED with difficulty map lookup
// Formula: baseScore * fatigueMultiplier * categoryPriorityMultiplier
export function calculateDayScore(completedTasks, difficulties, fatigueIncrement = 0.10, fatigueCap = 3.0, categories = []) {
  if (!completedTasks || completedTasks.length === 0) {
    return 0
  }

  // Sort by completion timestamp
  const sorted = [...completedTasks].sort((a, b) => {
    return new Date(a.completion.completedAt) - new Date(b.completion.completedAt)
  })

  let totalScore = 0
  let multiplier = 1.0

  // Create lookups for O(1) access
  const difficultyMap = new Map(difficulties.map(d => [d.id, d]))
  const categoryMap = new Map(categories.map(c => [c.id, c]))

  for (const task of sorted) {
    const difficulty = difficultyMap.get(task.completion.difficultyId)
    const baseScore = difficulty ? difficulty.score : 0

    // Apply category priority multiplier (default 1.0 if no category)
    let priorityMultiplier = 1.0
    if (task.completion.categoryId) {
      const category = categoryMap.get(task.completion.categoryId)
      if (category && typeof category.priorityMultiplier === 'number') {
        priorityMultiplier = category.priorityMultiplier
      }
    }

    const adjustedScore = baseScore * multiplier * priorityMultiplier
    totalScore += adjustedScore
    
    // Increase multiplier for next task
    multiplier = Math.min(multiplier + fatigueIncrement, fatigueCap)
  }

  return totalScore
}

// Pre-group tasks by date for efficient heatmap calculation - O(n) instead of O(n*m)
// Each group is sorted by completedAt for O(k) fatigue lookups
export function groupTasksByDate(completedTasks) {
  const grouped = new Map()
  
  for (const task of completedTasks) {
    if (!task.completion || !task.completion.completedDate) continue
    
    const dateStr = task.completion.completedDate
    if (!grouped.has(dateStr)) {
      grouped.set(dateStr, [])
    }
    grouped.get(dateStr).push(task)
  }
  
  // Sort each day's tasks by completion time for efficient fatigue index calculation
  for (const [, tasks] of grouped) {
    tasks.sort((a, b) => new Date(a.completion.completedAt).getTime() - new Date(b.completion.completedAt).getTime())
  }
  
  return grouped
}

// Get category for a task based on board position - STRICT DERIVATION RULE
// A task belongs to a category ONLY if:
// 1. There is a marker directly above it AND a marker directly below it
// 2. Both markers reference the SAME category ID
// Otherwise, the task has NO category
export function getTaskCategory(taskIndex, boardItems, markers, categories) {
  let aboveMarker = null
  let belowMarker = null

  // Find nearest marker above (before) the task
  for (let i = taskIndex - 1; i >= 0; i--) {
    const item = boardItems[i]
    if (item && item.type === 'marker') {
      aboveMarker = item
      break
    }
  }

  // Find nearest marker below (after) the task
  for (let i = taskIndex + 1; i < boardItems.length; i++) {
    const item = boardItems[i]
    if (item && item.type === 'marker') {
      belowMarker = item
      break
    }
  }

  // Task has a category ONLY if both markers exist AND they reference the same category
  if (aboveMarker && belowMarker) {
    if (aboveMarker.categoryId === belowMarker.categoryId) {
      const category = categories.find(c => c.id === aboveMarker.categoryId)
      return category || null
    }
  }

  return null
}

// Create default data structure
export function createDefaultData() {
  return {
    schemaVersion: 1,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    settings: {
      theme: 'system',
      weekStartsOn: 1, // Monday
      heatmapMode: 'score',
      fatigueIncrement: 0.10,
      fatigueCap: 3.0
    },
    difficulties: [
      { id: generateId(), label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
      { id: generateId(), label: 'Medium', score: 2, color: '#fbbf24', order: 1, active: true },
      { id: generateId(), label: 'Hard', score: 3, color: '#f87171', order: 2, active: true },
      { id: generateId(), label: 'Very Hard', score: 5, color: '#dc2626', order: 3, active: true }
    ],
    categories: [],
    markers: [],
    board: [],
    tasks: []
  }
}

// Validate and heal data
export function validateAndHealData(data) {
  if (!data) {
    return createDefaultData()
  }

  const healed = { ...data }

  // Ensure required sections exist
  if (!healed.schemaVersion) healed.schemaVersion = 1
  if (!healed.meta) healed.meta = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  if (!healed.settings) healed.settings = {}
  if (!healed.difficulties) healed.difficulties = []
  if (!healed.categories) healed.categories = []
  if (!healed.markers) healed.markers = []
  if (!healed.board) healed.board = []
  if (!healed.tasks) healed.tasks = []

  // Update timestamp
  healed.meta.updatedAt = new Date().toISOString()

  // Heal board: ensure all active tasks are on board
  const activeTasks = healed.tasks.filter(t => !t.completion)
  const boardTaskIds = healed.board
    .filter(item => item.type === 'task')
    .map(item => item.taskId)

  for (const task of activeTasks) {
    if (!boardTaskIds.includes(task.id)) {
      healed.board.push({ type: 'task', taskId: task.id })
    }
  }

  // Heal board: remove references to missing tasks
  healed.board = healed.board.filter(item => {
    if (item.type === 'task') {
      return healed.tasks.some(t => t.id === item.taskId && !t.completion)
    }
    if (item.type === 'marker') {
      return healed.markers.some(m => m.id === item.markerId)
    }
    return true
  })

  // Initialize workingOn array if missing
  if (!healed.workingOn) healed.workingOn = []

  // Initialize logs array if missing
  if (!healed.logs) healed.logs = []

  // Cap logs at 500 entries to prevent unbounded growth
  if (healed.logs.length > 500) {
    healed.logs = healed.logs.slice(healed.logs.length - 500)
  }

  // Heal workingOn: remove IDs of tasks that no longer exist or are completed
  healed.workingOn = healed.workingOn.filter(taskId => {
    const task = healed.tasks.find(t => t.id === taskId)
    return task && !task.completion
  })

  return healed
}
