// workingOn.js — ordering for the "Working On" list.
//
// User request (2026-11-17): working-on tasks must be arranged by their
// CATEGORY PRIORITY, not by the time they were added. The persisted
// `workingOn` array keeps its stack semantics (insertion order, healing
// rules, mobile/desktop parity — unchanged); this helper produces the
// DISPLAY order: category priorityMultiplier DESC first, original
// insertion order within the same priority (stable sort, ES2019).
// Tasks with no category sort after every categorized task.
//
// Pure: derives each task's category with the canonical strict
// marker-above/marker-below rule (getTaskCategory) against the board.

const { getTaskCategory } = require('./categories')

function sortWorkingOnByPriority(workingOn, boardItems, markers, categories) {
  const ids = Array.isArray(workingOn) ? [...workingOn] : []

  // taskId -> priorityMultiplier, computed once over the board
  const priorityByTask = new Map()
  for (let i = 0; i < boardItems.length; i++) {
    const item = boardItems[i]
    if (!item || item.type !== 'task') continue
    const category = getTaskCategory(i, boardItems, markers, categories)
    if (category) {
      priorityByTask.set(item.taskId, typeof category.priorityMultiplier === 'number' ? category.priorityMultiplier : 1)
    }
  }

  const priorityOf = id => (priorityByTask.has(id) ? priorityByTask.get(id) : -1)

  return ids.sort((a, b) => {
    const pa = priorityOf(a)
    const pb = priorityOf(b)
    if (pb !== pa) return pb - pa
    return 0 // stable sort keeps insertion order within equal priority
  })
}

module.exports = { sortWorkingOnByPriority }
