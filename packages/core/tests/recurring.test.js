// recurring.test.js — weekday-scheduled pre-loaded tasks.
import { describe, it, expect } from 'vitest'
import { isDueOn, findSectionTopIndex, materializeRecurringTasks } from '../index.js'

// Deterministic id factory: ids in creation order n1, n2, …
const idFactory = (() => {
  let n = 0
  return () => `n${++n}`
})()

// 2026-11-17 is a TUESDAY (getDay() === 2).
const TUESDAY = '2026-11-17'
const MONDAY = '2026-11-16'
const NOW = '2026-11-17T08:00:00.000Z'

function baseData() {
  return {
    schemaVersion: 1,
    meta: { createdAt: NOW, updatedAt: NOW },
    settings: {},
    difficulties: [],
    categories: [
      {
        id: 'cat-work',
        name: 'Work',
        color: '#60a5fa',
        order: 0,
        active: true,
        priorityMultiplier: 2,
        recurringTasks: [
          { id: 'r-morning', text: 'Morning review', days: [1, 2, 3, 4, 5] }
        ]
      },
      {
        id: 'cat-chores',
        name: 'Chores',
        color: '#4ade80',
        order: 1,
        active: true,
        recurringTasks: [
          { id: 'r-sun', text: 'Weekly plan', days: [0] } // Sundays only
        ]
      }
    ],
    markers: [
      { id: 'mw1', categoryId: 'cat-work' },
      { id: 'mw2', categoryId: 'cat-work' }
    ],
    board: [
      { type: 'marker', markerId: 'mw1' },
      { type: 'marker', markerId: 'mw2' }
    ],
    tasks: [],
    workingOn: [],
    logs: []
  }
}

describe('isDueOn', () => {
  it('matches weekday membership (0=Sunday)', () => {
    expect(isDueOn({ text: 'x', days: [1, 2, 3, 4, 5] }, 2)).toBe(true)
    expect(isDueOn({ text: 'x', days: [0] }, 2)).toBe(false)
    expect(isDueOn({ text: 'x', days: [0] }, 0)).toBe(true)
  })
  it('rejects inactive, empty or malformed configs', () => {
    expect(isDueOn({ text: 'x', days: [2], active: false }, 2)).toBe(false)
    expect(isDueOn({ text: 'x', days: [] }, 2)).toBe(false)
    expect(isDueOn({ text: 'x', days: 'nope' }, 2)).toBe(false)
    expect(isDueOn({ text: '   ', days: [2] }, 2)).toBe(false)
    expect(isDueOn(null, 2)).toBe(false)
  })
})

describe('findSectionTopIndex', () => {
  it('finds a closed same-category section', () => {
    const d = baseData()
    expect(findSectionTopIndex(d.board, d.markers, 'cat-work')).toBe(0)
  })
  it('returns -1 when the next marker is a different category', () => {
    const markers = [
      { id: 'm1', categoryId: 'a' },
      { id: 'm2', categoryId: 'b' }
    ]
    const board = [
      { type: 'marker', markerId: 'm1' },
      { type: 'task', taskId: 't' },
      { type: 'marker', markerId: 'm2' }
    ]
    expect(findSectionTopIndex(board, markers, 'a')).toBe(-1)
  })
  it('returns -1 with no marker below (unclosed section)', () => {
    const markers = [{ id: 'm1', categoryId: 'a' }]
    const board = [
      { type: 'marker', markerId: 'm1' },
      { type: 'task', taskId: 't' }
    ]
    expect(findSectionTopIndex(board, markers, 'a')).toBe(-1)
  })
  it('returns -1 for a category with no markers', () => {
    const d = baseData()
    expect(findSectionTopIndex(d.board, d.markers, 'cat-chores')).toBe(-1)
  })
})

describe('materializeRecurringTasks', () => {
  it('creates due instances, adds them to workingOn, stamps lastRun', () => {
    const d = baseData()
    const { data, created } = materializeRecurringTasks({
      data: d, today: TUESDAY, now: NOW, generateId: idFactory
    })

    expect(created).toHaveLength(1) // Monday–Friday task only; Sunday task not due
    expect(created[0].text).toBe('Morning review')
    expect(created[0].recurringOf).toBe('r-morning')
    expect(created[0].completion).toBeNull()

    // inserted directly below the section's top marker
    expect(data.board[1]).toEqual({ type: 'task', taskId: created[0].id })

    // auto working-on
    expect(data.workingOn).toEqual([created[0].id])

    // lastRun stamped
    expect(data.categories[0].recurringTasks[0].lastRun).toBe(TUESDAY)
    expect(data.categories[1].recurringTasks[0].lastRun).toBeUndefined()

    // meta bumped (mutating action)
    expect(data.meta.updatedAt).toBe(NOW)
  })

  it('is idempotent for the same day (lastRun guard)', () => {
    const first = materializeRecurringTasks({
      data: baseData(), today: TUESDAY, now: NOW, generateId: idFactory
    })
    const second = materializeRecurringTasks({
      data: first.data, today: TUESDAY, now: NOW, generateId: idFactory
    })
    expect(second.created).toEqual([])
    expect(second.data).toBe(first.data) // exact same reference — no rewrite
  })

  it('creates a fresh [marker, task, marker] section when the category has none', () => {
    const d = baseData()
    const { data, created } = materializeRecurringTasks({
      data: d, today: '2026-11-22', now: NOW, generateId: idFactory // a Sunday
    })
    // Chores (Sunday task) has no markers → 2 new markers + task appended
    expect(created).toHaveLength(1)
    expect(created[0].text).toBe('Weekly plan')
    const tail = data.board.slice(-3)
    expect(tail[0].type).toBe('marker')
    expect(tail[1]).toEqual({ type: 'task', taskId: created[0].id })
    expect(tail[2].type).toBe('marker')
    const openMarker = data.markers.find(m => m.id === tail[0].markerId)
    const closeMarker = data.markers.find(m => m.id === tail[2].markerId)
    expect(openMarker.categoryId).toBe('cat-chores')
    expect(closeMarker.categoryId).toBe('cat-chores')
  })

  it('new section markers inherit the category-level note', () => {
    const d = baseData()
    d.categories[1].note = 'shared chores note'
    const { data } = materializeRecurringTasks({
      data: d, today: '2026-11-22', now: NOW, generateId: idFactory
    })
    const tail = data.board.slice(-3)
    const openMarker = data.markers.find(m => m.id === tail[0].markerId)
    const closeMarker = data.markers.find(m => m.id === tail[2].markerId)
    expect(openMarker.note).toBe('shared chores note')
    expect(closeMarker.note).toBe('shared chores note')
  })

  it('never mutates the input data object', () => {
    const d = baseData()
    const snapshot = JSON.stringify(d)
    materializeRecurringTasks({ data: d, today: TUESDAY, now: NOW, generateId: idFactory })
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('returns the input reference unchanged when nothing is due', () => {
    const d = baseData()
    const { data, created } = materializeRecurringTasks({
      data: d, today: '2026-11-14', now: NOW, generateId: idFactory // Saturday
    })
    expect(created).toEqual([])
    expect(data).toBe(d)
  })

  it('skips inactive categories and inactive recurring configs', () => {
    const d = baseData()
    d.categories[0].active = false
    d.categories[1].recurringTasks[0].active = false
    const { created } = materializeRecurringTasks({
      data: d, today: '2026-11-22', now: NOW, generateId: idFactory
    })
    expect(created).toEqual([])
  })

  it('inserts into the FIRST closed section when several exist', () => {
    const d = baseData()
    d.markers.push(
      { id: 'mw3', categoryId: 'cat-work' },
      { id: 'mw4', categoryId: 'cat-work' }
    )
    d.board.push(
      { type: 'marker', markerId: 'mw3' },
      { type: 'task', taskId: 'existing' },
      { type: 'marker', markerId: 'mw4' }
    )
    const { data, created } = materializeRecurringTasks({
      data: d, today: TUESDAY, now: NOW, generateId: idFactory
    })
    expect(data.board[1]).toEqual({ type: 'task', taskId: created[0].id })
  })
})
