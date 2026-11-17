// deadlines.js — optional task deadlines ('YYYY-MM-DD' calendar date).
//
// User request (2026-11-17): "add DEADLINES to tasks". A deadline is an
// OPTIONAL field on tasks (`tasks[].deadline`, absent/empty = none) and is
// presentation state only — it never affects scoring, healing or the
// schema gate. Clients render a deadline chip on the row/popups and color
// it by proximity; the classification lives here so desktop and Android
// agree on what "overdue" means.
//
// All comparisons are calendar-day based against a caller-supplied
// `today` ('YYYY-MM-DD', local calendar) — no hidden Date.now().

const { parseDate } = require('./dates')

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Whole calendar days from `today` until `deadline` (negative = overdue).
// Both dates parse to local midnight; Math.round absorbs DST shifts
// (23h/25h days still land on the expected whole-day difference).
function daysUntilDeadline(deadline, today) {
  const d = parseDate(deadline).getTime() - parseDate(today).getTime()
  return Math.round(d / MS_PER_DAY)
}

// Classify a deadline for display. Returns null when there is no deadline.
//   overdue   — deadline is before today
//   dueToday  — deadline is today
//   daysLeft  — whole days until the deadline (0 when due today, negative
//               when overdue)
//   label     — short human string: '3d overdue' | 'due today' |
//               'due tomorrow' | 'in 2d'
function deadlineState(deadline, today) {
  if (!deadline || typeof deadline !== 'string') return null
  const daysLeft = daysUntilDeadline(deadline, today)
  // Malformed date strings (e.g. a full ISO datetime sneaking in from a
  // third-party writer) parse to NaN — rendering "in NaNd" on chips. Treat
  // anything unparseable as "no deadline" instead of lying to the user.
  if (!Number.isFinite(daysLeft)) return null
  let label
  if (daysLeft < 0) {
    label = `${-daysLeft}d overdue`
  } else if (daysLeft === 0) {
    label = 'due today'
  } else if (daysLeft === 1) {
    label = 'due tomorrow'
  } else {
    label = `in ${daysLeft}d`
  }
  return {
    daysLeft,
    overdue: daysLeft < 0,
    dueToday: daysLeft === 0,
    label
  }
}

// Auto-add due deadline tasks to Working On (user request 2026-11-18).
//
// "When the day is reached it should be added automatically into the working
// on tasks." — when a task's deadline arrives (deadline <= today, including
// overdue), the task joins `workingOn` automatically, on BOTH desktop and
// Android (the helper is the single shared rule, exactly like
// materializeRecurringTasks).
//
// Idempotence / manual-removal respect: adding stamps
// `tasks[].deadlineAutoAdded = deadline`. The stamp is compared against the
// task's CURRENT deadline — a task is auto-added at most ONCE per deadline.
// If the user then manually removes it from Working On, it is never re-added
// for that same deadline; setting a NEW deadline re-arms the behavior.
//
// Pure: `today` / `now` enter as arguments, the input data object is never
// mutated, and when nothing is due the input `data` is returned unchanged
// (===) so callers' no-change-no-write skips the disk.
// Returns { data, added }: `added` lists the task ids newly pushed into
// `workingOn`; `data` is the exact input reference when NOTHING changed (no
// additions and no stamps) so callers' no-change-no-write kicks in.
function applyDueDeadlines({ data, today, now }) {
  if (!data || typeof data !== 'object') return { data, added: [] }

  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const workingOn = Array.isArray(data.workingOn) ? data.workingOn : []

  const addedIds = []
  let changed = false
  const nextTasks = tasks.map(task => {
    if (!task || task.completion) return task
    const deadline = task.deadline
    if (!deadline || typeof deadline !== 'string') return task
    if (task.deadlineAutoAdded === deadline) return task // already handled for this deadline
    const daysLeft = daysUntilDeadline(deadline, today)
    // Malformed deadlines (NaN) count as "not reached" — a rogue full-ISO
    // datetime must not auto-add the task to Working On (v1.4.0 guard,
    // same class as the deadlineState NaN guard).
    if (!Number.isFinite(daysLeft) || daysLeft > 0) return task

    // Due (or overdue) and not yet handled for this deadline. Stamp it so a
    // later manual removal is respected; only push into workingOn when the
    // user has not already added it themselves.
    changed = true
    if (!workingOn.includes(task.id)) addedIds.push(task.id)
    return { ...task, deadlineAutoAdded: deadline }
  })

  if (!changed) return { data, added: [] }

  return {
    data: {
      ...data,
      tasks: nextTasks,
      workingOn: addedIds.length > 0 ? [...workingOn, ...addedIds] : workingOn,
      meta: { ...(data.meta || {}), updatedAt: now }
    },
    added: addedIds
  }
}

module.exports = { daysUntilDeadline, deadlineState, applyDueDeadlines }
