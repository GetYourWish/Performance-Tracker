// CalendarScreen — the month grid, desktop CalendarPage.jsx parity (v1.4.0).
//
// User request (2026-11-18): "clicking on a task in the calendar section
// should let me see information in regards of it like the category and the
// full task text etc and within the shown info there should also be a
// button that lets me go right to where it is on the board."
//
// Same rules as the desktop v1.3.0 Calendar page, so both apps can never
// disagree: uncompleted tasks with a deadline render as pills on their due
// day (red overdue / amber due today), month/year navigation + Today
// anchor, settings-aware week start, due/overdue summary for the visible
// month. Tapping a pill opens a details dialog (full text, category derived
// from the task's board position, deadline state) with a "Go to Board"
// button that switches to the Board tab and teleports to the task's row —
// the same measureInWindow/scrollToOffset + flash plumbing the dice and
// category sheet use. Cells cap at 3 pills + "+N more" → day sheet listing
// every task of the day (each row opens the details dialog).
//
// Read-only screen: it renders state.data and never mutates the store, so
// both apps can never disagree about the data, only ever about presentation.

import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  formatDate,
  getCurrentDate,
  getDaysInMonth,
  getTaskCategory,
  deadlineState,
  parseDate
} from '@performance-tracker/core'
import { TopAppBar, Dialog, TextButton, FilledButton } from './ui.js'
import { withAlpha } from './rows.js'
import { SPACING, TYPE, RADIUS } from '../theme.js'
import { formatLongDate } from '../dates.js'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Desktop deadline colors (components.css .calendar-task-pill) — one palette
// across both apps.
const COLOR_OVERDUE = '#ef4444'
const COLOR_DUE_TODAY = '#f59e0b'
const COLOR_ACCENT = '#8b5cf6'

// Max pills rendered inside one day cell; the rest roll into "+N more",
// which opens the full day list (Google-Calendar-style month density).
const MAX_CHIPS_PER_CELL = 3

function labelStyle(theme) {
  return {
    color: theme.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6
  }
}

function pluralTasks(count) {
  return `${count} task${count !== 1 ? 's' : ''}`
}

// One compact task pill inside a day cell (desktop .calendar-task-pill).
// Plain style object (not a function) so tests can read the state colors
// from props; pressed feedback comes from the Android ripple.
function CalendarChip({ theme, task, category, today, onOpen }) {
  const info = deadlineState(task.deadline, today)
  const overdue = Boolean(info && info.overdue)
  const dueToday = Boolean(info && info.dueToday)
  const textColor = overdue
    ? COLOR_OVERDUE
    : dueToday
      ? COLOR_DUE_TODAY
      : theme.textPrimary

  return (
    <Pressable
      onPress={() => onOpen(task)}
      accessibilityRole="button"
      accessibilityLabel={`Task: ${task.text}`}
      android_ripple={{ color: theme.ripple }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: 4,
        borderRadius: RADIUS.sm,
        backgroundColor: overdue
          ? withAlpha(COLOR_OVERDUE, '1F')
          : dueToday
            ? withAlpha(COLOR_DUE_TODAY, '1F')
            : theme.rowFill,
        borderLeftWidth: 2.5,
        borderLeftColor: overdue
          ? COLOR_OVERDUE
          : dueToday
            ? COLOR_DUE_TODAY
            : category?.color || theme.textMuted
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 11,
          lineHeight: 14,
          color: textColor
        }}
      >
        {task.text}
      </Text>
    </Pressable>
  )
}

export function CalendarScreen({ theme, state, onGoToBoard }) {
  const insets = useSafeAreaInsets()
  const data = state.data
  const tasks = data?.tasks || []
  const categories = data?.categories || []
  const boardItems = data?.board || []
  const markers = data?.markers || []
  const settings = data?.settings || {}
  const rawWeekStart = Number(settings.weekStartsOn)
  const weekStartsOn = Number.isInteger(rawWeekStart) && rawWeekStart >= 0 && rawWeekStart <= 6
    ? rawWeekStart
    : 1

  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [detailTask, setDetailTask] = useState(null)
  const [dayListDate, setDayListDate] = useState(null) // 'YYYY-MM-DD'

  const today = getCurrentDate()

  // --- data grouping (desktop CalendarPage parity) -------------------------

  // Uncompleted tasks with a valid deadline, grouped by deadline date.
  const byDeadline = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (!t || t.completion) continue
      if (typeof t.deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)) continue
      const list = map.get(t.deadline)
      if (list) list.push(t)
      else map.set(t.deadline, [t])
    }
    return map
  }, [tasks])

  // Category per active task, derived from board position exactly like the
  // board rows do (getTaskCategory with the task's board index) — the same
  // rule the desktop calendar uses.
  const activeCategoryLookup = useMemo(() => {
    const map = new Map()
    boardItems.forEach((item, i) => {
      if (item?.type !== 'task') return
      map.set(item.taskId, getTaskCategory(i, boardItems, markers, categories))
    })
    return map
  }, [boardItems, markers, categories])

  // Which task ids actually have a row on the board (drives the
  // "Go to Board" button — a task without a board row has nowhere to go)
  const boardTaskIds = useMemo(
    () => new Set(boardItems.filter(i => i?.type === 'task').map(i => i.taskId)),
    [boardItems]
  )

  // Summary numbers for the visible month (and overdue overall) — the same
  // line the desktop calendar subtitle shows.
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  let dueInMonth = 0
  let overdue = 0
  for (const [iso, list] of byDeadline) {
    if (iso.startsWith(monthPrefix)) dueInMonth += list.length
    if (iso < today) overdue += list.length
  }

  // --- month grid ----------------------------------------------------------

  const daysInMonth = getDaysInMonth(cursor.year, cursor.month)
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay()
  const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7

  // weeks[0] = [null, null, 1, 2, 3, 4, 5] (null = blank cell)
  const weeks = useMemo(() => {
    const out = []
    let week = Array.from({ length: leadingBlanks }, () => null)
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d)
      if (week.length === 7) {
        out.push(week)
        week = []
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      out.push(week)
    }
    return out
  }, [leadingBlanks, daysInMonth])

  const weekdayOrder = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStartsOn + i) % 7]),
    [weekStartsOn]
  )

  const todayDate = new Date()
  const isToday = (day) =>
    cursor.year === todayDate.getFullYear() &&
    cursor.month === todayDate.getMonth() &&
    day === todayDate.getDate()

  const dateStrFor = (day) => formatDate(new Date(cursor.year, cursor.month, day))

  const goPreviousMonth = useCallback(() => {
    setCursor(c => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))
  }, [])
  const goNextMonth = useCallback(() => {
    setCursor(c => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))
  }, [])
  const goPreviousYear = useCallback(() => setCursor(c => ({ ...c, year: c.year - 1 })), [])
  const goNextYear = useCallback(() => setCursor(c => ({ ...c, year: c.year + 1 })), [])
  const goToday = useCallback(() => {
    const d = new Date()
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }, [])

  const closeDetail = useCallback(() => setDetailTask(null), [])
  const closeDayList = useCallback(() => setDayListDate(null), [])

  // Task tapped on a chip → details (desktop parity: category, full text,
  // deadline state + Go to Board when the task is on the board).
  const detail = detailTask
    ? (() => {
        const category = activeCategoryLookup.get(detailTask.id) || null
        const info = deadlineState(detailTask.deadline, today)
        const onBoard = boardTaskIds.has(detailTask.id)
        return { task: detailTask, category, info, onBoard }
      })()
    : null

  // Day tapped on "+N more" → full list of that day's tasks.
  const dayList = dayListDate
    ? { date: dayListDate, tasks: byDeadline.get(dayListDate) || [] }
    : null

  const monthTitle = `${MONTH_NAMES[cursor.month]} ${cursor.year}`

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgCanvas }}>
      <TopAppBar
        theme={theme}
        title="Calendar"
        subtitle="Tasks by deadline — tap a task for details"
      />
      <ScrollView
        contentContainerStyle={{
          padding: SPACING.md,
          paddingBottom: insets.bottom + SPACING.xxl,
          gap: SPACING.sm
        }}
      >
        {/* month + year navigation (desktop header parity) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
          <Pressable
            onPress={goPreviousYear}
            accessibilityRole="button"
            accessibilityLabel="Previous year"
            android_ripple={{ color: theme.ripple, borderless: true }}
            style={{
              padding: SPACING.xs,
              borderRadius: RADIUS.md,
              backgroundColor: theme.bgSecondary
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 16, lineHeight: 18 }}>{'«'}</Text>
          </Pressable>
          <Pressable
            onPress={goPreviousMonth}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            android_ripple={{ color: theme.ripple, borderless: true }}
            style={{
              padding: SPACING.xs,
              borderRadius: RADIUS.md,
              backgroundColor: theme.bgSecondary
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 18, lineHeight: 20 }}>{'‹'}</Text>
          </Pressable>
          <Text
            style={{ flex: 1, textAlign: 'center', color: theme.textPrimary, ...TYPE.cardTitle }}
          >
            {monthTitle}
          </Text>
          <Pressable
            onPress={goNextMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            android_ripple={{ color: theme.ripple, borderless: true }}
            style={{
              padding: SPACING.xs,
              borderRadius: RADIUS.md,
              backgroundColor: theme.bgSecondary
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 18, lineHeight: 20 }}>{'›'}</Text>
          </Pressable>
          <Pressable
            onPress={goNextYear}
            accessibilityRole="button"
            accessibilityLabel="Next year"
            android_ripple={{ color: theme.ripple, borderless: true }}
            style={{
              padding: SPACING.xs,
              borderRadius: RADIUS.md,
              backgroundColor: theme.bgSecondary
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 16, lineHeight: 18 }}>{'»'}</Text>
          </Pressable>
          <TextButton theme={theme} label="Today" onPress={goToday} />
        </View>

        {/* due/overdue summary — the desktop subtitle line */}
        <Text style={{ color: theme.textSecondary, ...TYPE.caption, textAlign: 'center' }}>
          {dueInMonth > 0
            ? `${pluralTasks(dueInMonth)} due in ${MONTH_NAMES[cursor.month]}`
            : `No tasks due in ${MONTH_NAMES[cursor.month]}`}
          {overdue > 0 ? ` · ${pluralTasks(overdue)} overdue` : ''}
        </Text>

        {/* weekday header */}
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {weekdayOrder.map(d => (
            <View key={d} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 }}>
                {d.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>

        {/* month grid — one row per week */}
        <View style={{ gap: 2 }}>
          {weeks.map((week, wi) => (
            <View key={`w${wi}`} style={{ flexDirection: 'row', gap: 2 }}>
              {week.map((day, di) => {
                if (day === null) {
                  return <View key={`blank-${di}`} style={{ flex: 1, minHeight: 64 }} />
                }
                const dateStr = dateStrFor(day)
                const dueTasks = byDeadline.get(dateStr) || []
                const shown = dueTasks.slice(0, MAX_CHIPS_PER_CELL)
                const hidden = dueTasks.length - shown.length
                return (
                  <View
                    key={`d${day}`}
                    style={{
                      flex: 1,
                      minHeight: 64,
                      padding: 3,
                      borderRadius: RADIUS.md,
                      backgroundColor: theme.bgSecondary,
                      borderWidth: 1,
                      borderColor: isToday(day) ? COLOR_ACCENT : theme.border,
                      gap: 2
                    }}
                  >
                    <Text
                      style={{
                        color: isToday(day) ? COLOR_ACCENT : theme.textSecondary,
                        fontSize: 11,
                        fontWeight: '700',
                        textAlign: 'center'
                      }}
                    >
                      {day}
                    </Text>
                    {shown.map(t => (
                      <CalendarChip
                        key={t.id}
                        theme={theme}
                        task={t}
                        category={activeCategoryLookup.get(t.id)}
                        today={today}
                        onOpen={setDetailTask}
                      />
                    ))}
                    {hidden > 0 && (
                      <Pressable
                        onPress={() => setDayListDate(dateStr)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show all ${dueTasks.length} tasks on ${dateStr}`}
                      >
                        <Text style={{ color: theme.textMuted, fontSize: 10.5, fontWeight: '600', paddingLeft: 2 }}>
                          {`+${hidden} more`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* day sheet — the "+N more" overflow list */}
      <Dialog
        theme={theme}
        visible={Boolean(dayList)}
        title={dayList ? formatLongDate(parseDate(dayList.date)) : ''}
        onClose={closeDayList}
      >
        {dayList && dayList.tasks.length === 0 && (
          <Text style={{ color: theme.textMuted, ...TYPE.secondary }}>No tasks due on this day.</Text>
        )}
        {dayList &&
          dayList.tasks.map(t => (
            <Pressable
              key={t.id}
              onPress={() => {
                closeDayList()
                setDetailTask(t)
              }}
              accessibilityRole="button"
              accessibilityLabel={`Task: ${t.text}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACING.sm,
                paddingVertical: 10,
                paddingHorizontal: SPACING.sm,
                borderRadius: RADIUS.md,
                backgroundColor: pressed ? theme.rowFillSelected : 'transparent'
              })}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: activeCategoryLookup.get(t.id)?.color || theme.textMuted
                }}
              />
              <Text
                numberOfLines={2}
                style={{
                  flex: 1,
                  color: theme.textPrimary,
                  ...TYPE.body
                }}
              >
                {t.text}
              </Text>
            </Pressable>
          ))}
      </Dialog>

      {/* task details — desktop cal-detail-popup parity */}
      <Dialog
        theme={theme}
        visible={Boolean(detail)}
        title="Task Details"
        onClose={closeDetail}
        actions={
          <>
            <TextButton theme={theme} label="Close" onPress={closeDetail} />
            {detail?.onBoard && onGoToBoard && (
              <FilledButton
                theme={theme}
                label="Go to Board"
                icon="target"
                onPress={() => {
                  const id = detail.task.id
                  closeDetail()
                  onGoToBoard(id)
                }}
              />
            )}
          </>
        }
      >
        {detail && (
          <>
            <Text style={{ color: theme.textPrimary, ...TYPE.bodyStrong, marginBottom: SPACING.md }}>
              {detail.task.text}
            </Text>

            <Text style={labelStyle(theme)}>CATEGORY</Text>
            {detail.category ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.sm,
                  alignSelf: 'flex-start',
                  paddingVertical: 4,
                  paddingHorizontal: SPACING.sm,
                  borderRadius: 999,
                  backgroundColor: withAlpha(detail.category.color, '33'),
                  marginBottom: SPACING.md
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: detail.category.color
                  }}
                />
                <Text style={{ color: theme.textPrimary, ...TYPE.secondary }}>
                  {detail.category.name}
                </Text>
              </View>
            ) : (
              <Text style={{ color: theme.textMuted, ...TYPE.secondary, fontStyle: 'italic', marginBottom: SPACING.md }}>
                No category
              </Text>
            )}

            {detail.task.deadline && (
              <>
                <Text style={labelStyle(theme)}>DEADLINE</Text>
                <Text
                  style={{
                    color: detail.info?.overdue
                      ? COLOR_OVERDUE
                      : detail.info?.dueToday
                        ? COLOR_DUE_TODAY
                        : theme.textSecondary,
                    ...TYPE.bodyStrong,
                    marginBottom: SPACING.md
                  }}
                >
                  {detail.task.deadline}
                  {detail.info ? ` · ${detail.info.label}` : ''}
                </Text>
              </>
            )}
          </>
        )}
      </Dialog>
    </View>
  )
}
