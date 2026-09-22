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
//  - category sheet ≙ desktop category sidebar: tap a category to TELEPORT
//    to its first marker on the board (desktop chip click → scroll + flash),
//    the + button places a marker (v1.0.10)
//  - dice button in the top bar (desktop Randomizer): picks a random task,
//    marks it working-on, teleports to it (v1.0.10)
//  - "Working On (N)" pill on the today card opens the working-on sheet
//    (desktop nav marker button → WorkingOnPopup) where tasks complete
//    straight from the list (v1.0.10)
//  - pull-to-refresh + 15 s polling reload the file when Syncthing lands a
//    desktop edit (external change → full re-gate + heal + repaint in place)
// Every mutation flows through store.mutate → rebase → no-change-no-write.

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  calculateDayScore,
  getCurrentDate,
  getTaskCategory
} from '@performance-tracker/core'
import { TopAppBar, GlassCard, IconBtn, Fab, Snackbar } from './ui.js'
import { TaskRow, MarkerRow, withAlpha } from './rows.js'
import {
  TaskTextDialog,
  CompleteDialog,
  ConfirmDialog,
  MarkerNoteDialog
} from './dialogs.js'
import { CategorySheet } from './CategorySheet.js'
import { WorkingOnSheet } from './WorkingOnSheet.js'
import {
  createTask,
  updateTaskText,
  deleteTask,
  completeTask,
  toggleWorkingOn,
  addWorkingOn,
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
  const [workingOnOpen, setWorkingOnOpen] = useState(false)
  const [flashKey, setFlashKey] = useState(null)

  // Teleport plumbing: the FlatList ref, per-row layouts captured through
  // onLayout (row key → { y, height }), the viewport height, and the flash
  // timer (cleared on unmount so no setState lands on a dead screen).
  const listRef = useRef(null)
  const rowLayoutsRef = useRef(new Map())
  const listHeightRef = useRef(600)
  const flashTimerRef = useRef(null)

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    },
    []
  )

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

  // The tasks the desktop WorkingOnPopup lists — workingOn ids resolved to
  // task objects (missing ids filtered out, desktop .map/.filter parity).
  const workingOnTasks = useMemo(
    () => (data?.workingOn || []).map(id => tasksById.get(id)).filter(Boolean),
    [data?.workingOn, tasksById]
  )

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
    // completing from the working-on sheet closes the whole stack (desktop
    // WorkingOnPopup closes on complete too); from a board row this is a
    // no-op — the sheet is already closed
    setWorkingOnOpen(false)
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

  const shorten = (text, max = 26) => {
    const s = String(text ?? '')
    return s.length > max ? s.slice(0, max) + '…' : s
  }

  // --- teleport + flash (desktop scrollIntoView + .random-flash) -----------

  // Scroll the board so the row with this key sits mid-viewport (desktop
  // scrollIntoView({ block: 'center' })). Exact offsets come from onLayout;
  // a row too far offscreen to ever have been laid out falls back to the
  // FlatList index estimate. try/catch — a scroll that cannot happen (test
  // renderers, unmount races) must never take anything down with it.
  const scrollToItem = useCallback(
    key => {
      const list = listRef.current
      if (!list) return
      try {
        const layout = rowLayoutsRef.current.get(key)
        if (layout) {
          const center = Math.max(0, layout.y - listHeightRef.current / 2 + layout.height / 2)
          list.scrollToOffset({ offset: center, animated: true })
        } else {
          const index = visibleItems.findIndex(i => i.key === key)
          if (index >= 0) list.scrollToIndex({ index, viewPosition: 0.5, animated: true })
        }
      } catch {
        // scrolling is a nicety, never a correctness requirement
      }
    },
    [visibleItems]
  )

  // Amber highlight on the target row for ~1.4 s (desktop .random-flash).
  const flashItem = useCallback(key => {
    setFlashKey(key)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 1400)
  }, [])

  // desktop Board.handleRandomizeTask — the dice: pick a random board task
  // (preferring ones not already being worked on), mark it working-on,
  // teleport to it and flash the row. When every task is already working-on
  // the write is skipped (desktop: no onSave) but the roll still points at
  // a random one.
  const handleRandomize = useCallback(() => {
    const taskItems = visibleItems.filter(i => i.kind === 'task')
    if (taskItems.length === 0) {
      setSnack('No tasks on the board to pick from yet')
      return
    }
    const candidates = taskItems.filter(i => !workingOnSet.has(i.key))
    const pool = candidates.length > 0 ? candidates : taskItems
    const picked = pool[Math.floor(Math.random() * pool.length)]

    if (!workingOnSet.has(picked.key)) {
      run((d, now) => addWorkingOn(d, picked.key, now))
      setSnack(`Picked: ${shorten(picked.task.text)}`)
    }
    setTimeout(() => {
      scrollToItem(picked.key)
      flashItem(picked.key)
    }, 100)
  }, [visibleItems, workingOnSet, run, scrollToItem, flashItem])

  // desktop Board.handleNavigateToCategory — tap a category → jump to its
  // first marker on the board (scroll + flash). The sheet closes first so
  // the board is visible behind it; a category with no marker yet gets a
  // hint instead of silence (desktop just no-ops — on mobile that reads
  // as broken).
  const handleNavigateToCategory = useCallback(
    category => {
      setSheetOpen(false)
      const target = visibleItems.find(
        i => i.kind === 'marker' && i.marker.categoryId === category.id
      )
      if (!target) {
        setSnack(`No "${shorten(category.name, 20)}" marker on the board yet — tap + in Categories to add one`)
        return
      }
      setTimeout(() => {
        scrollToItem(target.key)
        flashItem(target.key)
      }, 200)
    },
    [visibleItems, scrollToItem, flashItem]
  )

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
      const flashing = flashKey === item.key
      return (
        // layout capture for the teleport scroll (row key → y/height)
        <View
          onLayout={e => {
            rowLayoutsRef.current.set(item.key, {
              y: e.nativeEvent.layout.y,
              height: e.nativeEvent.layout.height
            })
          }}
        >
          {item.kind === 'task' ? (
            <TaskRow
              theme={theme}
              task={item.task}
              category={categoryLookup.get(item.key) || null}
              isWorkingOn={workingOnSet.has(item.key)}
              flowStateColor={flowStateColor}
              flash={flashing}
              onOpen={() => setEditingTask(item.task)}
              onComplete={() => setCompletingTask(item.task)}
              onDelete={() => setDeletingTask(item.task)}
              onToggleWorkingOn={() => run((d, now) => toggleWorkingOn(d, item.key, now))}
              {...moveProps}
            />
          ) : (
            <MarkerRow
              theme={theme}
              marker={item.marker}
              category={categoriesById.get(item.marker.categoryId)}
              flash={flashing}
              onNote={() => setNotingMarker(item.marker)}
              onAddBelow={() => setAddingBelowMarker(item.marker)}
              onDelete={() => setDeletingMarker(item.marker)}
              {...moveProps}
            />
          )}
        </View>
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
      visibleItems.length,
      flashKey
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
              name="dice-5"
              color={theme.textSecondary}
              onPress={handleRandomize}
              accessibilityLabel="Pick a random task to work on"
            />
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
        ref={listRef}
        onLayout={e => {
          listHeightRef.current = e.nativeEvent.layout.height || listHeightRef.current
        }}
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
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ color: theme.textSecondary, ...TYPE.secondary }}>
                  {todaySummary.count} completed
                </Text>
                {todaySummary.workingOn > 0 ? (
                  <Pressable
                    onPress={() => setWorkingOnOpen(true)}
                    android_ripple={{ color: theme.ripple }}
                    accessibilityLabel={`Working on ${todaySummary.workingOn} ${todaySummary.workingOn === 1 ? 'task' : 'tasks'}`}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: flowStateColor,
                      backgroundColor: withAlpha(flowStateColor, '26'),
                      opacity: pressed ? 0.8 : 1
                    })}
                  >
                    <View
                      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: flowStateColor }}
                    />
                    <Text
                      style={{
                        color: flowStateColor,
                        fontWeight: '700',
                        fontSize: 12.5,
                        letterSpacing: 0.3
                      }}
                    >
                      Working On
                    </Text>
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        paddingHorizontal: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: flowStateColor
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 11.5 }}>
                        {todaySummary.workingOn}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <Text style={{ color: flowStateColor, ...TYPE.secondary, fontWeight: '600' }}>
                    0 working on
                  </Text>
                )}
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

      {/* --- sheets --- */}
      {/* Working On list (desktop WorkingOnPopup) — mounted BEFORE the
          dialogs so the CompleteDialog opened from it layers ON TOP of the
          sheet; completing closes both, cancel returns to the list */}
      <WorkingOnSheet
        theme={theme}
        visible={workingOnOpen}
        tasks={workingOnTasks}
        getCategoryFor={id => categoryLookup.get(id) || null}
        onSelectTask={task => setCompletingTask(task)}
        onClose={() => setWorkingOnOpen(false)}
      />

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
        onNavigate={handleNavigateToCategory}
        onCreateCategory={({ name, color }) =>
          run((d, now) => createCategory(d, { name, color }, now), 'Category created')
        }
        onClose={() => setSheetOpen(false)}
      />

      <Snackbar theme={theme} message={snack} onDone={() => setSnack(null)} />
    </View>
  )
}
