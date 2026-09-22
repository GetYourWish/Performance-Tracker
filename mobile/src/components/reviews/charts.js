// reviews/charts.js — the Reviews screen's data plumbing and View-based
// charts. Everything here is a faithful port of the DESKTOP
// Reviews.jsx / ChronoStream.jsx / StackedChart.jsx / HeatmapSkyline.jsx
// logic with two deliberate differences:
//   1. NO chart library — bars, stacks and the heatmap grid are plain RN
//      Views (flex widths/heights), so the app gains no native dependency.
//   2. Day scores come from core calculateDayScore (the desktop's inline
//      duplicates compute the same numbers — verified by the shared
//      golden-fixture contract).
//
// Every number a user sees must match the desktop exactly: same fatigue
// order, same category multipliers, same grouping (core groupTasksByDate
// sorts each day by completedAt — same as the desktop's pre-grouped map).

import React from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import {
  calculateDayScore,
  calculateTaskScoreBreakdown,
  formatDate,
  parseDate,
  getStartOfWeek
} from '@performance-tracker/core'
import {
  addDays,
  subDays,
  startOfDay,
  eachDayOfInterval,
  startOfMonth,
  startOfYear,
  formatWeekday,
  formatShortDate
} from '../../dates.js'
import { SPACING, TYPE } from '../../theme.js'

// --- score cache (desktop Dashboard.buildScoreCache, verbatim semantics) ---

export function buildScoreCache(completedTasks, difficulties, categories, fatigueInc, fatigueCap) {
  const cache = new Map()
  for (const task of completedTasks) {
    cache.set(
      task.id,
      calculateTaskScoreBreakdown(task, completedTasks, difficulties, fatigueInc, fatigueCap, categories)
    )
  }
  return cache
}

// --- range filtering (desktop Dashboard.filterByRange) ----------------------

// NOTE: Segmented reads opt.value — the option objects MUST carry `value`
// (a `key`-shaped list makes every tap onChange(undefined)).
export const RANGE_OPTIONS = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' }
]

export function filterByRange(tasks, rangeKey, now = new Date()) {
  if (rangeKey === 'all') return tasks
  let start = null
  if (rangeKey === '30d') start = subDays(now, 29)
  else if (rangeKey === '90d') start = subDays(now, 89)
  else if (rangeKey === 'year') start = startOfYear(now.getFullYear())
  if (!start) return tasks
  return tasks.filter(t => {
    if (!t.completion || !t.completion.completedAt) return false
    return new Date(t.completion.completedAt) >= start
  })
}

// --- per-day series (desktop ChronoStream/StackedChart data derivation) ----

// One entry per calendar day in [start, end]:
//   { date, day, dayName, fullDate, score, count, isFuture }
// Future days (week/month views) carry score:null — the desktop renders
// them as empty chart area; we render them as flat, dimmed slots.
export function buildDaySeries({ start, end, tasksByDate, difficulties, categories, settings }) {
  const days = eachDayOfInterval({ start, end })
  const today = startOfDay(new Date())
  return days.map(day => {
    const dateStr = formatDate(day)
    const daysTasks = tasksByDate.get(dateStr) || []
    const isFuture = startOfDay(day) > today
    if (isFuture) {
      return {
        date: dateStr,
        day,
        dayName: formatWeekday(day),
        fullDate: formatShortDate(day),
        score: null,
        count: 0,
        isFuture: true
      }
    }
    const score = calculateDayScore(
      daysTasks,
      difficulties,
      settings.fatigueIncrement || 0.10,
      settings.fatigueCap || 3.0,
      categories
    )
    return {
      date: dateStr,
      day,
      dayName: formatWeekday(day),
      fullDate: formatShortDate(day),
      score,
      count: daysTasks.length,
      isFuture: false
    }
  })
}

// Range windows for the Flow State / Stacked tabs (desktop ChronoStream
// dateRange: 'week' = current week, 'month' = current month, 'all' = first
// logged day .. last logged day).
export function resolveChartRange(range, completedTasks, weekStartsOn) {
  const today = startOfDay(new Date())
  if (range === 'week') {
    // core getStartOfWeek(date, weekStartsOn) takes the NUMBER directly
    // (date-fns's { weekStartsOn } options-object convention is desktop-only).
    const start = getStartOfWeek(today, weekStartsOn || 1)
    const end = addDays(start, 6)
    return { start, end }
  }
  if (range === 'month') {
    const start = startOfMonth(today)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return { start, end }
  }
  const dates = completedTasks
    .map(t => (t.completion ? t.completion.completedDate : null))
    .filter(Boolean)
    .sort()
  if (dates.length === 0) return { start: today, end: today }
  return { start: parseDate(dates[0]), end: parseDate(dates[dates.length - 1]) }
}

// --- shared chart chrome ------------------------------------------------------

function ChartEmpty({ theme, label }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
      <Text style={{ color: theme.textMuted, ...TYPE.secondary }}>{label}</Text>
    </View>
  )
}

// --- Flow State bars (desktop ChronoStream area chart → mobile bar rows) ----
// Vertical score bars: one per day, colored with the user's Flow State
// color (settings.flowStateColor), future days dimmed, tap → that day.
export function FlowStateBars({ theme, series, flowStateColor, onDayPress }) {
  const real = series.filter(d => !d.isFuture)
  if (real.length === 0) return <ChartEmpty theme={theme} label="No completions in this range yet" />
  const max = Math.max(...real.map(d => d.score), 1)

  const barFor = d => {
    const h = d.isFuture ? 0 : Math.max(4, Math.round((d.score / max) * 120))
    return (
      <Pressable
        key={d.date}
        onPress={() => !d.isFuture && onDayPress && onDayPress(d.date)}
        disabled={d.isFuture}
        style={{ flex: 1, alignItems: 'center', gap: 4 }}
        accessibilityLabel={`${d.fullDate}: ${d.isFuture ? 'no data yet' : `${Math.round(d.score * 10) / 10} points, ${d.count} tasks`}`}
        accessibilityRole="button"
      >
        <Text style={{ color: theme.textMuted, fontSize: 9.5 }}>
          {d.isFuture ? '' : String(Math.round(d.score * 10) / 10)}
        </Text>
        <View
          style={{
            width: '78%',
            maxWidth: 34,
            minHeight: 4,
            height: h,
            borderRadius: 5,
            backgroundColor: d.isFuture ? theme.bgTertiary : flowStateColor,
            opacity: d.isFuture ? 0.5 : d.score > 0 ? 1 : 0.45
          }}
        />
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{d.dayName}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 9 }}>{d.fullDate}</Text>
      </Pressable>
    )
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>{series.map(barFor)}</View>
      <Text style={{ color: theme.textMuted, marginTop: SPACING.sm, ...TYPE.caption, textAlign: 'center' }}>
        Tap a bar to open that day
      </Text>
    </View>
  )
}

// --- Stacked category bars (desktop StackedChart → mobile stacked columns) --

// Per day: a column of colored segments — one per category, height
// proportional to the category's points that day (uncategorized gray).
export function StackedCategoryBars({ theme, series, tasksByDate, categories, scoreCache, onDayPress }) {
  const real = series.filter(d => !d.isFuture && d.count > 0)
  if (real.length === 0) return <ChartEmpty theme={theme} label="No completions in this range yet" />

  const catMap = new Map(categories.map(c => [c.id, c]))
  const UNCATEGORIZED = { id: '__none__', name: 'Uncategorized', color: '#9ca3af' }

  const rows = real.map(d => {
    const dayTasks = tasksByDate.get(d.date) || []
    const byCat = new Map()
    for (const t of dayTasks) {
      const cat = t.completion.categoryId ? catMap.get(t.completion.categoryId) : null
      const key = cat ? cat.id : UNCATEGORIZED.id
      const bd = scoreCache.get(t.id)
      const pts = bd ? bd.finalScore : 0
      byCat.set(key, (byCat.get(key) || 0) + pts)
    }
    return { day: d, segments: [...byCat.entries()] }
  })

  const maxDay = Math.max(
    ...rows.map(r => r.segments.reduce((s, [, pts]) => s + pts, 0)),
    1
  )

  const legendIds = new Set()
  rows.forEach(r => r.segments.forEach(([id]) => legendIds.add(id)))
  const legend = [...legendIds].map(id => {
    if (id === UNCATEGORIZED.id) return UNCATEGORIZED
    const c = catMap.get(id)
    return c || UNCATEGORIZED
  })

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        {rows.map(({ day, segments }) => {
          const total = segments.reduce((s, [, pts]) => s + pts, 0)
          return (
            <Pressable
              key={day.date}
              onPress={() => onDayPress && onDayPress(day.date)}
              style={{ flex: 1, alignItems: 'center', gap: 4 }}
              accessibilityLabel={`${day.fullDate}: ${Math.round(total * 10) / 10} points`}
              accessibilityRole="button"
            >
              <View
                style={{
                  width: '82%',
                  maxWidth: 36,
                  minHeight: 6,
                  height: Math.max(6, Math.round((total / maxDay) * 130)),
                  borderRadius: 5,
                  overflow: 'hidden',
                  flexDirection: 'column-reverse'
                }}
              >
                {segments.map(([id, pts]) => {
                  const cat = id === UNCATEGORIZED.id ? UNCATEGORIZED : catMap.get(id) || UNCATEGORIZED
                  return (
                    <View
                      key={id}
                      style={{
                        height: `${(pts / total) * 100}%`,
                        backgroundColor: cat.color
                      }}
                    />
                  )
                })}
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{day.dayName}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 9 }}>{day.fullDate}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.md }}>
        {legend.map(c => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.color }} />
            <Text style={{ color: theme.textSecondary, ...TYPE.caption }}>{c.name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// --- Heatmap (desktop HeatmapSkyline/HeatmapGrid → mobile scrollable grid) --

// GitHub-style year grid: 7 weekday rows × N week columns, horizontally
// scrollable, month labels on top. Cell intensity follows the desktop's
// getColorIntensity quartiles; value = score or count per
// settings.heatmapMode. Tap a cell → that day.
export function HeatmapColor(value, maxValue) {
  if (value === 0) return null // caller renders the empty tint
  const ratio = Math.min(value / maxValue, 1)
  if (ratio > 0.75) return '#22c55e'
  if (ratio > 0.5) return '#4ade80'
  if (ratio > 0.25) return '#86efac'
  return '#bbf7d0'
}

export function buildHeatmapYear({ year, tasksByDate, difficulties, categories, settings }) {
  const start = startOfYear(year)
  const end = new Date(year, 11, 31)
  const days = eachDayOfInterval({ start, end })
  return days.map(day => {
    const dateStr = formatDate(day)
    const daysTasks = tasksByDate.get(dateStr) || []
    let value
    if (settings.heatmapMode === 'count') {
      value = daysTasks.length
    } else {
      value = calculateDayScore(
        daysTasks,
        difficulties,
        settings.fatigueIncrement || 0.10,
        settings.fatigueCap || 3.0,
        categories
      )
    }
    return { date: dateStr, day, value }
  })
}

export function HeatmapGrid({ theme, cells, onDayPress }) {
  if (cells.length === 0) return <ChartEmpty theme={theme} label="No data for this year" />
  const max = Math.max(...cells.map(c => c.value), 1)

  // Column layout: weeks start Sunday (the desktop grid simply flows days
  // left→right, top→bottom in weekday rows — the first column is padded so
  // Jan 1 lands on its weekday row).
  const firstDay = cells[0].day
  const leadPadding = firstDay.getDay()
  const columns = []
  let current = []
  for (let i = 0; i < leadPadding; i++) current.push(null)
  for (const cell of cells) {
    current.push(cell)
    if (cell.day.getDay() === 6) {
      columns.push(current)
      current = []
    }
  }
  if (current.length > 0) columns.push(current)

  // Month label per column: the month of the column's first REAL cell,
  // printed only when it changes (desktop prints Jan Feb Mar … over the
  // columns where months start).
  const monthLabels = columns.map((col, i) => {
    const first = col.find(Boolean)
    if (!first) return ''
    const m = first.day.getMonth()
    const prev = i > 0 ? columns[i - 1].find(Boolean) : null
    const prevM = prev ? prev.day.getMonth() : -1
    return m !== prevM ? formatShortDate(first.day).split(' ')[0] : ''
  })

  const CELL = 13
  const GAP = 3

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xs }}>
        <View>
          <View style={{ flexDirection: 'row', gap: GAP, marginBottom: 4, height: 14 }}>
            {monthLabels.map((label, i) => (
              <Text key={i} style={{ color: theme.textMuted, fontSize: 9.5, width: CELL, textAlign: 'center' }} numberOfLines={1}>
                {label}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: GAP }}>
            {columns.map((col, ci) => (
              <View key={ci} style={{ gap: GAP }}>
                {col.map((cell, ri) => {
                  if (!cell) return <View key={ri} style={{ width: CELL, height: CELL }} />
                  const color = HeatmapColor(cell.value, max)
                  return (
                    <Pressable
                      key={cell.date}
                      onPress={() => cell.value > 0 && onDayPress && onDayPress(cell.date)}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 3,
                        backgroundColor: color || theme.bgTertiary
                      }}
                      accessibilityLabel={`${cell.date}: ${cell.value === 0 ? 'no completions' : `${Math.round(cell.value * 10) / 10}`}`}
                      accessibilityRole="button"
                    />
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.md, justifyContent: 'center' }}>
        <Text style={{ color: theme.textMuted, fontSize: 10 }}>Less</Text>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: theme.bgTertiary }} />
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#bbf7d0' }} />
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#86efac' }} />
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#4ade80' }} />
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#22c55e' }} />
        <Text style={{ color: theme.textMuted, fontSize: 10 }}>More</Text>
      </View>
    </View>
  )
}
