// v1.4.0 desktop batch (user request 2026-11-18):
//   - clicking a calendar task pill opens a details popup: full text,
//     category (board-position derivation) and deadline state
//   - "+N more" opens the day's full task list; rows open the details popup
//   - "Go to Board" (on-board tasks only) switches to the board, which
//     scroll-flashes the task's row — the randomizer treatment — and
//     consumes the request exactly once
//   - the category sidebar's scroll area fills the panel (the 46vh window
//     clamp is gone) and "+ Add Category" sits BELOW the scroll list
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
// The two imports below trip the renderer-hygiene no-restricted-imports
// rule — this is TEST-ONLY tooling (a static audit of the repo's own
// stylesheet, because jsdom does not apply stylesheets), never shipped
// renderer code. Same precedent as backup-rotation.test.js.
// eslint-disable-next-line no-restricted-imports -- test-only static CSS audit
import fs from 'node:fs'
// eslint-disable-next-line no-restricted-imports -- test-only static CSS audit
import path from 'node:path'
import Board from '../components/Board'
import CalendarPage from '../components/CalendarPage'
import App from '../App'
import { getCurrentDate } from '@performance-tracker/core'

afterEach(cleanup)

// jsdom has no scrollIntoView — stub it once for every test in this file
// (Board's focus effect and the randomizer both call it).
const scrollIntoView = vi.fn()
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView
})
afterAll(() => {
  delete Element.prototype.scrollIntoView
})

// ---- fixtures (same shape as the v1.1.0–v1.3.0 feature tests) -------------

const difficulties = [
  { id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
  { id: 'd2', label: 'Hard', score: 3, color: '#f87171', order: 1, active: true }
]
const categories = [
  { id: 'c-high', name: 'High', color: '#60a5fa', order: 0, active: true, priorityMultiplier: 2 },
  { id: 'c-low', name: 'Low', color: '#4ade80', order: 1, active: true, priorityMultiplier: 0.5 }
]
// m1 + m2 sandwich t1 with the SAME category (High) — the strict rule gives
// t1 that category. m2/m3 sandwich t2 with different categories → none.
const markers = [
  { id: 'm1', categoryId: 'c-high' },
  { id: 'm2', categoryId: 'c-high' },
  { id: 'm3', categoryId: 'c-low' }
]
const board = [
  { type: 'marker', markerId: 'm1' },
  { type: 'task', taskId: 't1' },
  { type: 'marker', markerId: 'm2' },
  { type: 'task', taskId: 't2' },
  { type: 'marker', markerId: 'm3' }
]

const today = getCurrentDate()

function task(id, text, extra = {}) {
  return {
    id,
    text,
    createdAt: '2026-11-01T10:00:00.000Z',
    completion: null,
    ...extra
  }
}

// All deadline tasks are due TODAY so the fixtures are date-robust (no
// dependence on where "tomorrow" or "yesterday" lands in the month).
const tasks = [
  task('t1', 'Categorized task with a deadline', { deadline: today }),
  task('t2', 'Uncategorized task with a deadline', { deadline: today }),
  task('t3', 'Off-board task with a deadline', { deadline: today })
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

function todayCell() {
  return document.querySelector(`.calendar-day-cell[data-date="${today}"]`)
}

// ---- Calendar task details popup --------------------------------------------

describe('Calendar task details (v1.4.0)', () => {
  it('opens on pill click with the full text, category and deadline state', () => {
    render(<CalendarPage data={makeData()} />)
    const cell = todayCell()
    expect(cell).toBeTruthy()
    // today's pill carries the due-today style
    const pill = within(cell).getByText('Categorized task with a deadline')
    expect(pill.className).toContain('due-today')

    fireEvent.click(pill)

    const dialog = screen.getByRole('dialog', { name: 'Task details' })
    expect(within(dialog).getByText('Categorized task with a deadline')).toBeTruthy()
    // category derived from board position (High markers above AND below t1)
    expect(within(dialog).getByText('High')).toBeTruthy()
    // deadline state
    expect(within(dialog).getByText(`${today} · due today`)).toBeTruthy()
  })

  it('shows "No category" when the markers around the task disagree', () => {
    render(<CalendarPage data={makeData()} />)
    fireEvent.click(within(todayCell()).getByText('Uncategorized task with a deadline'))
    const dialog = screen.getByRole('dialog', { name: 'Task details' })
    expect(within(dialog).getByText('No category')).toBeTruthy()
  })

  it('shows the overdue state for a task from a past month', () => {
    // same month/day six years back — date-robust and always reachable
    // with the year navigation buttons alone (no month drift)
    const pastIso = `${Number(today.slice(0, 4)) - 6}-${today.slice(5)}`
    const past = [
      task('t-old', 'Ancient overdue task', { deadline: pastIso })
    ]
    render(<CalendarPage data={makeData({ tasks: past })} />)
    // jump back six years with the year button («)
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    }
    const cell = document.querySelector(`.calendar-day-cell[data-date="${pastIso}"]`)
    expect(cell).toBeTruthy()
    const pill = within(cell).getByText('Ancient overdue task')
    expect(pill.className).toContain('overdue')
    fireEvent.click(pill)
    const dialog = screen.getByRole('dialog', { name: 'Task details' })
    expect(within(dialog).getByText(/overdue$/)).toBeTruthy()
  })

  it('closes on Escape', () => {
    render(<CalendarPage data={makeData()} />)
    fireEvent.click(within(todayCell()).getByText('Categorized task with a deadline'))
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Task details' })).toBeNull()
  })
})

// ---- Go to Board ------------------------------------------------------------

describe('Calendar "Go to Board" (v1.4.0)', () => {
  it('calls onGoToBoard with the task — on-board tasks only', () => {
    const onGoToBoard = vi.fn()
    render(<CalendarPage data={makeData()} onGoToBoard={onGoToBoard} />)

    // off-board task: details open, but NO button (nothing to go to)
    fireEvent.click(within(todayCell()).getByText('Off-board task with a deadline'))
    let dialog = screen.getByRole('dialog', { name: 'Task details' })
    expect(within(dialog).queryByText('Go to Board')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })

    // on-board task: the button hands the task object up
    fireEvent.click(within(todayCell()).getByText('Categorized task with a deadline'))
    dialog = screen.getByRole('dialog', { name: 'Task details' })
    fireEvent.click(within(dialog).getByText('Go to Board'))
    expect(onGoToBoard).toHaveBeenCalledTimes(1)
    expect(onGoToBoard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', text: 'Categorized task with a deadline' })
    )
  })

  it('Board scroll-flashes the requested row and consumes the request once', () => {
    const handled = vi.fn()
    const first = { taskId: 't1', nonce: 1 }
    const { rerender } = render(
      <Board data={makeData()} onSave={() => {}} focusRequest={first} onFocusHandled={handled} />
    )
    expect(handled).toHaveBeenCalledTimes(1)
    const row = document.querySelector('[data-board-item-id="t1"]')
    expect(row).toBeTruthy()
    expect(row.classList.contains('random-flash')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[scrollIntoView.mock.instances.length - 1]).toBe(row)

    // same request object again → nothing refires
    rerender(
      <Board data={makeData()} onSave={() => {}} focusRequest={first} onFocusHandled={handled} />
    )
    expect(handled).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // a NEW request (new nonce) scrolls and flashes again
    rerender(
      <Board data={makeData()} onSave={() => {}} focusRequest={{ taskId: 't2', nonce: 2 }} onFocusHandled={handled} />
    )
    expect(handled).toHaveBeenCalledTimes(2)
    const row2 = document.querySelector('[data-board-item-id="t2"]')
    expect(row2.classList.contains('random-flash')).toBe(true)
  })

  it('consumes a request for a task with no row silently (no crash)', () => {
    const handled = vi.fn()
    render(
      <Board
        data={makeData()}
        onSave={() => {}}
        focusRequest={{ taskId: 'does-not-exist', nonce: 1 }}
        onFocusHandled={handled}
      />
    )
    expect(handled).toHaveBeenCalledTimes(1)
  })

  it('App integration: Calendar → Go to Board switches the view and flashes the row', async () => {
    const mockApi = makeApi(makeData())
    vi.stubGlobal('api', mockApi)
    render(<App />)
    await screen.findByRole('button', { name: 'Calendar' })
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    fireEvent.click(within(todayCell()).getByText('Categorized task with a deadline'))
    fireEvent.click(screen.getByText('Go to Board'))

    // the board view is back and the task's row carries the flash
    const row = await waitFor(() => {
      const el = document.querySelector('[data-board-item-id="t1"]')
      expect(el).toBeTruthy()
      return el
    })
    expect(row.classList.contains('random-flash')).toBe(true)
    expect(screen.getByPlaceholderText('Type a task and press Enter...')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})

// ---- "+N more" day list ------------------------------------------------------

describe('Calendar day list (v1.4.0)', () => {
  it('lists every task of the day; rows open the details popup', () => {
    const many = [
      task('t1', 'Task one', { deadline: today }),
      task('t2', 'Task two', { deadline: today }),
      task('t3', 'Task three', { deadline: today }),
      task('t4', 'Task four', { deadline: today }),
      task('t5', 'Task five', { deadline: today })
    ]
    render(<CalendarPage data={makeData({ tasks: many })} />)
    const cell = todayCell()
    // three pills + overflow
    expect(within(cell).getAllByText(/^Task /).length).toBe(3)
    const more = within(cell).getByText('+2 more')
    expect(more).toBeTruthy()

    fireEvent.click(more)
    const list = screen.getByRole('dialog', { name: `Tasks on ${today}` })
    // every task of the day is reachable, including the capped ones
    for (const text of ['Task one', 'Task two', 'Task three', 'Task four', 'Task five']) {
      expect(within(list).getByText(text)).toBeTruthy()
    }

    fireEvent.click(within(list).getByText('Task four'))
    const dialog = screen.getByRole('dialog', { name: 'Task details' })
    expect(within(dialog).getByText('Task four')).toBeTruthy()
  })

  it('closes on Escape', () => {
    const many = [
      task('t1', 'Task one', { deadline: today }),
      task('t2', 'Task two', { deadline: today }),
      task('t3', 'Task three', { deadline: today }),
      task('t4', 'Task four', { deadline: today })
    ]
    render(<CalendarPage data={makeData({ tasks: many })} />)
    fireEvent.click(within(todayCell()).getByText('+1 more'))
    expect(screen.getByRole('dialog', { name: `Tasks on ${today}` })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: `Tasks on ${today}` })).toBeNull()
  })
})

// ---- Category sidebar height (the 46vh clamp removal) -----------------------

describe('Category sidebar height (v1.4.0)', () => {
  it('the scroll list is no longer clamped to a window fraction', () => {
    const manyCategories = Array.from({ length: 16 }, (_, i) => ({
      id: `c-${i}`,
      name: `Category number ${i}`,
      color: '#60a5fa',
      order: i,
      active: true
    }))
    render(<Board data={makeData({ categories: manyCategories })} onSave={() => {}} />)
    const list = document.querySelector('.categories-scroll')
    expect(list).toBeTruthy()
    // all 16 chips are inside the scroll list, one per row
    expect(list.querySelectorAll(':scope > .category-chip').length).toBe(16)

    // jsdom does not apply stylesheets, so the height policy is audited
    // statically: the .categories-scroll rule must size by flex (fill the
    // panel) and must NOT carry the old max-height: 46vh window clamp
    // (the "compressed content" root cause).
    // eslint-disable-next-line no-undef -- vitest runs in Node; test tooling only
    const cssPath = path.join(process.cwd(), 'src', 'components', 'components.css')
    const css = fs.readFileSync(cssPath, 'utf8')
    const block = css.slice(css.indexOf('.categories-scroll {'))
    // strip comments — the rule documents the REMOVED clamp in prose
    const body = block.slice(0, block.indexOf('}')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).toContain('flex: 1')
    expect(body).toContain('min-height: 0')
    expect(body).not.toMatch(/max-height\s*:/)
  })

  it('"+ Add Category" sits BELOW the scroll list, always reachable', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const scroll = document.querySelector('.categories-scroll')
    const addArea = document.querySelector('.categories-add')
    expect(addArea).toBeTruthy()
    expect(within(addArea).getByText('+ Add Category')).toBeTruthy()
    // the add area is a sibling AFTER the scroll list (not inside it)
    expect(addArea.parentElement).toBe(scroll.parentElement)
    expect(
      Array.from(scroll.parentElement.children).indexOf(addArea)
    ).toBeGreaterThan(
      Array.from(scroll.parentElement.children).indexOf(scroll)
    )
  })
})
