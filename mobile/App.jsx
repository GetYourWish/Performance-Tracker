// App root — theme resolution, screen switching, bottom navigation.
// Mirrors desktop App.jsx: loading → schema gate → setup → (board | settings).

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, StatusBar, AppState } from 'react-native'
import { useColorScheme } from 'react-native'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { buildTheme, SPACING } from './src/theme.js'
import { updateSettings } from './src/actions.js'
import { useTracker } from './src/hooks/useTracker.js'
import { readLastCrash, clearLastCrash } from './src/diagnostics.js'
import { AppBackground, BottomNav } from './src/components/ui.js'
import { BoardScreen } from './src/components/BoardScreen.js'
import { CalendarScreen } from './src/components/CalendarScreen.js'
import { ReviewsScreen } from './src/components/ReviewsScreen.js'
import { SetupScreen, SchemaErrorScreen } from './src/screens/SetupScreen.js'
import { SettingsScreen } from './src/screens/SettingsScreen.js'
import { CrashReportScreen } from './src/screens/CrashReportScreen.js'
import { ErrorScreen } from './src/screens/ErrorScreen.js'
import ErrorBoundary from './src/components/ErrorBoundary.js'
import { materializeRecurringTasks, applyDueDeadlines, getCurrentDate, generateId } from '@performance-tracker/core'
import {
  configureNotifications,
  ensureNotificationPermission,
  notifyWorkingOnAdds,
  syncDeadlineReminders
} from './src/notifications.js'
import appJson from './app.json'

// Shown on every loading/error screen so a screenshot identifies the exact
// installed build ("Loading… v1.0.4") — we wasted a whole debugging round
// because there was no way to tell WHICH apk a 'stuck on loading' screenshot
// came from.
const APP_VERSION = appJson.expo.version || ''
const LOADING_TEXT = `Loading… v${APP_VERSION}`

// Root: mounts SafeAreaProvider BEFORE anything calls useSafeAreaInsets.
// Expo's registerRootComponent() registers the component as-is (no provider
// wrapper) — without this, the very first render threw 'No safe area value
// available' and release builds crashed instantly on launch.
// initialWindowMetrics hands the provider the insets measured natively at
// startup so the first frame is already laid out correctly.
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppShell />
    </SafeAreaProvider>
  )
}

function AppShell() {
  const scheme = useColorScheme()
  const [tab, setTab] = useState('board')
  const [refreshing, setRefreshing] = useState(false)
  // undefined = not checked yet, null = no crash recorded, object = report
  const [crashReport, setCrashReport] = useState(undefined)
  // Optimistic theme: applied the instant the user taps an option so the
  // UI responds immediately; the store write (which takes a full verified
  // SAF write cycle, ~1–2 s on real hardware) lands underneath and then
  // this override clears. Cleared on failure too, so a failed save never
  // leaves a lie on screen.
  const [pendingTheme, setPendingTheme] = useState(null)
  // v1.4.0 calendar → board handoff: set by the Calendar tab's "Go to
  // Board" button. BoardScreen teleports to the task's row and flashes it,
  // then reports back here so the request is consumed exactly once.
  // `nonce` makes repeat taps on the same task fire again.
  const [boardFocus, setBoardFocus] = useState(null)

  // v1.4.0 — Calendar "Go to Board": switch to the board tab and hand the
  // task id to BoardScreen (teleport + flash — the dice treatment).
  // handleBoardFocusHandled must stay referentially stable (useCallback,
  // no deps) — BoardScreen's focus effect depends on it.
  const handleBoardFocusHandled = useCallback(() => {
    setBoardFocus(null)
  }, [])

  const handleGoToBoard = useCallback(taskId => {
    if (typeof taskId !== 'string') return
    setBoardFocus({ taskId, nonce: Date.now() })
    setTab('board')
  }, [])

  useEffect(() => {
    let alive = true
    readLastCrash().then(report => {
      if (alive) setCrashReport(report)
    })
    return () => {
      alive = false
    }
  }, [])

  const handleCrashDismiss = useCallback(async () => {
    await clearLastCrash()
    setCrashReport(null)
  }, [])

  const { store, state, folderUri, autoSync, booted, pickFolder, setAutoSync, refresh, forgetFolder } = useTracker()

  // v1.1.0 — weekday-scheduled recurring tasks (user request 2026-11-17):
  // materialize today's instances whenever fresh data lands (boot, external
  // change, mutation). v1.2.0 adds the second daily rule (user request
  // 2026-11-18): a task whose DEADLINE DAY is reached joins workingOn
  // automatically — same core helper as desktop, idempotent via
  // tasks[].deadlineAutoAdded so a later manual removal sticks. Both helpers
  // return the SAME data reference when nothing is due, which makes the
  // store's no-change-no-write skip the disk entirely.
  // v1.3.0: tasks that just joined workingOn fire an Android notification
  // (user request 2026-11-18 — the `added` list from applyDueDeadlines).
  const runDailyAutomation = useCallback((d, now) => {
    const today = getCurrentDate()
    const { data: withRecurring, created } = materializeRecurringTasks({
      data: d,
      today,
      now,
      generateId
    })
    const { data: next, added } = applyDueDeadlines({
      data: withRecurring,
      today,
      now
    })
    if (added.length > 0) {
      const taskById = new Map((withRecurring.tasks || []).map(t => [t.id, t]))
      const addedTasks = added.map(id => taskById.get(id)).filter(Boolean)
      if (addedTasks.length > 0) {
        // fire-and-forget: a notification failure must never fail the mutation
        notifyWorkingOnAdds(addedTasks).catch(() => {})
      }
    }
    return created.length > 0 || next !== d ? next : d
  }, [])

  const materializedDataRef = useRef(null)
  const lastAutomationDayRef = useRef(null)
  useEffect(() => {
    if (state.status !== 'ready' || !state.data) return
    if (materializedDataRef.current === state.data) return
    materializedDataRef.current = state.data
    lastAutomationDayRef.current = getCurrentDate()
    store
      .mutate(runDailyAutomation)
      .catch(() => {
        // a failed automation must never block the app — next data
        // change retries it
        materializedDataRef.current = null
      })
    // v1.3.0: keep the scheduled day-of deadline reminders in sync with
    // the data (schedule new deadlines, cancel completed/removed ones).
    // Runs on every data change; when the mutation above lands, the effect
    // re-runs and re-syncs against the final document.
    syncDeadlineReminders(state.data?.tasks, getCurrentDate()).catch(() => {})
  }, [state.status, state.data, store, runDailyAutomation])

  // v1.3.0 notifications bootstrap (user request 2026-11-18): foreground
  // handler + channel, and the POST_NOTIFICATIONS runtime permission ask —
  // once per session, the first time the app reaches ready state.
  useEffect(() => {
    if (state.status !== 'ready') return
    configureNotifications().catch(() => {})
    ensureNotificationPermission().catch(() => {})
  }, [state.status])

  // Foreground day-rollover: Android suspends timers while backgrounded, so
  // a deadline (or a weekday recurring task) that becomes due while the app
  // was in the background is applied the moment the user returns — not only
  // on the next data change. (Desktop covers this with its minute interval.)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return
      const today = getCurrentDate()
      if (
        lastAutomationDayRef.current &&
        today !== lastAutomationDayRef.current &&
        materializedDataRef.current
      ) {
        lastAutomationDayRef.current = today
        // allow the data effect to pick the result up as fresh state
        materializedDataRef.current = null
        store.mutate(runDailyAutomation).catch(() => {})
      }
    })
    return () => subscription?.remove?.()
  }, [store, runDailyAutomation])

  // theme preference follows data.settings.theme (desktop parity); the
  // optimistic override wins until the write settles
  const savedPreference = state.data?.settings?.theme || 'system'
  const preference = pendingTheme || savedPreference
  const theme = buildTheme(preference, scheme)

  // v1.0.11 light-theme fix: the status-bar LETTERS (clock, battery,
  // notification icons) now follow the APP theme — with edge-to-edge and
  // no explicit barStyle they stayed light-content when the user picked the
  // Light theme, i.e. white system letters on the near-white light canvas.
  const statusBar = (
    <StatusBar
      barStyle={theme.dark ? 'light-content' : 'dark-content'}
      translucent
    />
  )

  // Theme changes apply INSTANTLY (optimistic) and persist through the same
  // serialized, backed-up write cycle as every other mutation. If the write
  // fails the visual override is rolled back and the Settings screen shows
  // the save failure — "it stopped making changes" can never silently
  // happen again.
  const handleThemeChange = useCallback(
    async value => {
      if (value === savedPreference && pendingTheme == null) return
      setPendingTheme(value)
      try {
        await store.mutate((d, now) => updateSettings(d, { theme: value }, now))
        setPendingTheme(null)
      } catch (e) {
        // roll the visual override back and let the caller surface the error
        setPendingTheme(null)
        throw e
      }
    },
    [store, savedPreference, pendingTheme]
  )

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      // keep the indicator visible for a beat so it feels intentional (desktop parity)
      setTimeout(() => setRefreshing(false), 400)
    }
  }, [refresh, refreshing])

  // last session recorded a fatal JS error → show it before anything else
  if (crashReport) {
    return (
      <>
        {statusBar}
        <CrashReportScreen report={crashReport} onDismiss={handleCrashDismiss} />
      </>
    )
  }

  if (!booted) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#EEF2FF' }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={{ color: '#666666', marginTop: SPACING.md }}>{LOADING_TEXT}</Text>
      </View>
    )
  }

  if (state.status === 'schema-too-new') {
    return (
      <>
        {statusBar}
        <SchemaErrorScreen theme={theme} schemaVersion={state.schemaVersion} />
      </>
    )
  }

  if (state.status === 'no-folder' || state.status === 'missing') {
    const mode = state.status === 'missing' ? 'missing' : folderUri ? 'regrant' : 'fresh'
    return (
      <>
        {statusBar}
        <ErrorBoundary onReloadData={() => store.load()}>
          <SetupScreen
            theme={theme}
            mode={mode}
            folderUri={folderUri}
            errorMessage={state.errorMessage}
            onPickFolder={pickFolder}
            onCreateDefault={async () => {
              await store.initializeDefault()
            }}
            onReload={() => store.load()}
          />
        </ErrorBoundary>
      </>
    )
  }

  if (state.status === 'error') {
    // corrupt tracker.json → recovery surface (restore verified copy /
    // latest backup, structural salvage, plain reload). The damaged bytes
    // were already preserved in the app's private .corrupt/ folder by the
    // store before this screen renders — every option is non-destructive.
    return (
      <>
        {statusBar}
        <ErrorBoundary onReloadData={() => store.load()}>
          <ErrorScreen theme={theme} state={state} store={store} />
        </ErrorBoundary>
      </>
    )
  }

  if (state.status === 'loading') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.bgCanvas }]}>
        {statusBar}
        <AppBackground theme={theme} />
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={{ color: theme.textSecondary, marginTop: SPACING.md }}>{LOADING_TEXT}</Text>
      </View>
    )
  }

  // The main app. ErrorBoundary converts any render error (which in a
  // release build would otherwise KILL THE PROCESS — the remote-reported
  // "create a task / change the theme → crash") into an in-app recovery
  // card; the store underneath keeps every data guarantee.
  return (
    <View style={[styles.fill, { backgroundColor: theme.bgCanvas }]}>
      {statusBar}
      <AppBackground theme={theme} />
      <View style={{ flex: 1 }}>
        <ErrorBoundary onReloadData={() => store.load()}>
          {tab === 'board' ? (
            <BoardScreen
              theme={theme}
              state={state}
              store={store}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onShowConflictInfo={() => setTab('settings')}
              focusRequest={boardFocus}
              onFocusHandled={handleBoardFocusHandled}
            />
          ) : tab === 'calendar' ? (
            <CalendarScreen theme={theme} state={state} onGoToBoard={handleGoToBoard} />
          ) : tab === 'reviews' ? (
            <ReviewsScreen theme={theme} state={state} store={store} />
          ) : (
            <SettingsScreen
              theme={theme}
              state={state}
              store={store}
              folderUri={folderUri}
              autoSync={autoSync}
              onSetAutoSync={setAutoSync}
              onPickFolder={pickFolder}
              themeValue={preference}
              onThemeChange={handleThemeChange}
            />
          )}
        </ErrorBoundary>
        <BottomNav
          theme={theme}
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'board', label: 'Board', icon: 'view-dashboard-outline', iconActive: 'view-dashboard' },
            { key: 'calendar', label: 'Calendar', icon: 'calendar-month-outline', iconActive: 'calendar-month' },
            { key: 'reviews', label: 'Reviews', icon: 'chart-bar', iconActive: 'chart-bar' },
            { key: 'settings', label: 'Settings', icon: 'cog-outline', iconActive: 'cog' }
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' }
})
