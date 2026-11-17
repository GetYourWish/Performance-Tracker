import { useMemo, useState } from 'react'
import { getCurrentDate } from '@performance-tracker/core'

// v1.3.0 (user request 2026-11-18): "a new button sitting between board and
// the reviews section on top called calendar that when clicked it shows a
// pristine and well layed out month based calendar which shows all the days
// in each month but specifically the tasks due on those specific days".
//
// A dedicated PAGE (not a popup): month grid + month/year navigation +
// today anchor. Every uncompleted task with a deadline renders as a pill on
// its due day, so the totality of dated work is visible in one place. The
// week start follows settings.weekStartsOn (1 = Monday default), exactly
// like the deadline picker and Reviews.

const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
// Indexed by Date#getDay() (0 = Sunday)
const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function calendarIso(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function pluralTasks(count) {
  return `${count} task${count !== 1 ? 's' : ''}`
}

function CalendarPage({ data }) {
  const settings = data?.settings || {}
  const rawWeekStart = Number(settings.weekStartsOn)
  const weekStartsOn = Number.isInteger(rawWeekStart) && rawWeekStart >= 0 && rawWeekStart <= 6
    ? rawWeekStart
    : 1
  const today = getCurrentDate()

  // The view opens on the current month; month/year navigation is free-form.
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1)

  // Uncompleted tasks with a valid deadline, grouped by deadline date.
  const byDeadline = useMemo(() => {
    const map = new Map()
    for (const task of data?.tasks || []) {
      if (!task || task.completion) continue
      if (typeof task.deadline !== 'string' || !ISO_DATE_RE.test(task.deadline)) continue
      const list = map.get(task.deadline)
      if (list) list.push(task)
      else map.set(task.deadline, [task])
    }
    return map
  }, [data?.tasks])

  // Summary numbers for the visible month (and overdue overall).
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  let dueInMonth = 0
  let overdue = 0
  for (const [iso, list] of byDeadline) {
    if (iso.startsWith(monthPrefix)) dueInMonth += list.length
    if (iso < today) overdue += list.length
  }
  const hasAnyDeadlines = byDeadline.size > 0

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => CALENDAR_WEEKDAYS[(weekStartsOn + i) % 7])

  // Leading blanks + days + trailing blanks, so the grid always forms
  // complete weeks.
  const cells = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const shiftMonth = (delta) => {
    setViewMonth(m => {
      const next = m + delta
      if (next < 0) {
        setViewYear(y => y - 1)
        return 11
      }
      if (next > 11) {
        setViewYear(y => y + 1)
        return 0
      }
      return next
    })
  }

  const goToday = () => {
    setViewYear(Number(today.slice(0, 4)))
    setViewMonth(Number(today.slice(5, 7)) - 1)
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <div className="calendar-nav-group">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setViewYear(y => y - 1)}
            aria-label="Previous year"
            title="Previous year"
          >
            «
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            title="Previous month"
          >
            ‹
          </button>
        </div>
        <div className="calendar-title-block">
          <h2 className="calendar-title">{CALENDAR_MONTHS[viewMonth]} {viewYear}</h2>
          <div className="calendar-subtitle-row">
            <p className="calendar-subtitle">
              {dueInMonth > 0
                ? `${pluralTasks(dueInMonth)} due in ${CALENDAR_MONTHS[viewMonth]}`
                : `No tasks due in ${CALENDAR_MONTHS[viewMonth]}`}
              {overdue > 0 && (
                <span className="calendar-subtitle-overdue"> · {pluralTasks(overdue)} overdue</span>
              )}
            </p>
            <button
              type="button"
              className="calendar-today-btn"
              onClick={goToday}
              aria-label="Go to current month"
            >
              Today
            </button>
          </div>
        </div>
        <div className="calendar-nav-group">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            title="Next month"
          >
            ›
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => setViewYear(y => y + 1)}
            aria-label="Next year"
            title="Next year"
          >
            »
          </button>
        </div>
      </div>

      {!hasAnyDeadlines && (
        <p className="calendar-empty-hint">
          No tasks have deadlines yet. Set a deadline on a task from the board
          and it will show up here on its due day.
        </p>
      )}

      <div
        className="calendar-grid"
        role="grid"
        aria-label={`${CALENDAR_MONTHS[viewMonth]} ${viewYear} task deadlines`}
      >
        {weekdayLabels.map(label => (
          <span key={label} className="calendar-weekday" aria-hidden="true">{label}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`blank-${i}`} className="calendar-day-cell off-month" aria-hidden="true" />
          }
          const iso = calendarIso(viewYear, viewMonth, day)
          const dueTasks = byDeadline.get(iso) || []
          const shown = dueTasks.slice(0, 3)
          const hiddenCount = dueTasks.length - shown.length
          const isPast = iso < today
          return (
            <div
              key={iso}
              className={`calendar-day-cell${iso === today ? ' today' : ''}`}
              data-date={iso}
            >
              <span className="calendar-day-number">{day}</span>
              {dueTasks.length > 0 && (
                <ul className="calendar-day-tasks">
                  {shown.map(task => (
                    <li
                      key={task.id}
                      className={`calendar-task-pill${isPast ? ' overdue' : ''}`}
                      title={task.text}
                    >
                      {task.text}
                    </li>
                  ))}
                  {hiddenCount > 0 && (
                    <li className="calendar-task-more">+{hiddenCount} more</li>
                  )}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarPage
