// v1.1.0 feature tests — the user-requested behaviors from 2026-11-17:
//   R1  clear-all Working On button
//   R3  working-on ordering by category priority
//   R5  deadlines (chips, editor)
//   R7  threads (#N continuation below the source task)
//   R8  recurring editor (Settings ▸ Categories)
//   R10 info bubble in the categories sidebar, minimize button in the nav
//   R11 category note popup renders through a portal (embed fix)
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import Board from '../components/Board'
import { WorkingOnPopup } from '../components/WorkingOnMarker'
import Settings from '../components/Settings'
import Reviews from '../components/Reviews'
import App from '../App'
import { getCurrentDate } from '@performance-tracker/core'

afterEach(cleanup)

// ---- fixtures -------------------------------------------------------------

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
// strict category rule: t1 between m1/m2 (High), t2 between m3/m4 (Low),
// t3 unclosed (after m4, no marker below).
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

// ---- R1 + R3: WorkingOnPopup clear-all and priority ordering ---------------

describe('WorkingOnPopup (R1 clear-all, R3 priority order, R5 deadline chips)', () => {
  it('sorts tasks by category priority, not insertion time', () => {
    render(
      <WorkingOnPopup
        // insertion order: low (t2), uncategorized (t3), high (t1)
        tasks={[tasks[1], tasks[2], tasks[0]]}
        boardItems={board}
        markers={markers}
        categories={categories}
        difficulties={difficulties}
        onClose={() => {}}
        onClearAll={() => {}}
        onCompleteTask={() => {}}
      />
    )
    const texts = screen.getAllByText(/priority task|Uncategorized task/)
      .map(el => el.textContent)
    // High (×2) first, then Low (×0.5), uncategorized last
    expect(texts.indexOf('High priority task')).toBeLessThan(texts.indexOf('Low priority task'))
    expect(texts.indexOf('Low priority task')).toBeLessThan(texts.indexOf('Uncategorized task'))
  })

  it('shows a Clear All button that deselects everything via onClearAll', () => {
    const onClearAll = vi.fn()
    render(
      <WorkingOnPopup
        tasks={[tasks[0], tasks[1]]}
        boardItems={board}
        markers={markers}
        categories={categories}
        difficulties={difficulties}
        onClose={() => {}}
        onClearAll={onClearAll}
        onCompleteTask={() => {}}
      />
    )
    const clearBtn = screen.getByRole('button', { name: /clear all/i })
    expect(clearBtn).not.toBeDisabled()
    fireEvent.click(clearBtn)
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('disables Clear All and Export Image when the list is empty', () => {
    render(
      <WorkingOnPopup
        tasks={[]}
        boardItems={board}
        markers={markers}
        categories={categories}
        difficulties={difficulties}
        onClose={() => {}}
        onClearAll={() => {}}
        onCompleteTask={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /export image/i })).toBeDisabled()
  })

  it('renders overdue and future deadline chips', () => {
    const withDeadlines = [
      { ...tasks[0], deadline: '2020-01-01' }, // long overdue
      { ...tasks[1], deadline: '2999-12-31' }  // far future
    ]
    render(
      <WorkingOnPopup
        tasks={withDeadlines}
        boardItems={board}
        markers={markers}
        categories={categories}
        difficulties={difficulties}
        onClose={() => {}}
        onClearAll={() => {}}
        onCompleteTask={() => {}}
      />
    )
    const overdue = screen.getByText(/overdue/i)
    expect(overdue.className).toContain('overdue')
    expect(screen.getByText(/in \d+d/i)).toBeTruthy()
  })
})

// ---- R7 + R5 + R11: Board rows ----------------------------------------------

describe('Board (R7 threads, R5 deadlines, R10/R11 sidebar)', () => {
  it('thread button creates a "#2" continuation directly below the source task', () => {
    const onSave = vi.fn()
    render(<Board data={makeData()} onSave={onSave} />)

    const row = screen.getByRole('listitem', { name: 'Task: High priority task' })
    const threadBtn = within(row).getByRole('button', { name: /continue this task in a thread/i })
    fireEvent.click(threadBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    const next = onSave.mock.calls[0][0]
    const created = next.tasks.find(t => t.id !== 't1' && t.id !== 't2' && t.id !== 't3')
    expect(created.text).toBe('High priority task #2')
    expect(created.threadOf).toBe('t1')
    // inserted directly below t1 on the board
    const t1Index = next.board.findIndex(i => i.type === 'task' && i.taskId === 't1')
    expect(next.board[t1Index + 1]).toEqual({ type: 'task', taskId: created.id })
  })

  it('thread numbering continues across existing members', () => {
    const data = makeData({
      board: [
        { type: 'marker', markerId: 'm1' },
        { type: 'task', taskId: 't1' },
        { type: 'task', taskId: 't1b' },
        { type: 'marker', markerId: 'm2' },
        { type: 'marker', markerId: 'm3' },
        { type: 'task', taskId: 't2' },
        { type: 'marker', markerId: 'm4' },
        { type: 'task', taskId: 't3' }
      ],
      tasks: [
        ...tasks,
        { id: 't1b', text: 'High priority task #2', createdAt: '2026-11-01T11:00:00.000Z', completion: null, threadOf: 't1' }
      ]
    })
    const onSave = vi.fn()
    render(<Board data={data} onSave={onSave} />)

    const row = screen.getByRole('listitem', { name: 'Task: High priority task #2' })
    fireEvent.click(within(row).getByRole('button', { name: /continue this task in a thread/i }))

    const next = onSave.mock.calls[0][0]
    const created = next.tasks[next.tasks.length - 1]
    expect(created.text).toBe('High priority task #3')
    expect(created.threadOf).toBe('t1b')
  })

  it('renders the thread badge on continuation rows only', () => {
    const data = makeData({
      board: [
        { type: 'marker', markerId: 'm1' },
        { type: 'task', taskId: 't1' },
        { type: 'task', taskId: 't1b' },
        { type: 'marker', markerId: 'm2' },
        { type: 'marker', markerId: 'm3' },
        { type: 'task', taskId: 't2' },
        { type: 'marker', markerId: 'm4' },
        { type: 'task', taskId: 't3' }
      ],
      tasks: [
        ...tasks,
        { id: 't1b', text: 'High priority task #2', createdAt: '2026-11-01T11:00:00.000Z', completion: null, threadOf: 't1' }
      ]
    })
    render(<Board data={data} onSave={() => {}} />)
    const continuationRow = screen.getByRole('listitem', { name: 'Task: High priority task #2' })
    expect(within(continuationRow).getAllByLabelText('Thread task').length).toBe(1)
    const plainRow = screen.getByRole('listitem', { name: 'Task: Uncategorized task' })
    expect(within(plainRow).queryByLabelText('Thread task')).toBeNull()
  })

  it('deadline editor sets a deadline on the task', () => {
    const onSave = vi.fn()
    render(<Board data={makeData()} onSave={onSave} />)

    const row = screen.getByRole('listitem', { name: 'Task: Uncategorized task' })
    fireEvent.click(within(row).getByRole('button', { name: 'Set deadline' }))

    // v1.2.0: the editor shows a month-grid calendar (no native date input).
    // It opens on today's month — navigate to December 2026 in whichever
    // direction the real current month requires, then pick day 24.
    const target = new Date(2026, 11, 1)
    const now = new Date()
    const forward = target > new Date(now.getFullYear(), now.getMonth(), 1)
    const navBtn = forward ? 'Next month' : 'Previous month'
    for (let i = 0; i < 24 && !screen.queryByText('December 2026'); i++) {
      fireEvent.click(screen.getByRole('button', { name: navBtn }))
    }
    expect(screen.getByText('December 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2026-12-24' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const next = onSave.mock.calls[0][0]
    expect(next.tasks.find(t => t.id === 't3').deadline).toBe('2026-12-24')
  })

  it('deadline chip renders and can be cleared', () => {
    const onSave = vi.fn()
    const today = getCurrentDate()
    const data = makeData({
      tasks: tasks.map(t => (t.id === 't3' ? { ...t, deadline: today } : t))
    })
    render(<Board data={data} onSave={onSave} />)

    const row = screen.getByRole('listitem', { name: 'Task: Uncategorized task' })
    const chip = within(row).getByRole('button', { name: /deadline/i })
    expect(chip.textContent).toContain('due today')
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    const next = onSave.mock.calls[0][0]
    expect(next.tasks.find(t => t.id === 't3').deadline).toBeUndefined()
  })

  it('sidebar hides the hint by default and shows it from the info bubble (R10)', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    expect(screen.queryByText('Click + on a category to add a marker to the board')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /show categories info/i }))
    expect(screen.getByText('Click + on a category to add a marker to the board')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /hide categories info/i }))
    expect(screen.queryByText('Click + on a category to add a marker to the board')).toBeNull()
  })

  it('category note edit syncs the note to every marker of the same category (R10)', () => {
    const onSave = vi.fn()
    render(<Board data={makeData()} onSave={onSave} />)

    // open the note popup from the first marker of category High (several
    // (i) indicators exist on the board — scope to the first High row)
    const markerRow = screen.getAllByRole('listitem', { name: 'Category marker: High' })[0]
    fireEvent.click(within(markerRow).getByTitle('Click to add/edit category note'))
    // edit mode
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByPlaceholderText('Enter category note...')
    fireEvent.change(textarea, { target: { value: 'shared note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const next = onSave.mock.calls[0][0]
    // BOTH High markers carry the note
    expect(next.markers.find(m => m.id === 'm1').note).toBe('shared note')
    expect(next.markers.find(m => m.id === 'm2').note).toBe('shared note')
    // Low markers untouched
    expect(next.markers.find(m => m.id === 'm3').note).toBeUndefined()
    // the category stores it as the source of truth
    expect(next.categories.find(c => c.id === 'c-high').note).toBe('shared note')
  })

  it('category note popup is portaled to document.body, not embedded in the row (R11)', () => {
    render(<Board data={makeData()} onSave={() => {}} />)
    const markerRow = screen.getAllByRole('listitem', { name: 'Category marker: High' })[0]
    fireEvent.click(within(markerRow).getByTitle('Click to add/edit category note'))

    const popup = document.querySelector('.category-note-popup-wrapper')
    expect(popup).toBeTruthy()
    // PORTAL: the popup lives directly under <body>, NOT inside the board row
    // (the old embed bug: the row's persistent animation transform turned the
    // fullscreen fixed popup into a row-sized box).
    expect(popup.closest('.board-row')).toBeNull()
    expect(popup.parentElement).toBe(document.body)
  })

  it('a new marker inherits the category-level note', () => {
    const onSave = vi.fn()
    const data = makeData({
      categories: categories.map(c => (c.id === 'c-high' ? { ...c, note: 'inherited' } : c))
    })
    render(<Board data={data} onSave={onSave} />)

    // several chips offer "add marker" — take the FIRST one (High sorts first
    // by priority)
    const addBtn = screen.getAllByRole('button', { name: /add .* marker to the board/i })[0]
    fireEvent.click(addBtn)

    const next = onSave.mock.calls[0][0]
    const newMarker = next.markers[next.markers.length - 1]
    expect(newMarker.categoryId).toBe('c-high')
    expect(newMarker.note).toBe('inherited')
  })
})

// ---- R8: Settings recurring editor ------------------------------------------

// Settings derives everything from props.data — a stateful wrapper lets the
// editor's own saves flow back into the rendered tree, exactly like App does.
function StatefulSettings({ initial }) {
  const [data, setData] = useState(initial)
  return <Settings data={data} onSave={setData} dataFile="C:/data/tracker.json" />
}

describe('Settings recurring tasks editor (R8)', () => {
  it('adds a recurring task, toggles weekdays and deletes it', () => {
    render(<StatefulSettings initial={makeData({ categories })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))

    // add a recurring task to the FIRST category (High)
    fireEvent.click(screen.getAllByTitle('Add a pre-loaded task for chosen weekdays')[0])
    const input = screen.getByPlaceholderText('Task text (e.g. Morning review)')
    fireEvent.change(input, { target: { value: 'Morning review' } })

    // toggle Monday + Tuesday on
    fireEvent.click(screen.getByRole('button', { name: /monday not selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /tuesday not selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /monday selected/i })) // and Monday back off

    // delete it
    fireEvent.click(screen.getByRole('button', { name: /delete recurring task morning review/i }))

    // The last on-screen state (via the stateful wrapper) is the source of
    // truth: verify the full interaction cycle through the rendered UI.
    // (Both categories show the empty message — the recurring item is gone.)
    expect(screen.getAllByText('No recurring tasks yet.').length).toBe(2)
    expect(screen.queryByPlaceholderText('Task text (e.g. Morning review)')).toBeNull()
  })

  it('saves weekday selections into the category config', () => {
    const saved = []
    const Harness = () => {
      const [data, setData] = useState(makeData({ categories }))
      return (
        <Settings
          data={data}
          onSave={(next) => { saved.push(next); setData(next) }}
          dataFile="C:/data/tracker.json"
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))

    fireEvent.click(screen.getAllByTitle('Add a pre-loaded task for chosen weekdays')[0])
    fireEvent.change(screen.getByPlaceholderText('Task text (e.g. Morning review)'), {
      target: { value: 'Morning review' }
    })
    fireEvent.click(screen.getByRole('button', { name: /monday not selected/i }))
    fireEvent.click(screen.getByRole('button', { name: /friday not selected/i }))

    const last = saved[saved.length - 1]
    expect(last.categories[0].recurringTasks).toEqual([
      { id: expect.any(String), text: 'Morning review', days: [1, 5], active: true }
    ])
  })
})

// ---- R4: Reviews — edit a completed task's category -------------------------

describe('Reviews TaskDetailPopup category editing (R4)', () => {
  const completedData = makeData({
    tasks: [
      {
        id: 't9',
        text: 'Finished work',
        createdAt: '2026-11-01T10:00:00.000Z',
        deadline: '2999-12-31',
        completion: {
          // today (local) so the daily view lists it without date navigation
          completedDate: getCurrentDate(),
          completedAt: new Date().toISOString(),
          difficultyId: 'd2',
          categoryId: 'c-low',
          note: ''
        }
      }
    ],
    board: [],
    workingOn: [],
    logs: [
      {
        id: 'log1',
        timestamp: '2026-11-16T15:30:00.000Z',
        taskId: 't9',
        taskText: 'Finished work',
        difficultyLabel: 'Hard',
        difficultyColor: '#f87171',
        categoryName: 'Low',
        categoryColor: '#4ade80',
        priorityMultiplier: 0.5,
        fatigueMultiplier: 1,
        basePoints: 3,
        finalScore: 1.5
      }
    ]
  })

  it('shows the category with an Edit button and saves a new category', async () => {
    const onSave = vi.fn()
    render(<Reviews data={completedData} onSave={onSave} />)
    fireEvent.click(await screen.findByText('Finished work'))

    fireEvent.click(screen.getByRole('button', { name: 'Edit category' }))
    const select = screen.getByLabelText('Task category')
    expect(select.value).toBe('c-low')
    fireEvent.change(select, { target: { value: 'c-high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const next = onSave.mock.calls[0][0]
    expect(next.tasks.find(t => t.id === 't9').completion.categoryId).toBe('c-high')
    // the log entry is refreshed with the new category's multiplier
    const log = next.logs.find(l => l.taskId === 't9')
    expect(log.categoryName).toBe('High')
    expect(log.priorityMultiplier).toBe(2)
    expect(log.finalScore).toBe(6) // base 3 × fatigue 1 × priority 2
  })

  it('can clear the category back to none', async () => {
    const onSave = vi.fn()
    render(<Reviews data={completedData} onSave={onSave} />)
    fireEvent.click(await screen.findByText('Finished work'))

    fireEvent.click(screen.getByRole('button', { name: 'Edit category' }))
    fireEvent.change(screen.getByLabelText('Task category'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const next = onSave.mock.calls[0][0]
    expect(next.tasks.find(t => t.id === 't9').completion.categoryId).toBeNull()
    const log = next.logs.find(l => l.taskId === 't9')
    expect(log.categoryName).toBeNull()
    expect(log.priorityMultiplier).toBe(1)
  })

  it('displays the deadline of a completed task', async () => {
    render(<Reviews data={completedData} onSave={vi.fn()} />)
    fireEvent.click(await screen.findByText('Finished work'))
    expect(screen.getByText('Deadline')).toBeTruthy()
    expect(screen.getByText('2999-12-31')).toBeTruthy()
  })
})

// ---- R10: nav minimize button ------------------------------------------------

describe('App nav minimize button (R10)', () => {
  it('renders the minimize button in the top nav', async () => {
    const mockApi = {
      getAppState: vi.fn().mockResolvedValue({ dataPath: 'C:/data/tracker.json' }),
      loadData: vi.fn().mockResolvedValue(makeData()),
      getWatcherEnabled: vi.fn().mockResolvedValue(true),
      checkConflicts: vi.fn().mockResolvedValue([]),
      minimizeWindow: vi.fn().mockResolvedValue(true),
      onExternalChange: vi.fn(() => () => {}),
      saveData: vi.fn().mockResolvedValue({})
    }
    vi.stubGlobal('api', mockApi)
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'Minimize window' })
    fireEvent.click(btn)
    expect(mockApi.minimizeWindow).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
