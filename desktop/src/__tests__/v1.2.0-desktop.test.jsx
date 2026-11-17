// v1.2.0 desktop batch (user request 2026-11-18):
//   - the sidebar gets a navigation-bar row (Randomizer + collapse toggle) at
//     the TOP of the categories area; the categories card collapses
//     VERTICALLY under it (the old horizontal panel slide is gone)
//   - the Working On button always renders, greyed out when nothing is being
//     worked on
//   - the deadline editor shows a real month-grid calendar
//   - a task whose deadline day is reached joins workingOn automatically
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import Board from '../components/Board'
import App from '../App'
import { WorkingOnMarker } from '../components/WorkingOnMarker'
import { getCurrentDate } from '@performance-tracker/core'

afterEach(cleanup)

// ---- fixtures (same shape as the v1.1.0 feature tests) ---------------------

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
  { id: 'm2', categoryId: 'c-high' },
  { id: 'm3', categoryId: 'c-low' },
  { id: 'm4', categoryId: 'c-low' }
]
const board = [
  { type: 'marker', markerId: 'm1' },
  { type: 'task', taskId: 't1' },
  { type: 'marker', markerId: 'm2' },
  { type: 'marker', markerId: 'm3' },
  { type: 'task', taskId: 't2' },
  { type: 'marker', markerId: 'm4' },
  { type: 'task', taskId: 't3' }
]
const tasks = [
  { id: 't1', text: 'High priority task', createdAt: '2026-11-01T10:00:00.000Z', completion: null },
  { id: 't2', text: 'Low priority task', createdAt: '2026-11-02T10:00:00.000Z', completion: null },
  { id: 't3', text: 'Uncategorized task', createdAt: '2026-11-03T10:00:00.000Z', completion: null }
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

// ---- Working On button: always visible, greyed when empty ------------------

describe('WorkingOnMarker always visible (v1.2.0)', () => {
  it('renders greyed out and disabled when nothing is being worked on', () => {
    render(<WorkingOnMarker data={{ workingOn: [], tasks }} onOpenPopup={() => {}} />)
    const btn = screen.getByRole('button', { name: /working on: none/i })
    expect(btn.className).toContain('empty')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toContain('Working On')
    expect(btn.textContent).toContain('0')
  })

  it('renders active and opens the popup when tasks are being worked on', () => {
    const onOpenPopup = vi.fn()
    render(
      <WorkingOnMarker
        data={{ workingOn: ['t1', 't2'], tasks }}
        onOpenPopup={onOpenPopup}
      />
    )
    const btn = screen.getByRole('button', { name: /working on 2 tasks/i })
    expect(btn.className).not.toContain('empty')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onOpenPopup).toHaveBeenCalledTimes(1)
  })
})

// ---- Sidebar: nav-bar row + vertical collapse -------------------------------

describe('Board sidebar nav row + vertical collapse (v1.2.0)', () => {
  it('renders the nav row (Randomizer + toggle) ABOVE the categories card', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const panel = document.querySelector('.board-right-panel')
    expect(panel).toBeTruthy()
    // the nav row is the FIRST child of the panel, the categories card second
    expect(panel.children[0].className).toContain('sidebar-nav')
    expect(panel.children[1].className).toContain('board-sidebar')
    const nav = panel.children[0]
    expect(within(nav).getByRole('button', { name: 'Randomizer' })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: 'Collapse categories' })).toBeTruthy()
  })

  it('collapses the categories card VERTICALLY — the card hides, the nav row stays', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const card = document.querySelector('.board-sidebar')
    expect(card.className).not.toContain('collapsed')
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse categories' }))
    expect(card.className).toContain('collapsed')
    // nav row stays usable in both states
    expect(screen.getByRole('button', { name: 'Randomizer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand categories' })).toBeTruthy()
    // collapsed content is hidden from the accessibility tree
    expect(screen.queryByRole('heading', { name: 'Categories' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand categories' }))
    expect(card.className).not.toContain('collapsed')
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeTruthy()
  })

  it('keeps the panel a fixed column — no horizontal-slide collapsed strip', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const panel = document.querySelector('.board-right-panel')
    expect(panel.className).not.toContain('collapsed')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse categories' }))
    // the PANEL itself never collapses; only the card inside does
    expect(panel.className).not.toContain('collapsed')
    expect(document.querySelector('.board-right-panel.collapsed')).toBeNull()
    expect(document.querySelector('.sidebar-icon-btn')).toBeNull()
  })
})

// ---- Deadline editor: month-grid calendar ------------------------------------

describe('Deadline editor calendar (v1.2.0)', () => {
  const openEditor = () => {
    const row = screen.getByRole('listitem', { name: 'Task: Uncategorized task' })
    fireEvent.click(within(row).getByRole('button', { name: 'Set deadline' }))
    return screen.getByRole('grid', { name: 'Deadline calendar' })
  }

  it('shows a calendar with weekday headers and today highlighted', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const grid = openEditor()
    // opens on the current month, so today's date is a reachable cell
    const today = getCurrentDate()
    expect(within(grid).getByRole('button', { name: today })).toBeTruthy()
    // default week start is Monday (settings.weekStartsOn = 1)
    const firstWeekday = grid.querySelector('.deadline-calendar-weekday')
    expect(firstWeekday.textContent).toBe('Mon')
  })

  it('follows the weekStartsOn setting (Sunday-first when set to 0)', () => {
    render(
      <Board
        data={makeData({ settings: { theme: 'dark', weekStartsOn: 0, fatigueIncrement: 0.1, fatigueCap: 3 } })}
        onSave={() => {}}
      />
    )
    const grid = openEditor()
    expect(grid.querySelector('.deadline-calendar-weekday').textContent).toBe('Sun')
  })

  it('selects a day, shows it as selected, and saves it', () => {
    const onSave = vi.fn()
    render(<Board data={makeData()} onSave={onSave} />)
    const grid = openEditor()

    const today = getCurrentDate()
    fireEvent.click(within(grid).getByRole('button', { name: today }))
    expect(screen.getByText(/Selected:/).textContent).toContain(today)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].tasks.find(t => t.id === 't3').deadline).toBe(today)
  })
})

// ---- Deadline auto-add (App-level integration of core applyDueDeadlines) ----

describe('App deadline auto-add (v1.2.0)', () => {
  it('adds a task whose deadline day is reached to workingOn on load', async () => {
    const today = getCurrentDate()
    const dueData = makeData({
      tasks: tasks.map(t => (t.id === 't3' ? { ...t, deadline: today } : t))
    })
    const mockApi = {
      getAppState: vi.fn().mockResolvedValue({ dataPath: 'C:/data/tracker.json' }),
      loadData: vi.fn().mockResolvedValue(dueData),
      getWatcherEnabled: vi.fn().mockResolvedValue(true),
      checkConflicts: vi.fn().mockResolvedValue([]),
      minimizeWindow: vi.fn().mockResolvedValue(true),
      onExternalChange: vi.fn(() => () => {}),
      saveData: vi.fn().mockResolvedValue({})
    }
    vi.stubGlobal('api', mockApi)
    render(<App />)

    await waitFor(() => expect(mockApi.saveData).toHaveBeenCalled(), { timeout: 2000 })
    const saved = mockApi.saveData.mock.calls[0][0]
    expect(saved.workingOn).toContain('t3')
    expect(saved.tasks.find(t => t.id === 't3').deadlineAutoAdded).toBe(today)

    // the UI reflects it: the Working On button shows 1 task
    const marker = await screen.findByRole('button', { name: /working on 1 task/i })
    expect(marker.className).not.toContain('empty')
    vi.unstubAllGlobals()
  })
})
