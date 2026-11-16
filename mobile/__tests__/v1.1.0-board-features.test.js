// v1.1.0 component tests — mobile UI parity for the 2026-11-17 user requests:
//   R1  WorkingOnSheet "Clear All" writes clearWorkingOn through the store
//   R3  the working-on list renders in CATEGORY-PRIORITY order
//   R5  deadline chips/states render in the sheet and on task rows; the
//       DeadlineDialog validates input and saves/clears via setDeadline
//   R7  task rows expose the thread action, wired to createThreadTask

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { BoardScreen } from '../src/components/BoardScreen.js'
import { WorkingOnSheet } from '../src/components/WorkingOnSheet.js'
import { DeadlineDialog } from '../src/components/dialogs.js'
import { TaskRow } from '../src/components/rows.js'
import { TextButton } from '../src/components/ui.js'
import { TextInput } from 'react-native'
import { clearWorkingOn, createThreadTask, setDeadline } from '../src/actions.js'
import { buildTheme } from '../src/theme.js'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 })
}))

const theme = buildTheme('dark', 'dark')
const NOW = '2026-11-17T12:00:00.000Z'

function makeData(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
    settings: { theme: 'system', fatigueIncrement: 0.1, fatigueCap: 3.0 },
    difficulties: [{ id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true }],
    categories: [
      { id: 'c1', name: 'Deep Work', color: '#8b5cf6', order: 0, active: true, priorityMultiplier: 3 },
      { id: 'c2', name: 'Admin', color: '#60a5fa', order: 1, active: true, priorityMultiplier: 0.5 }
    ],
    markers: [
      { id: 'm1', categoryId: 'c1' },
      { id: 'm1b', categoryId: 'c1' },
      { id: 'm2', categoryId: 'c2' },
      { id: 'm2b', categoryId: 'c2' }
    ],
    board: [
      { type: 'marker', markerId: 'm1' },
      { type: 'task', taskId: 'tHigh' },
      { type: 'marker', markerId: 'm1b' },
      { type: 'marker', markerId: 'm2' },
      { type: 'task', taskId: 'tLow' },
      { type: 'marker', markerId: 'm2b' }
    ],
    tasks: [
      { id: 'tLow', text: 'Admin task', createdAt: '2026-11-16T08:00:00.000Z', completion: null },
      { id: 'tHigh', text: 'Deep work task', createdAt: '2026-11-17T08:00:00.000Z', completion: null }
    ],
    // insertion order: LOW priority first, HIGH second — display must flip
    workingOn: ['tLow', 'tHigh'],
    logs: [],
    ...overrides
  }
}

function makeStore() {
  const calls = []
  return {
    calls,
    mutate: async buildNext => {
      calls.push(buildNext)
    }
  }
}

async function mountBoard(data = makeData(), store = makeStore()) {
  let tree = null
  await act(async () => {
    tree = TestRenderer.create(
      <BoardScreen
        theme={theme}
        state={{ status: 'ready', data, conflicts: [] }}
        store={store}
        refreshing={false}
        onRefresh={() => {}}
        onShowConflictInfo={() => {}}
      />
    )
    await Promise.resolve()
  })
  return { tree, store }
}

function textOf(tree) {
  // toJSON() output: host components carry STRING types ('Text') and their
  // text lives in the children array — props never contains children.
  const out = []
  const visit = n => {
    if (Array.isArray(n)) {
      n.forEach(visit)
      return
    }
    if (n && typeof n === 'object') {
      if (n.type === 'Text' && Array.isArray(n.children)) {
        n.children.forEach(c => {
          if (typeof c === 'string') out.push(c)
        })
      }
      if (n.children) visit(n.children)
    }
  }
  visit(tree.toJSON())
  return out.join(' ')
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('R1 + R3: WorkingOnSheet clear-all and priority ordering', () => {
  test('the sheet lists working-on tasks by category priority, not insertion time', async () => {
    const { tree } = await mountBoard()
    const sheet = tree.root.findByType(WorkingOnSheet)
    const order = sheet.props.tasks.map(t => t.id)
    expect(order).toEqual(['tHigh', 'tLow']) // ×3 category first, ×0.5 second
    act(() => {
      tree.unmount()
    })
  })

  test('Clear All writes clearWorkingOn through the store', async () => {
    const { tree, store } = await mountBoard()
    const sheet = tree.root.findByType(WorkingOnSheet)
    expect(typeof sheet.props.onClearAll).toBe('function')
    await act(async () => {
      sheet.props.onClearAll()
    })
    expect(store.calls).toHaveLength(1)
    const next = store.calls[0](makeData(), NOW)
    expect(next.workingOn).toEqual([])
    expect(clearWorkingOn(makeData(), NOW).workingOn).toEqual([])
    act(() => {
      tree.unmount()
    })
  })
})

describe('R5: deadlines on mobile', () => {
  test('a task row with a deadline renders its state line', async () => {
    const data = makeData({
      tasks: makeData().tasks.map(t =>
        t.id === 'tHigh' ? { ...t, deadline: '2000-01-01' } : t // long overdue
      )
    })
    const { tree } = await mountBoard(data)
    const texts = textOf(tree)
    expect(textOf(tree)).toContain('overdue')
    act(() => {
      tree.unmount()
    })
  })

  test('the deadline icon button opens the dialog, which saves via setDeadline', async () => {
    const { tree, store } = await mountBoard()
    const deadlineBtn = tree.root.findAll(
      n => n.props?.accessibilityLabel === 'Set deadline'
    )
    expect(deadlineBtn.length).toBeGreaterThan(0)
    await act(async () => {
      deadlineBtn[0].props.onPress()
    })
    const dialog = tree.root.findByType(DeadlineDialog)
    expect(dialog).toBeTruthy()

    // invalid input → Save disabled
    const input = tree.root.findAllByType(TextInput).find(
      i => i.props.placeholder && i.props.placeholder.startsWith('YYYY-MM-DD')
    )
    expect(input).toBeTruthy()
    await act(async () => {
      input.props.onChangeText('nope')
    })
    const saveBtn = tree.root.findAllByType(TextButton).find(b => b.props.label === 'Save')
    expect(saveBtn.props.disabled).toBe(true)

    // valid input → save flows through setDeadline
    await act(async () => {
      input.props.onChangeText('2026-12-24')
    })
    await act(async () => {
      saveBtn.props.onPress()
    })
    expect(store.calls).toHaveLength(1)
    // the first 'Set deadline' button belongs to the FIRST task row (tHigh)
    const next = store.calls[0](makeData(), NOW)
    expect(next.tasks.find(t => t.id === 'tHigh').deadline).toBe('2026-12-24')
    expect(setDeadline(makeData(), 'tHigh', '2026-12-24', NOW).tasks.find(t => t.id === 'tHigh').deadline).toBe('2026-12-24')
    act(() => {
      tree.unmount()
    })
  })
})

describe('R7: threads on mobile', () => {
  test('the thread icon button writes createThreadTask through the store', async () => {
    const { tree, store } = await mountBoard()
    const threadBtn = tree.root.findAll(
      n => n.props?.accessibilityLabel === 'Continue this task in a thread'
    )
    // matches both the IconBtn elements and their inner Pressables — at
    // least one per task row
    expect(threadBtn.length).toBeGreaterThanOrEqual(2)

    // thread the FIRST task row (tHigh — first on the board)
    await act(async () => {
      threadBtn[0].props.onPress()
    })
    expect(store.calls).toHaveLength(1)
    const next = store.calls[0](makeData(), NOW)
    const created = next.tasks.find(t => t.id !== 'tLow' && t.id !== 'tHigh')
    expect(created.text).toBe('Deep work task #2')
    expect(created.threadOf).toBe('tHigh')
    expect(createThreadTask(makeData(), 'tHigh', NOW).tasks.length).toBe(3)
    act(() => {
      tree.unmount()
    })
  })

  test('a thread continuation row renders the thread badge icon', async () => {
    const data = makeData({
      tasks: [
        ...makeData().tasks,
        { id: 'tLow2', text: 'Admin task #2', createdAt: NOW, completion: null, threadOf: 'tLow' }
      ],
      board: [
        { type: 'marker', markerId: 'm1' },
        { type: 'task', taskId: 'tLow' },
        { type: 'task', taskId: 'tLow2' },
        { type: 'marker', markerId: 'm1b' },
        { type: 'marker', markerId: 'm2' },
        { type: 'task', taskId: 'tHigh' },
        { type: 'marker', markerId: 'm2b' }
      ]
    })
    const { tree } = await mountBoard(data)
    const rows = tree.root.findAllByType(TaskRow)
    const continuation = rows.find(r => r.props.task.id === 'tLow2')
    expect(continuation).toBeTruthy()
    expect(continuation.props.onCreateThread).toBeTruthy() // can be threaded further
    act(() => {
      tree.unmount()
    })
  })
})
