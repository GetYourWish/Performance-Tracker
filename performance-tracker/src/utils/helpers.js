// Generate unique ID
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
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

// Calculate score for a set of completed tasks
export function calculateDayScore(completedTasks, difficulties, fatigueIncrement = 0.10, fatigueCap = 3.0) {
  if (!completedTasks || completedTasks.length === 0) {
    return 0
  }

  // Sort by completion timestamp
  const sorted = [...completedTasks].sort((a, b) => {
    return new Date(a.completion.completedAt) - new Date(b.completion.completedAt)
  })

  let totalScore = 0
  let multiplier = 1.0

  for (const task of sorted) {
    const difficulty = difficulties.find(d => d.id === task.completion.difficultyId)
    const baseScore = difficulty ? difficulty.score : 0
    const adjustedScore = baseScore * multiplier
    totalScore += adjustedScore
    
    // Increase multiplier for next task
    multiplier = Math.min(multiplier + fatigueIncrement, fatigueCap)
  }

  return totalScore
}

// Get category for a task based on board position
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

  // Assign category from above marker if it exists (range-based: from marker down to next marker or end)
  if (aboveMarker) {
    const category = categories.find(c => c.id === aboveMarker.categoryId)
    return category || null
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

  return healed
}
