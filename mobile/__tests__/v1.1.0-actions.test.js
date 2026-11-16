// v1.1.0 action tests — the user-requested behaviors from 2026-11-17:
//   R1  clearWorkingOn (deselect every working-on task)
//   R4  completed-task category edit refreshes the matching logs entry
//   R5  setDeadline / clear deadline
//   R7  createThreadTask ("#N" continuation directly below the source task)
//   R10 addMarker inherits the category note; updateMarkerNote syncs the
//       note to every marker of the same category
// Every transform mirrors the DESKTOP behavior exactly (same fields, same
// shapes) so both apps keep writing byte-identical structures.

import {
  clearWorkingOn,
  createThreadTask,
  setDeadline,
  addMarker,
  updateMarkerNote,
  updateTaskCompletion
} from '../src/actions.js'

const NOW = '2026-11-17T12:00:00.000Z'

function baseData() {
  return {
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    settings: { fatigueIncrement: 0.1, fatigueCap: 3 },
    difficulties: [
      { id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
      { id: 'd2', label: 'Hard', score: 3, color: '#f87171', order: 1, active: true }
    ],
    categories: [
      { id: 'c1', name: 'Deep Work', color: '#8b5cf6', order: 0, active: true, priorityMultiplier: 2 },
      { id: 'c2', name: 'Admin', color: '#60a5fa', order: 1, active: true, priorityMultiplier: 1 }
    ],
    markers: [
      { id: 'm1', categoryId: 'c1', createdAt: NOW, updatedAt: NOW },
      { id: 'm2', categoryId: 'c1', createdAt: NOW, updatedAt: NOW },
      { id: 'm3', categoryId: 'c2', createdAt: NOW, updatedAt: NOW }
    ],
    board: [
      { type: 'marker', markerId: 'm1' },
      { type: 'task', taskId: 't2' },
      { type: 'marker', markerId: 'm2' },
      { type: 'marker', markerId: 'm3' }
    ],
    tasks: [
      {
        id: 't1',
        text: 'Shipped the fix',
        createdAt: '2026-11-16T08:00:00.000Z',
        completion: {
          completedDate: '2026-11-16',
          completedAt: '2026-11-16T22:45:00.000Z',
          difficultyId: 'd2',
          categoryId: 'c1',
          note: ''
        }
      },
      { id: 't2', text: 'Deep clean the garage', createdAt: '2026-11-17T08:00:00.000Z', completion: null }
    ],
    workingOn: ['t2'],
    logs: [
      {
        id: 'l1',
        timestamp: '2026-11-16T22:45:00.000Z',
        taskId: 't1',
        taskText: 'Shipped the fix',
        difficultyLabel: 'Hard',
        difficultyColor: '#f87171',
        categoryName: 'Deep Work',
        categoryColor: '#8b5cf6',
        priorityMultiplier: 2,
        fatigueMultiplier: 1,
        basePoints: 3,
        finalScore: 6
      }
    ]
  }
}

describe('clearWorkingOn (desktop WorkingOnPopup Clear All)', () => {
  test('empties the workingOn array and bumps meta', () => {
    const next = clearWorkingOn(baseData(), NOW)
    expect(next.workingOn).toEqual([])
    expect(next.meta.updatedAt).toBe(NOW)
  })

  test('never mutates the input', () => {
    const data = baseData()
    const before = JSON.stringify(data)
    clearWorkingOn(data, NOW)
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('setDeadline (desktop Board.handleSetDeadline)', () => {
  test('sets a deadline on the task', () => {
    const next = setDeadline(baseData(), 't2', '2026-12-24', NOW)
    expect(next.tasks.find(t => t.id === 't2').deadline).toBe('2026-12-24')
    expect(next.meta.updatedAt).toBe(NOW)
  })

  test('an empty string REMOVES the field (not an empty string)', () => {
    const withDeadline = { ...baseData(), tasks: baseData().tasks.map(t => (t.id === 't2' ? { ...t, deadline: '2026-12-24' } : t)) }
    const next = setDeadline(withDeadline, 't2', '', NOW)
    const t2 = next.tasks.find(t => t.id === 't2')
    expect(Object.prototype.hasOwnProperty.call(t2, 'deadline')).toBe(false)
  })
})

describe('createThreadTask (desktop Board.handleCreateThreadTask)', () => {
  test('creates "#2" directly below the source task, linked via threadOf', () => {
    const next = createThreadTask(baseData(), 't2', NOW)
    const created = next.tasks.find(t => t.id !== 't1' && t.id !== 't2')
    expect(created.text).toBe('Deep clean the garage #2')
    expect(created.threadOf).toBe('t2')
    expect(created.completion).toBeNull()
    // inserted directly below t2 on the board
    const idx = next.board.findIndex(i => i.type === 'task' && i.taskId === 't2')
    expect(next.board[idx + 1]).toEqual({ type: 'task', taskId: created.id })
  })

  test('continues numbering across completed thread members', () => {
    const data = baseData()
    data.tasks.push({ id: 't2b', text: 'Deep clean the garage #2', createdAt: NOW, completion: { completedDate: '2026-11-16', completedAt: '2026-11-16T23:00:00.000Z', difficultyId: 'd1', categoryId: null, note: '' }, threadOf: 't2' })
    data.board.splice(2, 0, { type: 'task', taskId: 't2b' })
    const next = createThreadTask(data, 't2', NOW)
    const created = next.tasks[next.tasks.length - 1]
    expect(created.text).toBe('Deep clean the garage #3')
    expect(created.threadOf).toBe('t2')
  })
})

describe('updateMarkerNote — category-wide sync (user request)', () => {
  test('writes the note to EVERY marker of the same category + the category', () => {
    const next = updateMarkerNote(baseData(), 'm1', 'focus block', NOW)
    expect(next.markers.find(m => m.id === 'm1').note).toBe('focus block')
    expect(next.markers.find(m => m.id === 'm2').note).toBe('focus block') // same category c1
    expect(next.markers.find(m => m.id === 'm3').note).toBeUndefined() // c2 untouched
    expect(next.categories.find(c => c.id === 'c1').note).toBe('focus block')
    expect(next.categories.find(c => c.id === 'c2').note).toBeUndefined()
  })
})

describe('addMarker — category note inheritance (user request)', () => {
  test('a new marker copies the category-level note', () => {
    const data = baseData()
    data.categories = data.categories.map(c => (c.id === 'c2' ? { ...c, note: 'admin chores' } : c))
    const next = addMarker(data, 'c2', NOW)
    const created = next.markers[next.markers.length - 1]
    expect(created.categoryId).toBe('c2')
    expect(created.note).toBe('admin chores')
  })

  test('no note field when the category has none', () => {
    const next = addMarker(baseData(), 'c1', NOW)
    const created = next.markers[next.markers.length - 1]
    expect(Object.prototype.hasOwnProperty.call(created, 'note')).toBe(false)
  })
})

describe('updateTaskCompletion — categoryId patch refreshes the log (user request)', () => {
  test('editing the category updates completion AND the matching log entry', () => {
    const next = updateTaskCompletion(baseData(), 't1', { categoryId: 'c2' }, NOW)
    expect(next.tasks.find(t => t.id === 't1').completion.categoryId).toBe('c2')
    const log = next.logs.find(l => l.taskId === 't1')
    expect(log.categoryName).toBe('Admin')
    expect(log.categoryColor).toBe('#60a5fa')
    expect(log.priorityMultiplier).toBe(1)
    // base 3 × fatigue 1 × priority 1 (recomputed with the canonical breakdown)
    expect(log.finalScore).toBe(3)
  })

  test('clearing the category nulls it and resets the multiplier in the log', () => {
    const next = updateTaskCompletion(baseData(), 't1', { categoryId: null }, NOW)
    expect(next.tasks.find(t => t.id === 't1').completion.categoryId).toBeNull()
    const log = next.logs.find(l => l.taskId === 't1')
    expect(log.categoryName).toBeNull()
    expect(log.priorityMultiplier).toBe(1)
  })

  test('non-category patches leave logs untouched (no log churn)', () => {
    const data = baseData()
    const next = updateTaskCompletion(data, 't1', { note: 'x' }, NOW)
    expect(next.logs).toBe(data.logs) // same reference — untouched
  })
})
