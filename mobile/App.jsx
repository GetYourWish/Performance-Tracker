// App root — theme resolution, screen switching, bottom navigation.
// Mirrors desktop App.jsx: loading → schema gate → setup → (board | settings).

import React, { useState, useCallback, useEffect } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context'
import { buildTheme, SPACING } from './src/theme.js'
import { useTracker } from './src/hooks/useTracker.js'
import { readLastCrash, clearLastCrash } from './src/diagnostics.js'
import { AuroraBackground, BottomNav } from './src/components/ui.js'
import { BoardScreen } from './src/components/BoardScreen.js'
import { SetupScreen, SchemaErrorScreen } from './src/screens/SetupScreen.js'
import { SettingsScreen } from './src/screens/SettingsScreen.js'
import { CrashReportScreen } from './src/screens/CrashReportScreen.js'
import { ErrorScreen } from './src/screens/ErrorScreen.js'
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
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState('board')
  const [refreshing, setRefreshing] = useState(false)
  // undefined = not checked yet, null = no crash recorded, object = report
  const [crashReport, setCrashReport] = useState(undefined)

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

  // theme preference follows data.settings.theme (desktop parity)
  const preference = state.data?.settings?.theme || 'system'
  const theme = buildTheme(preference, scheme)

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
    return <CrashReportScreen report={crashReport} onDismiss={handleCrashDismiss} />
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
    return <SchemaErrorScreen theme={theme} schemaVersion={state.schemaVersion} />
  }

  if (state.status === 'no-folder' || state.status === 'missing') {
    const mode = state.status === 'missing' ? 'missing' : folderUri ? 'regrant' : 'fresh'
    return (
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
    )
  }

  if (state.status === 'error') {
    // corrupt tracker.json → recovery surface (restore verified copy /
    // latest backup, structural salvage, plain reload). The damaged bytes
    // were already preserved in the app's private .corrupt/ folder by the
    // store before this screen renders — every option is non-destructive.
    return <ErrorScreen theme={theme} state={state} store={store} />
  }

  if (state.status === 'loading') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.canvas[0] }]}>
        <AuroraBackground theme={theme} />
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={{ color: theme.textSecondary, marginTop: SPACING.md }}>{LOADING_TEXT}</Text>
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={[styles.fill, { backgroundColor: theme.canvas[0] }]}>
      <View style={[styles.fill, { backgroundColor: theme.canvas[0] }]}>
        <AuroraBackground theme={theme} />
        <View style={{ flex: 1 }}>
          {tab === 'board' ? (
            <BoardScreen
              theme={theme}
              state={state}
              store={store}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onShowConflictInfo={() => setTab('settings')}
            />
          ) : (
            <SettingsScreen
              theme={theme}
              state={state}
              store={store}
              folderUri={folderUri}
              autoSync={autoSync}
              onSetAutoSync={setAutoSync}
              onPickFolder={pickFolder}
            />
          )}
          <BottomNav
            theme={theme}
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'board', label: 'Board', icon: 'view-dashboard-outline', iconActive: 'view-dashboard' },
              { key: 'settings', label: 'Settings', icon: 'cog-outline', iconActive: 'cog' }
            ]}
          />
        </View>
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' }
})
