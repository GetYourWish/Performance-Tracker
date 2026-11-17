// deadline-auto-add.test.js — when a task's deadline day is reached it joins
// workingOn automatically (user request 2026-11-18). Shared rule for desktop
// and Android; see src/deadlines.js applyDueDeadlines.
import { describe, it, expect } from 'vitest'
import { applyDueDeadlines } from '../index.js'

const TODAY = '2026-11-18'
const NOW = '2026-11-18T09:30:00.000Z'

function baseData(overrides = {}) {
  return {
    schemaVersion: 1,
    meta: { createdAt: NOW, updatedAt: NOW },
    settings: {},
    difficulties: [],
    categories: [],
    markers: [],
    board: [],
    tasks: [],
    workingOn: [],
    logs: [],
    ...overrides
  }
}

const task = (id, extra = {}) => ({
  id,
  text: `Task ${id}`,
  createdAt: NOW,
  completion: null,
  ...extra
})

describe('applyDueDeadlines', () => {
  it('adds a task whose deadline is today to workingOn', () => {
    const data = baseData({ tasks: [task('t1', { deadline: TODAY })] })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })

    expect(added).toEqual(['t1'])
    expect(next.workingOn).toEqual(['t1'])
    expect(next.tasks[0].deadlineAutoAdded).toBe(TODAY)
    expect(next.meta.updatedAt).toBe(NOW)
  })

  it('adds overdue tasks too (deadline already passed)', () => {
    const data = baseData({
      tasks: [task('t1', { deadline: '2026-11-16' })]
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual(['t1'])
    expect(next.workingOn).toEqual(['t1'])
  })

  it('skips future deadlines, completed tasks and tasks without a deadline', () => {
    const data = baseData({
      tasks: [
        task('future', { deadline: '2026-11-20' }),
        task('done', {
          deadline: TODAY,
          completion: { completedDate: TODAY, completedAt: NOW, difficultyId: 'd1' }
        }),
        task('none')
      ]
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual([])
    expect(next).toBe(data) // same reference — no-change-no-write
    expect(next.workingOn).toEqual([])
  })

  it('skips malformed deadline strings instead of auto-adding them (NaN guard)', () => {
    // a full ISO datetime from a rogue writer parses to NaN days — NaN > 0
    // is false, so without the guard such a task was treated as DUE and
    // spuriously joined Working On (v1.4.0).
    const data = baseData({
      tasks: [
        task('iso-datetime', { deadline: '2026-11-18T13:05:00.000Z' }),
        task('garbage', { deadline: 'not-a-date' })
      ]
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual([])
    expect(next).toBe(data) // same reference — nothing changed at all
    expect(next.workingOn).toEqual([])
  })

  it('stamps tasks already in workingOn without duplicating them', () => {
    const data = baseData({
      tasks: [task('t1', { deadline: TODAY })],
      workingOn: ['t1']
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual([]) // nothing NEWLY added…
    expect(next).not.toBe(data) // …but the stamp is a data change (persists)
    expect(next.workingOn).toEqual(['t1']) // not duplicated
    expect(next.tasks[0].deadlineAutoAdded).toBe(TODAY)
  })

  it('never re-adds after the user manually removed it (same deadline)', () => {
    // t1 was auto-added for this deadline yesterday, then manually removed
    const data = baseData({
      tasks: [task('t1', { deadline: '2026-11-17', deadlineAutoAdded: '2026-11-17' })],
      workingOn: []
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual([])
    expect(next).toBe(data)
    expect(next.workingOn).toEqual([])
  })

  it('a NEW deadline re-arms the auto-add', () => {
    const data = baseData({
      tasks: [task('t1', { deadline: TODAY, deadlineAutoAdded: '2026-11-01' })]
    })
    const { data: next, added } = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(added).toEqual(['t1'])
    expect(next.workingOn).toEqual(['t1'])
    expect(next.tasks[0].deadlineAutoAdded).toBe(TODAY)
  })

  it('is idempotent — running twice changes nothing the second time', () => {
    const data = baseData({ tasks: [task('t1', { deadline: TODAY })] })
    const first = applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(first.added).toEqual(['t1'])

    const second = applyDueDeadlines({ data: first.data, today: TODAY, now: NOW })
    expect(second.added).toEqual([])
    expect(second.data).toBe(first.data) // same reference — no further write
  })

  it('never mutates the input data', () => {
    const data = baseData({
      tasks: [task('t1', { deadline: TODAY })],
      workingOn: ['other']
    })
    const snapshot = JSON.stringify(data)
    applyDueDeadlines({ data, today: TODAY, now: NOW })
    expect(JSON.stringify(data)).toBe(snapshot)
  })

  it('returns the input reference unchanged for non-object data', () => {
    const { data: out, added } = applyDueDeadlines({ data: null, today: TODAY, now: NOW })
    expect(out).toBe(null)
    expect(added).toEqual([])
  })
})
