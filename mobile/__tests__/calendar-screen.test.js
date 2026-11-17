// calendar-screen.test.js — v1.4.0 Calendar tab (desktop CalendarPage
// parity):
//   1. month grid: weekday header order follows weekStartsOn, today's cell
//      is highlighted, tasks land on their deadline day (overdue red /
//      due-today amber); COMPLETED tasks do not appear (desktop v1.3.0 rule)
//   2. task details dialog: category, full text, deadline state;
//      "Go to Board" fires onGoToBoard(taskId) for board tasks only
//   3. month/year navigation (prev / next / today)
//   4. "+N more" overflow opens the day sheet listing every task of the day
//   5. BoardScreen focusRequest handoff: the calendar's "Go to Board"
//      teleports to the task's row (flash) and consumes the request once

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { CalendarScreen } from '../src/components/CalendarScreen.js'
import { BoardScreen } from '../src/components/BoardScreen.js'
import { TaskRow } from '../src/components/rows.js'
import { buildTheme } from '../src/theme.js'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 })
}))

const theme = buildTheme('dark', 'dark')

// Pinned "today" — Wednesday 2026-11-18, middle of the month, so ±few-day
// offsets never leave November.
const TODAY = new Date(2026, 10, 18, 12, 0, 0)
const dayStr = offset => {
  const d = new Date(2026, 10, 18 + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function makeData(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' },
    settings: { theme: 'system', fatigueIncrement: 0.1, fatigueCap: 3.0, weekStartsOn: 1 },
    difficulties: [
      { id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
      { id: 'd2', label: 'Hard', score: 3, color: '#f87171', order: 1, active: true }
    ],
    categories: [
      { id: 'c-high', name: 'High', color: '#60a5fa', order: 0, active: true, priorityMultiplier: 2 },
      { id: 'c-low', name: 'Low', color: '#4ade80', order: 1, active: true, priorityMultiplier: 0.5 }
    ],
    markers: [
      { id: 'm1', categoryId: 'c-high' },
      { id: 'm2', categoryId: 'c-high' },
      { id: 'm3', categoryId: 'c-low' },
      { id: 'm4', categoryId: 'c-low' }
    ],
    // strict category rule: t1 between m1/m2 (High), t2 between m3/m4 (Low)
    board: [
      { type: 'marker', markerId: 'm1' },
      { type: 'task', taskId: 't1' },
      { type: 'marker', markerId: 'm2' },
      { type: 'marker', markerId: 'm3' },
      { type: 'task', taskId: 't2' },
      { type: 'marker', markerId: 'm4' }
    ],
    tasks: [
      { id: 't1', text: 'Due today task', createdAt: '2026-11-01T10:00:00.000Z', completion: null, deadline: dayStr(0) },
      { id: 't2', text: 'Overdue task', createdAt: '2026-11-02T10:00:00.000Z', completion: null, deadline: dayStr(-3) },
      // t3 exists but has NO board row — it still shows on the calendar,
      // but with no category and no "Go to Board" button.
      { id: 't3', text: 'Off-board task', createdAt: '2026-11-03T10:00:00.000Z', completion: null, deadline: dayStr(2) },
      {
        id: 't4',
        text: 'Done task',
        createdAt: '2026-11-04T10:00:00.000Z',
        deadline: dayStr(-10),
        completion: { completedDate: dayStr(-1), completedAt: '2026-11-17T15:00:00.000Z', difficultyId: 'd2', categoryId: 'c-low', note: 'wrapped it up' }
      }
    ],
    workingOn: [],
    logs: [],
    ...overrides
  }
}

function makeStore() {
  const calls = []
  return { calls, mutate: async buildNext => { calls.push(buildNext) } }
}

async function mountCalendar(data = makeData(), onGoToBoard = () => {}) {
  let tree = null
  await act(async () => {
    tree = TestRenderer.create(
      <CalendarScreen theme={theme} state={{ status: 'ready', data, conflicts: [] }} onGoToBoard={onGoToBoard} />
    )
    await Promise.resolve()
  })
  return tree
}

function textOfJson(json) {
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
          else if (typeof c === 'number') out.push(String(c))
        })
      }
      if (n.children) visit(n.children)
    }
  }
  visit(json)
  // collapse whitespace runs — text split across children ("November" + " " + 2026)
  // otherwise never matches a plain 'November 2026'
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

const textOf = tree => textOfJson(tree.toJSON())

// Press a ui-kit button identified by its `label` PROP (TextButton /
// FilledButton composites carry label + the caller's onPress in their own
// props — no toJSON gymnastics needed).
async function pressByLabelProp(tree, labelText) {
  const matches = tree.root.findAll(
    n => n.props && n.props.label === labelText && typeof n.props.onPress === 'function'
  )
  if (matches.length === 0) throw new Error('no kit button with label: ' + labelText)
  await act(async () => {
    matches[0].props.onPress()
  })
}

async function tap(tree, label) {
  const matches = tree.root.findAll(
    n => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function'
  )
  if (matches.length === 0) throw new Error('no tappable element with label: ' + label)
  await act(async () => {
    matches[0].props.onPress()
  })
}

// Find the day-cell Pressable chip for a task id via its accessibility label.
const findChip = tree => task => {
  const label = `Task: ${task.text}`
  return tree.root.findAll(n => n.props?.accessibilityLabel === label)[0]
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(TODAY)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('CalendarScreen month grid (desktop CalendarPage parity)', () => {
  test('renders the month, Monday-first weekday header and a highlighted today cell', async () => {
    const tree = await mountCalendar()
    const text = textOf(tree)
    expect(text).toContain('November 2026')
    // weekday header order Mon..Sun (weekStartsOn: 1)
    expect(text.indexOf('MON')).toBeLessThan(text.indexOf('SUN'))
    expect(text.indexOf('TUE')).toBeGreaterThan(text.indexOf('MON'))

    // today's cell carries the accent border (#8b5cf6)
    const todayCell = tree.root
      .findAll(n => n.props?.style && n.props.style.borderColor === '#8b5cf6')
      .find(n => Array.isArray(n.children))
    expect(todayCell).toBeTruthy()
    act(() => { tree.unmount() })
  })

  test('weekday header starts on Sunday when weekStartsOn is 0', async () => {
    const data = makeData({ settings: { weekStartsOn: 0 } })
    const tree = await mountCalendar(data)
    const text = textOf(tree)
    expect(text).toContain('SUN')
    // SUN comes before MON in the rendered order
    expect(text.indexOf('SUN')).toBeLessThan(text.indexOf('MON'))
    act(() => { tree.unmount() })
  })

  test('deadline tasks land on their day with overdue / due-today colors', async () => {
    const tree = await mountCalendar()
    const data = makeData()
    const chip = findChip(tree)

    const dueTodayChip = chip(data.tasks[0])
    expect(dueTodayChip.props.style.borderLeftColor).toBe('#f59e0b')

    const overdueChip = chip(data.tasks[1])
    expect(overdueChip.props.style.borderLeftColor).toBe('#ef4444')

    // off-board future task still shows (neutral accent — its category is
    // null because it has no board position)
    const offBoardChip = chip(data.tasks[2])
    expect(offBoardChip).toBeTruthy()
    expect(offBoardChip.props.style.borderLeftColor).toBe(theme.textMuted)
    act(() => { tree.unmount() })
  })

  test('completed tasks do NOT appear (desktop v1.3.0 rule: uncompleted only)', async () => {
    const tree = await mountCalendar()
    const text = textOf(tree)
    expect(text).not.toContain('Done task')
    act(() => { tree.unmount() })
  })

  test('summary counts tasks due in the month and overdue ones', async () => {
    const tree = await mountCalendar()
    const text = textOf(tree)
    // 3 uncompleted deadline tasks in November (t1, t2, t3), 1 overdue (t2)
    expect(text).toContain('3 tasks due in November')
    expect(text).toContain('1 task overdue')
    act(() => { tree.unmount() })
  })

  test('navigates months with prev / next and returns with Today', async () => {
    const tree = await mountCalendar()
    expect(textOf(tree)).toContain('November 2026')

    await tap(tree, 'Next month')
    expect(textOf(tree)).toContain('December 2026')

    await tap(tree, 'Previous month')
    await tap(tree, 'Previous month')
    expect(textOf(tree)).toContain('October 2026')

    await pressByLabelProp(tree, 'Today')
    expect(textOf(tree)).toContain('November 2026')
    act(() => { tree.unmount() })
  })

  test('navigates years with the double arrows', async () => {
    const tree = await mountCalendar()
    expect(textOf(tree)).toContain('November 2026')

    await tap(tree, 'Next year')
    expect(textOf(tree)).toContain('November 2027')

    await tap(tree, 'Previous year')
    await tap(tree, 'Previous year')
    expect(textOf(tree)).toContain('November 2025')
    act(() => { tree.unmount() })
  })
})

describe('CalendarScreen task details dialog', () => {
  test('shows category, full text and deadline state; Go to Board fires for a board task', async () => {
    const onGoToBoard = jest.fn()
    const tree = await mountCalendar(makeData(), onGoToBoard)
    const data = makeData()

    await tap(tree, `Task: ${data.tasks[0].text}`)

    const text = textOf(tree)
    expect(text).toContain('Due today task')
    expect(text).toContain('High') // category from board position
    expect(text).toContain('due today') // deadlineState label
    expect(text).toContain('CATEGORY')
    expect(text).toContain('DEADLINE')

    await pressByLabelProp(tree, 'Go to Board')
    expect(onGoToBoard).toHaveBeenCalledTimes(1)
    expect(onGoToBoard).toHaveBeenCalledWith('t1')
    act(() => { tree.unmount() })
  })

  test('off-board task details offer no Go to Board button', async () => {
    const onGoToBoard = jest.fn()
    const tree = await mountCalendar(makeData(), onGoToBoard)
    const data = makeData()

    await tap(tree, `Task: ${data.tasks[2].text}`)
    expect(textOf(tree)).toContain('Off-board task')
    expect(textOf(tree)).toContain('No category')

    const goButtons = tree.root.findAll(n => n.props?.label === 'Go to Board')
    expect(goButtons.length).toBe(0)
    expect(onGoToBoard).not.toHaveBeenCalled()
    act(() => { tree.unmount() })
  })

  test('overdue task details show the overdue deadline state', async () => {
    const tree = await mountCalendar()
    const data = makeData()

    await tap(tree, `Task: ${data.tasks[1].text}`)
    const text = textOf(tree)
    expect(text).toContain('Overdue task')
    expect(text).toContain('3d overdue')
    act(() => { tree.unmount() })
  })
})

describe('CalendarScreen day overflow (+N more)', () => {
  test('cells cap at 3 chips and the overflow opens the full day list', async () => {
    // five bulk tasks due on the same future day as the off-board task →
    // 6 tasks on 2026-11-20: 3 shown (off-board first — insertion order),
    // 3 hidden behind "+3 more"
    const extra = [1, 2, 3, 4, 5].map(i => ({
      id: `x${i}`,
      text: `Bulk task ${i}`,
      createdAt: '2026-11-05T10:00:00.000Z',
      completion: null,
      deadline: dayStr(2)
    }))
    const data = makeData({ tasks: [...makeData().tasks, ...extra] })
    const tree = await mountCalendar(data)

    // the cell shows the cap plus "+3 more"
    const text = textOf(tree)
    expect(text).toContain('Bulk task 1')
    expect(text).toContain('Bulk task 2')
    expect(text).not.toContain('Bulk task 4') // hidden by the cap
    expect(text).toContain('+3 more')

    // the day sheet lists every task of that day
    await tap(tree, `Show all 6 tasks on ${dayStr(2)}`)
    const sheetText = textOf(tree)
    expect(sheetText).toContain('Bulk task 3')
    expect(sheetText).toContain('Bulk task 4')
    expect(sheetText).toContain('Bulk task 5')

    // tapping a row in the sheet opens the details dialog
    await tap(tree, `Task: Bulk task 4`)
    expect(textOf(tree)).toContain('CATEGORY')
    act(() => { tree.unmount() })
  })
})

describe('BoardScreen focusRequest (calendar Go to Board handoff)', () => {
  test('teleports to the task row, flashes it and consumes the request exactly once', async () => {
    jest.useRealTimers() // FlatList + real-timer wait, like the teleport tests
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const onFocusHandled = jest.fn()
    const data = makeData()
    const store = makeStore()

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
          focusRequest={{ taskId: 't2', nonce: 1 }}
          onFocusHandled={onFocusHandled}
        />
      )
      await Promise.resolve()
    })

    // focus fires ~100 ms after mount (the dice-treatment grace window)
    await act(async () => {
      await sleep(400)
    })

    const t2Row = tree.root.findAllByType(TaskRow).find(r => r.props.task.id === 't2')
    expect(t2Row).toBeTruthy()
    expect(t2Row.props.flash).toBe(true)
    expect(onFocusHandled).toHaveBeenCalledTimes(1)

    // the flash clears on its own timer (starts ~100 ms after mount, lasts
    // 1600 ms — wait well past that)
    await act(async () => {
      await sleep(1800)
    })
    expect(t2Row.props.flash).toBeFalsy()
    expect(onFocusHandled).toHaveBeenCalledTimes(1)

    act(() => { tree.unmount() })
  })

  test('a null/consumed request never touches the board', async () => {
    jest.useRealTimers()
    const onFocusHandled = jest.fn()
    const data = makeData()
    let tree = null
    await act(async () => {
      tree = TestRenderer.create(
        <BoardScreen
          theme={theme}
          state={{ status: 'ready', data, conflicts: [] }}
          store={makeStore()}
          refreshing={false}
          onRefresh={() => {}}
          onShowConflictInfo={() => {}}
          focusRequest={null}
          onFocusHandled={onFocusHandled}
        />
      )
      await Promise.resolve()
    })
    expect(onFocusHandled).not.toHaveBeenCalled()
    act(() => { tree.unmount() })
  })

  test('a request for a task with no board row is consumed silently', async () => {
    jest.useRealTimers()
    const onFocusHandled = jest.fn()
    const data = makeData()
    let tree = null
    await act(async () => {
      tree = TestRenderer.create(
        <BoardScreen
          theme={theme}
          state={{ status: 'ready', data, conflicts: [] }}
          store={makeStore()}
          refreshing={false}
          onRefresh={() => {}}
          onShowConflictInfo={() => {}}
          focusRequest={{ taskId: 'not-a-row', nonce: 1 }}
          onFocusHandled={onFocusHandled}
        />
      )
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })
    expect(onFocusHandled).toHaveBeenCalledTimes(1)
    act(() => { tree.unmount() })
  })
})
