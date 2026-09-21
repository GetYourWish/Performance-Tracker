// BoardScreen — the main tab, desktop Board.jsx parity on Android:
//  - FlatList over visible board items (markers + active tasks) in board
//    order. Reordering is the desktop's own move-buttons model: tap ⋮⋮ on
//    any row to enter rearrange mode, move with ↑/↓, tap ✓ to finish.
//    (react-native-draggable-flatlist was removed in v1.0.7 — unmaintained
//    for React 19 + reanimated 4 and the prime suspect for the on-device
//    "create a task → crash"; see rows.js.)
//  - today summary card scored by core calculateDayScore (identical numbers)
//  - FAB → add task (desktop header input); rows: star/check/trash
//  - marker pills: note (i), add-task-below (+), delete (✕)
//  - category sheet ≙ desktop category sidebar (place marker / create)
//  - pull-to-refresh + 15 s polling reload the file when Syncthing lands a
//    desktop edit (external change → full re-gate + heal + repaint in place)
// Every mutation flows through store.mutate → rebase → no-change-no-write.

import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, FlatList, RefreshControl } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  calculateDayScore,
  getCurrentDate,
  getTaskCategory
} from '@performance-tracker/core'
import { TopAppBar, GlassCard, IconBtn, Fab, Snackbar } from './ui.js'
import { TaskRow, MarkerRow } from './rows.js'
import {
  TaskTextDialog,
  CompleteDialog,
  ConfirmDialog,
  MarkerNoteDialog
} from './dialogs.js'
import { CategorySheet } from './CategorySheet.js'
import {
  createTask,
  updateTaskText,
  deleteTask,
  completeTask,
  toggleWorkingOn,
  addMarker,
  deleteMarker,
  addTaskBelowMarker,
  updateMarkerNote,
  createCategory,
  moveItem
} from '../actions.js'
import { SPACING, TYPE } from '../theme.js'

export function BoardScreen({ theme, state, store, refreshing, onRefresh, onShowConflictInfo }) {
  const insets = useSafeAreaInsets()
  const [snack, setSnack] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null) // task object
  const [completingTask, setCompletingTask] = useState(null) // task object
  const [deletingTask, setDeletingTask] = useState(null) // task object
  const [deletingMarker, setDeletingMarker] = useState(null) // marker object
  const [notingMarker, setNotingMarker] = useState(null) // marker object
  const [addingBelowMarker, setAddingBelowMarker] = useState(null) // marker object
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rearranging, setRearranging] = useState(false)

  const data = state.data

  const run = useCallback(
    async (buildNext, successMessage) => {
      try {
        await store.mutate(buildNext)
        if (successMessage) setSnack(successMessage)
      } catch (e) {
        if (e && e.code === 'SCHEMA_VERSION_TOO_NEW') {
          setSnack(`File is now schema ${e.schemaVersion} — update this app first`)
        } else if (e instanceof SyntaxError) {
          setSnack('File on disk is not valid JSON — nothing was changed')
        } else {
          setSnack('Save failed: ' + (e.message || e))
        }
      }
    },
    [store]
  )

  // --- derived data (desktop Board memo parity) ---------------------------

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

  // --- handlers (desktop-identical outcomes) ------------------------------

  const handleAddTask = text => {
    setAddOpen(false)
    run((d, now) => createTask(d, text, now))
  }

  const handleSaveEdit = text => {
    const task = editingTask
    setEditingTask(null)
    if (!task || text === task.text) return
    run((d, now) => updateTaskText(d, task.id, text, now))
  }

  const handleConfirmComplete = ({ difficultyId, date, note }) => {
    const task = completingTask
    setCompletingTask(null)
    if (!task || !difficultyId) return
    run(
      (d, now) => completeTask(d, { taskId: task.id, difficultyId, date, note }, now),
      `+${task.text.length > 22 ? task.text.slice(0, 22) + '…' : task.text} completed`
    )
  }

  const handleDeleteTask = () => {
    const task = deletingTask
    setDeletingTask(null)
    if (!task) return
    run((d, now) => deleteTask(d, task.id, now), 'Task deleted')
  }

  const handleDeleteMarker = () => {
    const marker = deletingMarker
    setDeletingMarker(null)
    if (!marker) return
    run((d, now) => deleteMarker(d, marker.id, now), 'Marker removed')
  }

  // Reorder via the move buttons. Each tap is its own mutation; the store's
  // mutation queue composes rapid bursts in order into ONE verified write
  // (write serialization — see store.js), so holding ↓↓↓ is safe.
  const handleMove = useCallback(
    (itemId, direction) => {
      run((d, now) => moveItem(d, itemId, direction, now))
    },
    [run]
  )

  const toggleRearrange = useCallback(() => setRearranging(r => !r), [])

  const renderItem = useCallback(
    ({ item, index }) => {
      const moveProps = {
        rearranging,
        onToggleRearrange: toggleRearrange,
        onMoveUp: () => handleMove(item.key, 'up'),
        onMoveDown: () => handleMove(item.key, 'down'),
        canMoveUp: index > 0,
        canMoveDown: index < visibleItems.length - 1
      }
      if (item.kind === 'task') {
        return (
          <TaskRow
            theme={theme}
            task={item.task}
            category={categoryLookup.get(item.key) || null}
            isWorkingOn={workingOnSet.has(item.key)}
            flowStateColor={flowStateColor}
            onOpen={() => setEditingTask(item.task)}
            onComplete={() => setCompletingTask(item.task)}
            onDelete={() => setDeletingTask(item.task)}
            onToggleWorkingOn={() => run((d, now) => toggleWorkingOn(d, item.key, now))}
            {...moveProps}
          />
        )
      }
      const marker = item.marker
      const category = categoriesById.get(marker.categoryId)
      return (
        <MarkerRow
          theme={theme}
          marker={marker}
          category={category}
          onNote={() => setNotingMarker(marker)}
          onAddBelow={() => setAddingBelowMarker(marker)}
          onDelete={() => setDeletingMarker(marker)}
          {...moveProps}
        />
      )
    },
    [
      theme,
      categoryLookup,
      workingOnSet,
      flowStateColor,
      categoriesById,
      run,
      rearranging,
      toggleRearrange,
      handleMove,
      visibleItems.length
    ]
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
        subtitle={
          state.conflicts.length > 0
            ? `${state.conflicts.length} sync conflict file(s) detected`
            : null
        }
        actions={
          <>
            <IconBtn
              name="tag-multiple-outline"
              color={theme.textSecondary}
              onPress={() => setSheetOpen(true)}
              accessibilityLabel="Categories"
            />
            <IconBtn
              name={refreshing ? 'loading' : 'refresh'}
              color={theme.textSecondary}
              onPress={onRefresh}
              disabled={refreshing}
              accessibilityLabel="Refresh data"
            />
          </>
        }
      />

      <FlatList
        data={visibleItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.md,
          paddingBottom: insets.bottom + 140
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
                  borderColor: theme.danger
                }}
              >
                <Icon name="alert-octagon" size={20} color={theme.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 14 }}>
                    Sync conflict copies found
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 2, ...TYPE.caption }}>
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

            {rearranging ? (
              <GlassCard
                theme={theme}
                style={{
                  padding: SPACING.md,
                  marginBottom: SPACING.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.sm,
                  borderColor: theme.flowState
                }}
              >
                <Icon name="arrow-up-down-bold" size={20} color={theme.flowState} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 14 }}>
                    Rearranging
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 2, ...TYPE.caption }}>
                    Move items with the arrows. Tap the ✓ on a row when you&apos;re done.
                  </Text>
                </View>
                <IconBtn
                  name="check-circle-outline"
                  color={theme.flowState}
                  onPress={toggleRearrange}
                  accessibilityLabel="Finish rearranging"
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
                <Text style={{ color: theme.textSecondary, fontWeight: '600', letterSpacing: 0.8, fontSize: 11.5 }}>
                  TODAY · {today}
                </Text>
                <Text style={{ color: theme.textPrimary, marginTop: 2, ...TYPE.score }}>
                  {scoreText}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textSecondary, letterSpacing: 0 }}>
                    {'  '}pts
                  </Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: theme.textSecondary, ...TYPE.secondary }}>
                  {todaySummary.count} completed
                </Text>
                <Text style={{ color: flowStateColor, ...TYPE.secondary, fontWeight: '600' }}>
                  {todaySummary.workingOn} working on
                </Text>
              </View>
            </GlassCard>

            {visibleItems.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xxl }}>
                <Icon name="clipboard-check-outline" size={44} color={theme.textMuted} />
                <Text style={{ color: theme.textPrimary, marginTop: SPACING.md, ...TYPE.cardTitle }}>
                  No tasks yet
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    marginTop: 6,
                    textAlign: 'center',
                    paddingHorizontal: SPACING.xl,
                    ...TYPE.secondary
                  }}
                >
                  Tap + to add your first task and start tracking your performance!
                </Text>
              </View>
            ) : null}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        }
      />

      <Fab theme={theme} icon="plus" label="Task" onPress={() => setAddOpen(true)} />

      {/* --- dialogs --- */}
      <TaskTextDialog
        theme={theme}
        visible={addOpen}
        title="New task"
        onSubmit={handleAddTask}
        onClose={() => setAddOpen(false)}
      />
      <TaskTextDialog
        theme={theme}
        visible={!!editingTask}
        title="Edit task"
        initialText={editingTask?.text || ''}
        onSubmit={handleSaveEdit}
        onClose={() => setEditingTask(null)}
      />
      <CompleteDialog
        theme={theme}
        task={completingTask}
        difficulties={data?.difficulties || []}
        onConfirm={handleConfirmComplete}
        onClose={() => setCompletingTask(null)}
      />
      <ConfirmDialog
        theme={theme}
        visible={!!deletingTask}
        title="Delete task?"
        body={`${String(deletingTask?.text ?? '')}\n\nThis cannot be undone.`}
        onConfirm={handleDeleteTask}
        onClose={() => setDeletingTask(null)}
      />
      <ConfirmDialog
        theme={theme}
        visible={!!deletingMarker}
        title="Remove marker?"
        body={`The "${String(categoriesById.get(deletingMarker?.categoryId)?.name ?? '')}" marker will be removed from the board. The category itself is kept.`}
        confirmLabel="Remove"
        onConfirm={handleDeleteMarker}
        onClose={() => setDeletingMarker(null)}
      />
      <MarkerNoteDialog
        theme={theme}
        visible={!!notingMarker}
        categoryName={categoriesById.get(notingMarker?.categoryId)?.name}
        initialNote={notingMarker?.note || ''}
        onSave={note => {
          const marker = notingMarker
          setNotingMarker(null)
          if (!marker) return
          run((d, now) => updateMarkerNote(d, marker.id, note, now), 'Note saved')
        }}
        onClose={() => setNotingMarker(null)}
      />
      <TaskTextDialog
        theme={theme}
        visible={!!addingBelowMarker}
        title="New task below marker"
        onSubmit={text => {
          const marker = addingBelowMarker
          setAddingBelowMarker(null)
          if (!marker) return
          run((d, now) => addTaskBelowMarker(d, marker.id, text, now))
        }}
        onClose={() => setAddingBelowMarker(null)}
      />
      <CategorySheet
        theme={theme}
        visible={sheetOpen}
        categories={data?.categories || []}
        onAddMarker={categoryId => run((d, now) => addMarker(d, categoryId, now), 'Marker added')}
        onCreateCategory={({ name, color }) =>
          run((d, now) => createCategory(d, { name, color }, now), 'Category created')
        }
        onClose={() => setSheetOpen(false)}
      />

      <Snackbar theme={theme} message={snack} onDone={() => setSnack(null)} />
    </View>
  )
}
