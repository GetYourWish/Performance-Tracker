// v1.3.0 desktop batch (user follow-up 2026-11-18):
//   - categories stack VERTICALLY (one per row) inside a scrollable card
//   - the collapse toggle slides the WHOLE right panel to the side (48px
//     strip with the expand toggle + Randomizer icon) — covered in the
//     revised v1.2.0 suite; here we assert the vertical list it reveals
//   - the in-app minimize window button is GONE (next to Working On)
//   - new Calendar page between Board and Reviews: month grid with the
//     tasks due on each day, month/year navigation
//   - in-app deadline toasts (bottom-right): close button + auto-dismiss
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import Board from '../components/Board'
import CalendarPage from '../components/CalendarPage'
import App from '../App'
import { DeadlineToastStack } from '../components/DeadlineToast'
import { getCurrentDate } from '@performance-tracker/core'

afterEach(cleanup)

// ---- fixtures (same shape as the v1.1.0/v1.2.0 feature tests) -------------

const difficulties = [
  { id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
  { id: 'd2', label: 'Hard', score: 3, color: '#f87171', order: 1, active: true }
]
const categories = [
  { id: 'c-high', name: 'High', color: '#60a5fa', order: 0, active: true, priorityMultiplier: 2 },
  { id: 'c-low', name: 'Low', color: '#4ade80', order: 1, active: true, priorityMultiplier: 0.5 }
]
const markers = [
  { id: 'm1', categoryId: 'c-high' },
  { id: 'm2', categoryId: 'c-low' }
]
const board = [
  { type: 'marker', markerId: 'm1' },
  { type: 'task', taskId: 't1' },
  { type: 'marker', markerId: 'm2' },
  { type: 'task', taskId: 't2' }
]
const tasks = [
  { id: 't1', text: 'High priority task', createdAt: '2026-11-01T10:00:00.000Z', completion: null },
  { id: 't2', text: 'Low priority task', createdAt: '2026-11-02T10:00:00.000Z', completion: null }
]

function makeData(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
    settings: { theme: 'dark', weekStartsOn: 1, fatigueIncrement: 0.1, fatigueCap: 3 },
    difficulties,
    categories,
    markers,
    board,
    tasks,
    workingOn: [],
    logs: [],
    ...overrides
  }
}

function makeApi(loadedData) {
  return {
    getAppState: vi.fn().mockResolvedValue({ dataPath: 'C:/data/tracker.json' }),
    loadData: vi.fn().mockResolvedValue(loadedData),
    getWatcherEnabled: vi.fn().mockResolvedValue(true),
    checkConflicts: vi.fn().mockResolvedValue([]),
    onExternalChange: vi.fn(() => () => {}),
    saveData: vi.fn().mockResolvedValue({})
  }
}

// ---- Categories: vertical stack + scrolling ---------------------------------

describe('Categories vertical stack (v1.3.0)', () => {
  it('renders the categories inside a VERTICAL, scrollable list', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const list = document.querySelector('.categories-list')
    expect(list).toBeTruthy()
    // the v1.3.0 vertical/scroll modifiers are on the list
    expect(list.className).toContain('categories-scroll')
    expect(list.className).toContain('vertical')
    // chips are direct children of the list, one per category
    const chips = list.querySelectorAll(':scope > .category-chip')
    expect(chips.length).toBe(2)
    expect(within(chips[0]).getByText('High')).toBeTruthy()
    expect(within(chips[1]).getByText('Low')).toBeTruthy()
  })

  it('stacks one category per row — a third category lands below the second', () => {
    const three = [...categories, { id: 'c-mid', name: 'Middle', color: '#fbbf24', order: 2, active: true }]
    render(<Board data={makeData({ categories: three })} onSave={() => {}} />)
    const list = document.querySelector('.categories-list')
    const chips = list.querySelectorAll(':scope > .category-chip')
    expect(chips.length).toBe(3)
    // sorted by priorityMultiplier desc: High (2), Middle (default 1), Low (0.5)
    expect(chips[0].textContent).toContain('High')
    expect(chips[1].textContent).toContain('Middle')
    expect(chips[2].textContent).toContain('Low')
  })
})

// ---- Minimize window button: removed ----------------------------------------

describe('Minimize window button removed (v1.3.0)', () => {
  it('no longer renders in the top nav next to Working On', async () => {
    const mockApi = makeApi(makeData())
    vi.stubGlobal('api', mockApi)
    render(<App />)
    await screen.findByRole('button', { name: /working on: none/i })
    expect(screen.queryByRole('button', { name: 'Minimize window' })).toBeNull()
    vi.unstubAllGlobals()
  })
})

// ---- Calendar page ----------------------------------------------------------

describe('Calendar page (v1.3.0)', () => {
  const today = getCurrentDate()
  // a date guaranteed to be in the future for the fixture
  const futureIso = `${Number(today.slice(0, 4)) + 1}-03-15`
  const calendarTasks = [
    { id: 't1', text: 'Due today task', createdAt: '2026-11-01T10:00:00.000Z', completion: null, deadline: today },
    { id: 't2', text: 'Future deadline task', createdAt: '2026-11-02T10:00:00.000Z', completion: null, deadline: futureIso },
    { id: 't3', text: 'Completed with deadline', createdAt: '2026-11-03T10:00:00.000Z', completion: { completedDate: today, completedAt: today, difficultyId: 'd1', categoryId: null, note: '' }, deadline: today },
    { id: 't4', text: 'No deadline task', createdAt: '2026-11-04T10:00:00.000Z', completion: null }
  ]

  it('renders the Calendar nav button between Board and Reviews', async () => {
    const mockApi = makeApi(makeData())
    vi.stubGlobal('api', mockApi)
    render(<App />)
    await screen.findByRole('button', { name: /working on: none/i })
    const labels = Array.from(document.querySelectorAll('.nav-item')).map(b => b.textContent)
    expect(labels).toEqual(['Board', 'Calendar', 'Reviews', 'Settings'])
    vi.unstubAllGlobals()
  })

  it('opens as a dedicated page with the current month and today highlighted', async () => {
    const mockApi = makeApi(makeData({ tasks: calendarTasks }))
    vi.stubGlobal('api', mockApi)
    render(<App />)
    // note: t1 is due today, so the automation auto-adds it to Working On on
    // load — wait for the nav to settle, then switch to the Calendar page
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }))

    // month name + year are displayed (current month)
    const now = new Date()
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    expect(screen.getByText(`${monthNames[now.getMonth()]} ${now.getFullYear()}`)).toBeTruthy()

    // today's cell carries the today marker and the due task pill
    const todayCell = document.querySelector(`.calendar-day-cell[data-date="${today}"]`)
    expect(todayCell).toBeTruthy()
    expect(todayCell.className).toContain('today')
    expect(within(todayCell).getByText('Due today task')).toBeTruthy()

    // the completed task with a deadline does NOT appear
    expect(screen.queryByText('Completed with deadline')).toBeNull()
    // the task without a deadline does not appear either
    expect(screen.queryByText('No deadline task')).toBeNull()

    // summary counts only the uncompleted deadline task of this month
    expect(screen.getByText(/1 task due in/)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('navigates months and years, and Today jumps back', () => {
    const now = new Date()
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    render(<CalendarPage data={makeData({ tasks: calendarTasks })} />)

    // next month
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    expect(screen.getByText(`${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`)).toBeTruthy()

    // next year (double arrow)
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    expect(screen.getByText(`${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear() + 1}`)).toBeTruthy()

    // previous year
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByText(`${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`)).toBeTruthy()

    // Today jumps back to the current month
    fireEvent.click(screen.getByRole('button', { name: 'Go to current month' }))
    expect(screen.getByText(`${monthNames[now.getMonth()]} ${now.getFullYear()}`)).toBeTruthy()
  })

  it('follows the weekStartsOn setting for the weekday header order', () => {
    render(<CalendarPage data={makeData()} />)
    const first = document.querySelector('.calendar-weekday')
    expect(first.textContent).toBe('Mon') // default weekStartsOn = 1

    cleanup()
    render(
      <CalendarPage
        data={makeData({ settings: { theme: 'dark', weekStartsOn: 0, fatigueIncrement: 0.1, fatigueCap: 3 } })}
      />
    )
    expect(document.querySelector('.calendar-weekday').textContent).toBe('Sun')
  })

  it('shows a hint when no tasks have deadlines', () => {
    render(<CalendarPage data={makeData()} />)
    expect(screen.getByText(/No tasks have deadlines yet/i)).toBeTruthy()
  })

  it('shows the future-deadline task on its day in that month', () => {
    render(<CalendarPage data={makeData({ tasks: calendarTasks })} />)
    // navigate month by month until the title shows March of the target year
    // (the future fixture lives there); it is always ahead of the current month
    const targetYear = Number(today.slice(0, 4)) + 1
    for (let guard = 0; guard < 24; guard++) {
      const title = document.querySelector('.calendar-title').textContent
      if (title === `March ${targetYear}`) break
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    }
    expect(document.querySelector('.calendar-title').textContent).toBe(`March ${targetYear}`)
    const cell = document.querySelector(`.calendar-day-cell[data-date="${futureIso}"]`)
    expect(cell).toBeTruthy()
    expect(within(cell).getByText('Future deadline task')).toBeTruthy()
  })
})

// ---- Deadline toasts (in-app, bottom-right) ---------------------------------

describe('Deadline toasts (v1.3.0)', () => {
  it('appear when a due task auto-joins Working On on load', async () => {
    const today = getCurrentDate()
    const dueData = makeData({
      tasks: tasks.map(t => (t.id === 't2' ? { ...t, deadline: today } : t))
    })
    const mockApi = makeApi(dueData)
    vi.stubGlobal('api', mockApi)
    render(<App />)

    await waitFor(() => expect(document.querySelector('.deadline-toast')).toBeTruthy())
    const toast = document.querySelector('.deadline-toast')
    expect(toast.textContent).toContain('Deadline reached')
    expect(toast.textContent).toContain('Low priority task')
    expect(toast.textContent).toContain('added to Working On')

    // the working-on marker reflects the auto-add too
    expect(await screen.findByRole('button', { name: /working on 1 task/i })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('has a close button that dismisses the toast', async () => {
    const today = getCurrentDate()
    const dueData = makeData({
      tasks: tasks.map(t => (t.id === 't2' ? { ...t, deadline: today } : t))
    })
    const mockApi = makeApi(dueData)
    vi.stubGlobal('api', mockApi)
    render(<App />)

    await waitFor(() => expect(document.querySelector('.deadline-toast')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(document.querySelector('.deadline-toast')).toBeNull())
    vi.unstubAllGlobals()
  })
})

describe('DeadlineToastStack component (v1.3.0)', () => {
  const toast = { id: 'toast-1', taskId: 't1', text: 'Some task' }

  it('auto-dismisses after 8 seconds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const onDismiss = vi.fn()
    render(
      <DeadlineToastStack
        toasts={[toast]}
        onDismiss={onDismiss}
        onOpenWorkingOn={() => {}}
      />
    )
    expect(screen.getByRole('status')).toBeTruthy()
    vi.advanceTimersByTime(7999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('pauses auto-dismiss on hover and resumes on leave', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const onDismiss = vi.fn()
    render(
      <DeadlineToastStack
        toasts={[toast]}
        onDismiss={onDismiss}
        onOpenWorkingOn={() => {}}
      />
    )
    const card = screen.getByRole('status')
    fireEvent.mouseEnter(card)
    vi.advanceTimersByTime(20000)
    expect(onDismiss).not.toHaveBeenCalled() // paused — does not stick-dismiss

    fireEvent.mouseLeave(card)
    vi.advanceTimersByTime(7999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledTimes(1) // resumed countdown finished
    vi.useRealTimers()
  })

  it('opens the Working On popup when the body is clicked', () => {
    const onOpenWorkingOn = vi.fn()
    render(
      <DeadlineToastStack
        toasts={[toast]}
        onDismiss={() => {}}
        onOpenWorkingOn={onOpenWorkingOn}
      />
    )
    // the toast BODY is the clickable area (text + hint form its label)
    fireEvent.click(screen.getByRole('button', { name: /Some task/i }))
    expect(onOpenWorkingOn).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when there are no toasts', () => {
    render(
      <DeadlineToastStack toasts={[]} onDismiss={() => {}} onOpenWorkingOn={() => {}} />
    )
    expect(document.querySelector('.deadline-toast-stack')).toBeNull()
    expect(document.querySelector('.deadline-toast')).toBeNull()
  })
})
