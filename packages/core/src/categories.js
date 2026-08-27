// categories.js — the STRICT category derivation rule.

// Get category for a task based on board position - STRICT DERIVATION RULE
// A task belongs to a category ONLY if:
// 1. There is a marker directly above it AND a marker directly below it
// 2. Both markers reference the SAME category ID
// Otherwise, the task has NO category.
function getTaskCategory(taskIndex, boardItems, markers, categories) {
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

module.exports = { getTaskCategory }
