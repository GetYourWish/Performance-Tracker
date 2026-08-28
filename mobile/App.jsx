// App root — theme resolution, screen switching, bottom navigation.
// Mirrors desktop App.jsx: loading → schema gate → setup → (board | settings).

import React, { useState, useCallback } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { buildTheme, SPACING } from './src/theme.js'
import { useTracker } from './src/hooks/useTracker.js'
import { AuroraBackground, GlassCard, BottomNav, TopAppBar } from './src/components/ui.js'
import { BoardScreen } from './src/components/BoardScreen.js'
import { SetupScreen, SchemaErrorScreen } from './src/screens/SetupScreen.js'

export default function App() {
  const scheme = useColorScheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState('board')
  const [refreshing, setRefreshing] = useState(false)

  const { store, state, folderUri, booted, pickFolder, refresh } = useTracker()

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

  if (!booted) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#EEF2FF' }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={{ color: '#666666', marginTop: SPACING.md }}>Loading…</Text>
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

  if (state.status === 'loading' || state.status === 'error') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.canvas[0] }]}>
        <AuroraBackground theme={theme} />
        {state.status === 'error' ? (
          <GlassCard theme={theme} style={{ padding: SPACING.xl, margin: SPACING.xl }}>
            <Text style={{ color: theme.textPrimary, fontWeight: '600', marginBottom: SPACING.sm }}>
              Could not load tracker.json
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{state.errorMessage}</Text>
          </GlassCard>
        ) : (
          <>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={{ color: theme.textSecondary, marginTop: SPACING.md }}>Loading…</Text>
          </>
        )}
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
            <SettingsPlaceholder theme={theme} />
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

// M1 placeholder — the real Settings screen lands in M3.
function SettingsPlaceholder({ theme }) {
  return (
    <View style={{ flex: 1 }}>
      <TopAppBar theme={theme} title="Settings" />
      <GlassCard theme={theme} style={{ margin: SPACING.lg, padding: SPACING.xl }}>
        <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>Settings</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: SPACING.sm }}>
          Sync controls, theme and scoring settings are coming in the next milestone.
        </Text>
      </GlassCard>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' }
})
