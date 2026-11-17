import { useMemo, useState, useEffect, useCallback } from 'react'
import { getCurrentDate, deadlineState, getTaskCategory } from '@performance-tracker/core'

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
//
// v1.4.0 (user request 2026-11-18): "clicking on a task in the calendar
// section should let me see information in regards of it like the category
// and the full task text etc and within the shown info there should also be
// a button that lets me go right to where it is on the board." — every pill
// is a button opening a details popup (full text, category derived from the
// task's board position, deadline state), "+N more" opens the day's full
// task list, and "Go to Board" switches to the board and scroll-flashes the
// task's row (the randomizer treatment). Read-only: the calendar never
// mutates data, so it takes no onSave.

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

// Human date for the "+N more" day list title ("Sunday, March 15, 2027").
function humanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

function CalendarPage({ data, onGoToBoard }) {
  const settings = data?.settings || {}
  const rawWeekStart = Number(settings.weekStartsOn)
  const weekStartsOn = Number.isInteger(rawWeekStart) && rawWeekStart >= 0 && rawWeekStart <= 6
    ? rawWeekStart
    : 1
  const today = getCurrentDate()

  // The view opens on the current month; month/year navigation is free-form.
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1)

  // v1.4.0: the task whose details popup is open, and the day whose full
  // task list is open (from "+N more").
  const [detailTask, setDetailTask] = useState(null)
  const [detailDay, setDetailDay] = useState(null)

  const categories = useMemo(() => data?.categories || [], [data?.categories])
  const markers = useMemo(() => data?.markers || [], [data?.markers])
  const boardItems = useMemo(() => data?.board || [], [data?.board])

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

  // v1.4.0 — category per active task, derived from board position exactly
  // like the board rows do (getTaskCategory with the task's board index):
  // nearest marker above and below must agree. The calendar can therefore
  // never show a category the board would disagree with.
  const activeCategoryLookup = useMemo(() => {
    const map = new Map()
    boardItems.forEach((item, i) => {
      if (item?.type !== 'task') return
      map.set(item.taskId, getTaskCategory(i, boardItems, markers, categories))
    })
    return map
  }, [boardItems, markers, categories])

  // Which task ids actually have a row on the board (drives the
  // "Go to Board" button — a task without a board row has nowhere to go)
  const boardTaskIds = useMemo(
    () => new Set(boardItems.filter(i => i?.type === 'task').map(i => i.taskId)),
    [boardItems]
  )

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

  const closeDetail = useCallback(() => setDetailTask(null), [])
  const closeDayList = useCallback(() => setDetailDay(null), [])

  // Escape closes the topmost popup (matches the other popups' keyboard feel)
  useEffect(() => {
    if (!detailTask && !detailDay) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (detailTask) closeDetail()
        else closeDayList()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailTask, detailDay, closeDetail, closeDayList])

  // v1.4.0 — the open task's derived details (kept next to the popup so the
  // lookup maps above stay reusable).
  const detail = detailTask
    ? (() => {
        const category = activeCategoryLookup.get(detailTask.id) || null
        const info = deadlineState(detailTask.deadline, today)
        const onBoard = boardTaskIds.has(detailTask.id)
        return { task: detailTask, category, info, onBoard }
      })()
    : null

  // v1.4.0 — the "+N more" day list content.
  const dayList = detailDay
    ? { iso: detailDay, tasks: byDeadline.get(detailDay) || [] }
    : null

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
          const isToday = iso === today
          return (
            <div
              key={iso}
              className={`calendar-day-cell${isToday ? ' today' : ''}`}
              data-date={iso}
            >
              <span className="calendar-day-number">{day}</span>
              {dueTasks.length > 0 && (
                <div className="calendar-day-tasks">
                  {shown.map(task => {
                    const category = activeCategoryLookup.get(task.id)
                    const cls = [
                      'calendar-task-pill',
                      isPast ? 'overdue' : '',
                      isToday ? 'due-today' : ''
                    ].filter(Boolean).join(' ')
                    // State colors (overdue red / due-today amber) come from
                    // the class; the category color is the accent only for
                    // ordinary days.
                    const accent = !isPast && !isToday && category?.color
                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={cls}
                        style={accent ? { borderLeftColor: accent } : undefined}
                        onClick={() => setDetailTask(task)}
                        title={String(task?.text ?? '')}
                      >
                        {String(task?.text ?? '')}
                      </button>
                    )
                  })}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="calendar-task-more"
                      onClick={() => setDetailDay(iso)}
                      aria-label={`Show all ${dueTasks.length} tasks on ${iso}`}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* v1.4.0 — "+N more" → every task of that day (each row opens the
          details popup, so no task is unreachable just because its cell
          capped at three pills) */}
      {dayList && (
        <div className="popup-overlay" onClick={closeDayList}>
          <div
            className="completion-popup calendar-day-list-popup"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Tasks on ${dayList.iso}`}
          >
            <div className="popup-header">
              <h3>{humanDate(dayList.iso)}</h3>
              <button className="close-btn" onClick={closeDayList} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="popup-content">
              {dayList.tasks.length === 0 && (
                <p className="calendar-day-list-empty">No tasks due on this day.</p>
              )}
              <div className="calendar-day-list">
                {dayList.tasks.map(task => {
                  const category = activeCategoryLookup.get(task.id)
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className="calendar-day-list-row"
                      onClick={() => {
                        closeDayList()
                        setDetailTask(task)
                      }}
                    >
                      <span
                        className="calendar-day-list-dot"
                        style={{ backgroundColor: category?.color || 'var(--text-muted)' }}
                      />
                      <span className="calendar-day-list-text">{String(task?.text ?? '')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="popup-actions">
              <button type="button" className="cancel-btn" onClick={closeDayList}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v1.4.0 — task details: full text (pills ellipsize), category,
          deadline state, and the way back to the board */}
      {detail && (
        <div className="popup-overlay" onClick={closeDetail}>
          <div
            className="completion-popup cal-detail-popup"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Task details"
          >
            <div className="popup-header">
              <h3>Task Details</h3>
              <button className="close-btn" onClick={closeDetail} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="popup-content">
              <p className="cal-detail-text">{String(detail.task.text ?? '')}</p>

              <div className="cal-detail-rows">
                <div className="cal-detail-row">
                  <span className="cal-detail-label">Category</span>
                  {detail.category ? (
                    <span
                      className="category-badge cal-detail-badge"
                      style={{ backgroundColor: detail.category.color }}
                    >
                      {detail.category.name}
                    </span>
                  ) : (
                    <span className="cal-detail-muted">No category</span>
                  )}
                </div>

                {detail.task.deadline && (
                  <div className="cal-detail-row">
                    <span className="cal-detail-label">Deadline</span>
                    {detail.info ? (
                      <span
                        className={`cal-detail-deadline${detail.info.overdue ? ' overdue' : ''}${detail.info.dueToday ? ' due-today' : ''}`}
                      >
                        {detail.task.deadline} · {detail.info.label}
                      </span>
                    ) : (
                      <span className="cal-detail-deadline">{detail.task.deadline}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="popup-actions">
              {detail.onBoard && onGoToBoard && (
                <button
                  type="button"
                  className="cal-goto-board-btn"
                  onClick={() => onGoToBoard(detail.task)}
                >
                  Go to Board
                </button>
              )}
              <button type="button" className="cancel-btn" onClick={closeDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage
