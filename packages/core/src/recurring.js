// recurring.js — weekday-scheduled pre-loaded tasks, configured per
// category ("recurring tasks").
//
// User request (2026-11-17): recurring tasks must exist in the software,
// configured as a specific day or set of days per week, and they must be
// set as WORKING ON automatically. The configuration lives in the
// category settings (desktop Settings ▸ Categories / Android category
// editor) as `categories[].recurringTasks`:
//
//   [{ id, text, days: [0..6] (JS getDay: 0=Sunday … 6=Saturday),
//      lastRun?: 'YYYY-MM-DD', active?: boolean }]
//
// Materialization (this module) runs once per app start / data load on
// BOTH clients: for every due recurring task whose `lastRun` is not
// today, one task instance is created inside the category's board
// section, added to `workingOn`, and `lastRun` is stamped — the stamp is
// persisted in the SAME tracker.json, so sync (Syncthing) can never
// duplicate an instance across devices for the same day.
//
// Board placement honors the strict category derivation rule
// (marker-above + marker-below of the SAME category): the instance is
// inserted directly below the first marker of an existing same-category
// section; when the category has no section on the board yet, a fresh
// [marker, task, marker] section is appended. New markers inherit the
// category-level note (categories[].note) when present.
//
// Pure: `today` / `now` / id factory enter as arguments; the input data
// object is never mutated. When nothing is due, the input `data` is
// returned unchanged (===) so callers' no-change-no-write kicks in.

const { parseDate } = require('./dates')

// Does this recurring config run on `weekday` (0=Sunday … 6=Saturday)?
function isDueOn(recurringTask, weekday) {
  if (!recurringTask || recurringTask.active === false) return false
  if (typeof recurringTask.text !== 'string' || recurringTask.text.trim() === '') return false
  if (!Array.isArray(recurringTask.days)) return false
  return recurringTask.days.some(d => d === weekday)
}

// Find the board index directly below the first marker of a category
// section: a marker of `categoryId` whose NEXT marker (skipping tasks) is
// also `categoryId`. Returns -1 when the category has no section.
function findSectionTopIndex(boardItems, markers, categoryId) {
  const markerById = new Map(markers.map(m => [m.id, m]))
  for (let i = 0; i < boardItems.length; i++) {
    const item = boardItems[i]
    if (!item || item.type !== 'marker') continue
    const marker = markerById.get(item.markerId)
    if (!marker || marker.categoryId !== categoryId) continue
    // find the next marker below
    for (let j = i + 1; j < boardItems.length; j++) {
      const below = boardItems[j]
      if (!below || below.type !== 'marker') continue
      const belowMarker = markerById.get(below.markerId)
      return belowMarker && belowMarker.categoryId === categoryId ? i : -1
    }
    // no marker below at all → not a closed section
    return -1
  }
  return -1
}

// Materialize every due recurring task for `today`.
// Returns { data, created } — `created` lists the new task objects;
// when empty, `data` is the exact input reference.
function materializeRecurringTasks({ data, today, now, generateId }) {
  if (!data || typeof data !== 'object') return { data, created: [] }

  const weekday = parseDate(today).getDay()
  const categories = Array.isArray(data.categories) ? data.categories : []
  const markers = Array.isArray(data.markers) ? data.markers : []
  const boardItems = Array.isArray(data.board) ? data.board : []
  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const workingOn = Array.isArray(data.workingOn) ? data.workingOn : []

  const created = []
  const nextTasks = [...tasks]
  const nextBoard = [...boardItems]
  const nextMarkers = [...markers]
  const nextWorkingOn = [...workingOn]
  let categoriesChanged = false
  const nextCategories = categories.map(category => {
    const recurring = Array.isArray(category.recurringTasks) ? category.recurringTasks : []
    if (recurring.length === 0) return category
    if (category.active === false) return category

    let recurringChanged = false
    const nextRecurring = recurring.map(rt => {
      if (!isDueOn(rt, weekday)) return rt
      if (rt.lastRun === today) return rt

      // --- create the instance -----------------------------------------
      const newTask = {
        id: generateId(),
        text: rt.text,
        createdAt: now,
        updatedAt: now,
        completion: null,
        recurringOf: rt.id
      }
      created.push(newTask)
      nextTasks.push(newTask)
      if (!nextWorkingOn.includes(newTask.id)) {
        nextWorkingOn.push(newTask.id) // auto working-on (user request)
      }

      // --- place it inside the category's board section -----------------
      const sectionTop = findSectionTopIndex(nextBoard, nextMarkers, category.id)
      if (sectionTop !== -1) {
        nextBoard.splice(sectionTop + 1, 0, { type: 'task', taskId: newTask.id })
      } else {
        // No closed section on the board: append a fresh one. Both markers
        // inherit the category-level note (desktop category-note sync).
        const note = typeof category.note === 'string' && category.note.trim() !== ''
          ? category.note
          : undefined
        const openMarker = { id: generateId(), categoryId: category.id, createdAt: now, updatedAt: now }
        const closeMarker = { id: generateId(), categoryId: category.id, createdAt: now, updatedAt: now }
        if (note !== undefined) {
          openMarker.note = note
          closeMarker.note = note
        }
        nextMarkers.push(openMarker, closeMarker)
        nextBoard.push(
          { type: 'marker', markerId: openMarker.id },
          { type: 'task', taskId: newTask.id },
          { type: 'marker', markerId: closeMarker.id }
        )
      }

      recurringChanged = true
      return { ...rt, lastRun: today }
    })

    if (!recurringChanged) return category
    categoriesChanged = true
    return { ...category, recurringTasks: nextRecurring }
  })

  if (created.length === 0) {
    return { data, created: [] }
  }

  const nextData = {
    ...data,
    categories: categoriesChanged ? nextCategories : data.categories,
    markers: nextMarkers,
    board: nextBoard,
    tasks: nextTasks,
    workingOn: nextWorkingOn,
    meta: { ...(data.meta || {}), updatedAt: now }
  }
  return { data: nextData, created }
}

module.exports = { isDueOn, findSectionTopIndex, materializeRecurringTasks }
