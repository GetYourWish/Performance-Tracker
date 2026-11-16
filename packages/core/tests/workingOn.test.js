// workingOn.test.js — Working-On display order (category priority first).
import { describe, it, expect } from 'vitest'
import { sortWorkingOnByPriority } from '../index.js'

// Board layout (strict category rule: task has a category only between
// two markers of the SAME category):
//   [m1:High(×2)] t1 [m2:High(×2)]  → t1 category High
//   [m3:Low(×0.5)] t2 t3 [m4:Low]   → t2, t3 category Low
//   t4 after m4 with no marker below → no category
const markers = [
  { id: 'm1', categoryId: 'high' },
  { id: 'm2', categoryId: 'high' },
  { id: 'm3', categoryId: 'low' },
  { id: 'm4', categoryId: 'low' }
]
const board = [
  { type: 'marker', markerId: 'm1' },
  { type: 'task', taskId: 't1' },
  { type: 'marker', markerId: 'm2' },
  { type: 'marker', markerId: 'm3' },
  { type: 'task', taskId: 't2' },
  { type: 'task', taskId: 't3' },
  { type: 'marker', markerId: 'm4' },
  { type: 'task', taskId: 't4' }
]
const categories = [
  { id: 'high', name: 'High', priorityMultiplier: 2 },
  { id: 'low', name: 'Low', priorityMultiplier: 0.5 }
]
const tasks = [
  { id: 't1', text: 'a', completion: null },
  { id: 't2', text: 'b', completion: null },
  { id: 't3', text: 'c', completion: null },
  { id: 't4', text: 'd', completion: null }
]

describe('sortWorkingOnByPriority', () => {
  it('orders by category priority, not insertion time', () => {
    // added in order t2 (low), t4 (none), t1 (high), t3 (low)
    const workingOn = ['t2', 't4', 't1', 't3']
    expect(sortWorkingOnByPriority(workingOn, board, markers, categories))
      .toEqual(['t1', 't2', 't3', 't4'])
  })

  it('keeps insertion order within the same priority (stable)', () => {
    expect(sortWorkingOnByPriority(['t3', 't2'], board, markers, categories))
      .toEqual(['t3', 't2'])
  })

  it('sorts uncategorized tasks after every categorized one, insertion order kept', () => {
    expect(sortWorkingOnByPriority(['t4', 't2'], board, markers, categories))
      .toEqual(['t2', 't4'])
  })

  it('never mutates the input array', () => {
    const workingOn = ['t2', 't1']
    sortWorkingOnByPriority(workingOn, board, markers, categories)
    expect(workingOn).toEqual(['t2', 't1'])
  })

  it('treats a missing priorityMultiplier as 1', () => {
    const cats = [{ id: 'high', name: 'High' }] // no priorityMultiplier field
    expect(sortWorkingOnByPriority(['t4', 't1'], board, markers, cats))
      .toEqual(['t1', 't4'])
  })

  it('tolerates empty and missing input', () => {
    expect(sortWorkingOnByPriority([], board, markers, categories)).toEqual([])
    expect(sortWorkingOnByPriority(undefined, board, markers, categories)).toEqual([])
  })
})
