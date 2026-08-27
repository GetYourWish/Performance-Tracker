// schema.js — schema version gate + idempotent validate & heal.
// The gate is the ONLY authority on whether a tracker.json may be loaded:
// a file written by a NEWER app version (numeric schemaVersion > 1) is
// refused, never silently healed downgraded. Missing/non-number is
// treated as 1 (legacy files).

const { createDefaultData } = require('./defaults')

// Returns { ok: true } when the file may be loaded, or
// { ok: false, schemaVersion, message } when it must be refused.
function checkSchemaVersion(data) {
  const sv = data && typeof data === 'object' ? data.schemaVersion : undefined
  if (typeof sv === 'number' && sv > 1) {
    return {
      ok: false,
      schemaVersion: sv,
      message: `SCHEMA_VERSION_TOO_NEW:${sv}`
    }
  }
  return { ok: true }
}

// Validate and heal data.
// NOTE: healing is idempotent — healing an already-valid file returns a
// deep-equal structure. In particular meta.updatedAt is NOT touched here:
// bumping it on every load caused a rewrite on every start (and endless
// Syncthing churn). Mutating actions bump updatedAt explicitly when saving.
function validateAndHealData(data) {
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

  // Sanitize all task text fields to ensure they're strings
  healed.tasks = healed.tasks.map(task => {
    if (!task) return task
    return {
      ...task,
      text: typeof task.text === 'string' ? task.text : String(task.text ?? '')
    }
  })

  return healed
}

module.exports = { checkSchemaVersion, validateAndHealData }
