// deadlines.test.js — deadline classification.
import { describe, it, expect } from 'vitest'
import { daysUntilDeadline, deadlineState } from '../index.js'

describe('daysUntilDeadline', () => {
  it('counts whole calendar days', () => {
    expect(daysUntilDeadline('2026-11-20', '2026-11-17')).toBe(3)
    expect(daysUntilDeadline('2026-11-17', '2026-11-17')).toBe(0)
    expect(daysUntilDeadline('2026-11-14', '2026-11-17')).toBe(-3)
  })
  it('crosses month and year boundaries', () => {
    expect(daysUntilDeadline('2026-12-01', '2026-11-30')).toBe(1)
    expect(daysUntilDeadline('2027-01-01', '2026-12-31')).toBe(1)
  })
})

describe('deadlineState', () => {
  it('returns null without a deadline', () => {
    expect(deadlineState(null, '2026-11-17')).toBeNull()
    expect(deadlineState(undefined, '2026-11-17')).toBeNull()
    expect(deadlineState('', '2026-11-17')).toBeNull()
  })
  it('returns null for malformed deadline strings instead of NaN labels', () => {
    // a full ISO datetime from a rogue writer must render as "no deadline",
    // never "in NaNd" (v1.4.0 guard)
    expect(deadlineState('2026-11-18T13:05:00.000Z', '2026-11-18')).toBeNull()
    expect(deadlineState('not-a-date', '2026-11-18')).toBeNull()
  })
  it('classifies overdue / today / tomorrow / future', () => {
    expect(deadlineState('2026-11-15', '2026-11-17')).toEqual({
      daysLeft: -2, overdue: true, dueToday: false, label: '2d overdue'
    })
    expect(deadlineState('2026-11-17', '2026-11-17')).toEqual({
      daysLeft: 0, overdue: false, dueToday: true, label: 'due today'
    })
    expect(deadlineState('2026-11-18', '2026-11-17')).toEqual({
      daysLeft: 1, overdue: false, dueToday: false, label: 'due tomorrow'
    })
    expect(deadlineState('2026-11-21', '2026-11-17')).toEqual({
      daysLeft: 4, overdue: false, dueToday: false, label: 'in 4d'
    })
  })
})
