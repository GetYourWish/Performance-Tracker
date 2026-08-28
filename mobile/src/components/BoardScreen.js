// BoardScreen — the main tab, desktop Board.jsx parity on Android:
//  - DraggableFlatList over visible board items (markers + active tasks) in
//    board order; long-press the handle to drag (desktop: drag handle)
//  - today summary card scored by core calculateDayScore (identical numbers)
//  - FAB → add task (desktop header input); rows: star/check/trash
//  - marker pills: note (i), add-task-below (+), delete (✕)
//  - category sheet ≙ desktop category sidebar (place marker / create)
//  - pull-to-refresh + 15 s polling reload the file when Syncthing lands a
//    desktop edit (external change → full re-gate + heal + repaint)
// Every mutation flows through store.mutate → rebase → no-change-no-write.

import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, RefreshControl } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DraggableFlatList, ScaleDecorator } from 'react-native-draggable-flatlist'
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
  reorderBoard
} from '../actions.js'
import { SPACING } from '../theme.js'

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

  const handleDragEnd = useCallback(
    ({ data: ordered }) => {
      const orderedIds = ordered.map(item => item.key)
      const sameOrder =
        orderedIds.length === visibleItems.length &&
        orderedIds.every((id, i) => id === visibleItems[i].key)
      if (sameOrder) return
      run((d, now) => reorderBoard(d, orderedIds, now))
    },
    [run, visibleItems]
  )

  const renderItem = useCallback(
    ({ item, drag, isActive }) => {
      const dragProps = { drag, isActive }
      if (item.kind === 'task') {
        return (
          <ScaleDecorator>
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
              {...dragProps}
            />
          </ScaleDecorator>
        )
      }
      const marker = item.marker
      const category = categoriesById.get(marker.categoryId)
      return (
        <ScaleDecorator>
          <MarkerRow
            theme={theme}
            marker={marker}
            category={category}
            onNote={() => setNotingMarker(marker)}
            onAddBelow={() => setAddingBelowMarker(marker)}
            onDelete={() => setDeletingMarker(marker)}
            {...dragProps}
          />
        </ScaleDecorator>
      )
    },
    [theme, categoryLookup, workingOnSet, flowStateColor, categoriesById, run]
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
              accessibilityLabel="Refresh data"
            />
          </>
        }
      />

      <DraggableFlatList
        data={visibleItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        activationDistance={6}
        containerStyle={{ flex: 1 }}
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
