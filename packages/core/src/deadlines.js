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

module.exports = { daysUntilDeadline, deadlineState }
