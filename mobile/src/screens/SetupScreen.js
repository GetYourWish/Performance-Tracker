// SetupScreen — Android equivalent of desktop SetupScreen.jsx.
// States:
//  - fresh start: pick the Syncthing folder (SAF tree picker)
//  - folder picked but tracker.json missing: offer to create the default file
//  - persisted folder permission lost (reboot/standby): re-grant access

import React, { useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuroraBackground, GlassCard, FilledButton } from '../components/ui.js'
import { SPACING, RADIUS } from '../theme.js'

export function SetupScreen({ theme, mode, folderUri, errorMessage, onPickFolder, onCreateDefault, onReload }) {
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handlePick() {
    setBusy(true)
    setError(null)
    try {
      await onPickFolder()
    } catch (e) {
      setError('Failed to open the folder picker: ' + (e.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      await onCreateDefault()
    } catch (e) {
      setError('Failed to create tracker.json: ' + (e.message || e))
    } finally {
      setBusy(false)
    }
  }

  const headline =
    mode === 'missing'
      ? 'No tracker.json in this folder'
      : mode === 'regrant'
        ? 'Folder access needs to be re-granted'
        : 'Welcome to Performance Tracker'

  const description =
    mode === 'missing'
      ? 'The folder you picked does not contain a tracker.json yet. Create the default data file here to start tracking — the desktop app will pick it up through Syncthing.'
      : mode === 'regrant'
        ? (errorMessage || 'Android revoked access to the data folder.') +
          '\n\nRe-select your Syncthing folder to continue. Your data was not modified.'
        : 'All your tasks and history live in a single tracker.json file inside your Syncthing folder — the same file the desktop app uses. Pick that folder to begin.'

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas[0] }}>
      <AuroraBackground theme={theme} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: SPACING.xl,
          paddingTop: insets.top + SPACING.xl,
          paddingBottom: insets.bottom + SPACING.xl
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              backgroundColor: theme.glassBg,
              borderColor: theme.glassBorder,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              elevation: 3
            }}
          >
            <Icon name="chart-bar" size={44} color={theme.flowState || '#8b5cf6'} />
          </View>
          <Text style={{ color: theme.textPrimary, fontSize: 24, fontWeight: '700', marginTop: SPACING.lg, textAlign: 'center' }}>
            Performance Tracker
          </Text>
        </View>

        <GlassCard theme={theme} style={{ padding: SPACING.xl }}>
          <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: SPACING.sm }}>
            {headline}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14.5, lineHeight: 21, marginBottom: SPACING.lg }}>
            {description}
          </Text>

          {busy ? (
            <ActivityIndicator color={theme.flowState || '#8b5cf6'} style={{ padding: SPACING.md }} />
          ) : (
            <View style={{ gap: SPACING.md }}>
              <FilledButton theme={theme} label={mode === 'regrant' ? 'Re-grant folder access' : 'Choose Syncthing folder'} onPress={handlePick} />
              {mode === 'missing' ? (
                <FilledButton theme={theme} label="Create default tracker.json" onPress={handleCreate} />
              ) : null}
              {mode === 'regrant' ? (
                <FilledButton theme={theme} label="Retry loading" onPress={onReload} />
              ) : null}
            </View>
          )}

          {(error || (mode !== 'missing' && errorMessage)) ? (
            <Text style={{ color: '#dc2626', fontSize: 13.5, marginTop: SPACING.md }}>
              {error || errorMessage}
            </Text>
          ) : null}
        </GlassCard>

        {folderUri ? (
          <Text
            numberOfLines={2}
            style={{ color: theme.textMuted, fontSize: 12, marginTop: SPACING.lg, textAlign: 'center' }}
          >
            Folder: {folderUri}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

// Data file written by a NEWER app version (schemaVersion > 1) — desktop
// shows the same dedicated screen; the file is never modified.
export function SchemaErrorScreen({ theme, schemaVersion }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas[0] }}>
      <AuroraBackground theme={theme} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: SPACING.xl,
          paddingTop: insets.top
        }}
      >
        <GlassCard theme={theme} style={{ padding: SPACING.xl, borderRadius: RADIUS.lg }}>
          <View style={{ alignItems: 'center', gap: SPACING.md }}>
            <Icon name="file-alert-outline" size={48} color="#dc2626" />
            <Text style={{ color: theme.textPrimary, fontSize: 19, fontWeight: '700', textAlign: 'center' }}>
              Data file is from a newer version
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14.5, lineHeight: 21, textAlign: 'center' }}>
              This tracker.json uses schemaVersion {schemaVersion}, but this app supports schemaVersion 1.
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14.5, lineHeight: 21, textAlign: 'center' }}>
              The file was not modified. Update this app to a version that supports schema {schemaVersion}.
            </Text>
          </View>
        </GlassCard>
      </View>
    </View>
  )
}
