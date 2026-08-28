// BoardScreen — the main tab. M1 renders the board read-only with the
// desktop-identical score summary; interactivity (drag, complete flow,
// editing) is layered on in M2 without changing this file's structure.

import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, FlatList, RefreshControl } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  calculateDayScore,
  getCurrentDate,
  getTaskCategory
} from '@performance-tracker/core'
import { TopAppBar, GlassCard, IconBtn, Snackbar } from './ui.js'
import { TaskRow, MarkerRow } from './rows.js'
import { RADIUS, SPACING } from '../theme.js'

export function BoardScreen({ theme, state, refreshing, onRefresh, onShowConflictInfo }) {
  const insets = useSafeAreaInsets()
  const [snack, setSnack] = useState(null)

  const data = state.data

  // Desktop Board derives: tasks = active only; board items filtered to
  // those that actually render (visibleBoardItems) so marker adjacency
  // works — same logic here.
  const tasksById = useMemo(() => {
    const map = new Map()
    for (const t of data?.tasks || []) map.set(t.id, t)
    return map
  }, [data?.tasks])

  const markersById = useMemo(() => {
    const map = new Map()
    for (const m of data?.markers || []) map.set(m.id, m)
    return map
  }, [data?.markers])

  const categoriesById = useMemo(() => {
    const map = new Map()
    for (const c of data?.categories || []) map.set(c.id, c)
    return map
  }, [data?.categories])

  // Desktop pre-computes task→category over the FULL board (index-based
  // strict marker rule) — replicate exactly.
  const categoryLookup = useMemo(() => {
    const map = new Map()
    const boardItems = data?.board || []
    const markers = data?.markers || []
    const categories = data?.categories || []
    for (let i = 0; i < boardItems.length; i++) {
      const item = boardItems[i]
      if (item.type !== 'task') continue
      const cat = getTaskCategory(i, boardItems, markers, categories)
      if (cat) map.set(item.taskId, cat)
    }
    return map
  }, [data?.board, data?.markers, data?.categories])

  const visibleItems = useMemo(() => {
    const out = []
    for (const item of data?.board || []) {
      if (item.type === 'task') {
        const task = tasksById.get(item.taskId)
        if (task && !task.completion) out.push({ key: item.taskId, kind: 'task', task })
      } else if (item.type === 'marker') {
        const marker = markersById.get(item.markerId)
        if (marker) out.push({ key: item.markerId, kind: 'marker', marker })
      }
    }
    return out
  }, [data?.board, tasksById, markersById])

  // Today summary — desktop-identical scoring via core
  const today = getCurrentDate()
  const todaySummary = useMemo(() => {
    const settings = data?.settings || {}
    const completedToday = (data?.tasks || []).filter(
      t => t.completion && t.completion.completedDate === today
    )
    const score = calculateDayScore(
      completedToday,
      data?.difficulties || [],
      settings.fatigueIncrement || 0.10,
      settings.fatigueCap || 3.0,
      data?.categories || []
    )
    return { score, count: completedToday.length, workingOn: (data?.workingOn || []).length }
  }, [data, today])

  const workingOnSet = useMemo(() => new Set(data?.workingOn || []), [data?.workingOn])
  const flowStateColor = data?.settings?.flowStateColor || '#8b5cf6'

  const renderItem = useCallback(
    ({ item }) => {
      if (item.kind === 'task') {
        return (
          <TaskRow
            theme={theme}
            task={item.task}
            category={categoryLookup.get(item.key) || null}
            isWorkingOn={workingOnSet.has(item.key)}
            flowStateColor={flowStateColor}
          />
        )
      }
      const marker = item.marker
      const category = categoriesById.get(marker.categoryId)
      return <MarkerRow theme={theme} marker={marker} category={category} />
    },
    [theme, categoryLookup, workingOnSet, flowStateColor, categoriesById]
  )

  const scoreText =
    Number.isFinite(todaySummary.score) && todaySummary.score !== 0
      ? String(Math.round(todaySummary.score * 100) / 100)
      : '0'

  return (
    <View style={{ flex: 1 }}>
      <TopAppBar
        theme={theme}
        title="Board"
        subtitle={state.conflicts.length > 0 ? `${state.conflicts.length} sync conflict file(s) detected` : null}
        actions={
          <IconBtn
            name={refreshing ? 'loading' : 'refresh'}
            color={theme.textSecondary}
            onPress={onRefresh}
            accessibilityLabel="Refresh data"
          />
        }
      />

      <FlatList
        data={visibleItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.md,
          paddingBottom: insets.bottom + 120
        }}
        ListHeaderComponent={
          <>
            {state.conflicts.length > 0 ? (
              <GlassCard
                theme={theme}
                style={{
                  padding: SPACING.md,
                  marginBottom: SPACING.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.sm,
                  borderColor: '#dc2626'
                }}
              >
                <Icon name="alert-octagon" size={20} color="#dc2626" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 14 }}>
                    Sync conflict copies found
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                    Syncthing kept both versions. Nothing was changed automatically.
                  </Text>
                </View>
                <IconBtn
                  name="chevron-right"
                  color={theme.textSecondary}
                  onPress={onShowConflictInfo}
                  accessibilityLabel="Show conflict details"
                />
              </GlassCard>
            ) : null}

            <GlassCard
              theme={theme}
              style={{
                padding: SPACING.lg,
                marginBottom: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center'
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500' }}>
                  Today · {today}
                </Text>
                <Text style={{ color: theme.textPrimary, fontSize: 30, fontWeight: '700', marginTop: 2 }}>
                  {scoreText}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {todaySummary.count} completed
                </Text>
                <Text style={{ color: flowStateColor, fontSize: 13 }}>
                  {todaySummary.workingOn} working on
                </Text>
              </View>
            </GlassCard>

            {visibleItems.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xxl }}>
                <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: '600' }}>
                  No tasks yet
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 14,
                    marginTop: 6,
                    textAlign: 'center',
                    paddingHorizontal: SPACING.xl
                  }}
                >
                  Add tasks on the desktop or here — they sync through the shared tracker.json.
                </Text>
              </View>
            ) : null}
          </>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />
        }
      />

      <Snackbar theme={theme} message={snack} onDone={() => setSnack(null)} />
    </View>
  )
}
