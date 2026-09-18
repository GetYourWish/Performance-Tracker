// SettingsScreen — Android equivalent of desktop Settings.jsx, scoped to the
// mobile-relevant controls. Every write goes through store.mutate → rebase →
// no-change-no-write, so settings edits sync to the desktop like any other
// mutation (desktop Settings edits the same settings object).
//
// The theme Segmented control is OPTIMISTIC (v1.0.7): the visual selection
// and the whole app's theme flip the instant the user taps an option; the
// persistence lands through the same serialized write cycle as everything
// else. Theme taps used to take a full SAF write cycle (~1–2 s on device)
// to show ANY feedback — which read exactly like "it stopped making
// changes" while a write was merely in flight.

import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, TextInput, Switch, Pressable, Alert } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TopAppBar, GlassCard, FilledButton, TextButton, SettingsRow, Snackbar } from '../components/ui.js'
import { inputStyle } from '../components/dialogs.js'
import { updateSettings } from '../actions.js'
import { SPACING, TYPE } from '../theme.js'
// Bundled app.json — the version of the JS bundle actually running (the
// native versionName can be stale when the apk was rebuilt via gradlew on an
// old prebuild folder, as the 2026-09-17 crash report proved).
import appJson from '../../app.json'

const APP_VERSION = appJson.expo.version || ''

function SectionCard({ theme, title, children }) {
  return (
    <GlassCard theme={theme} style={{ padding: SPACING.lg, marginBottom: SPACING.md }}>
      <Text style={{ color: theme.textSecondary, ...TYPE.sectionTitle, marginBottom: SPACING.sm }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </GlassCard>
  )
}

function Segmented({ theme, options, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.bgSecondary, borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map(opt => {
        const selected = value === opt.value
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            android_ripple={{ color: theme.ripple, borderless: true }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 9,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: selected ? theme.bgPrimary : 'transparent',
              elevation: selected ? 1 : 0,
              opacity: pressed && !selected ? 0.7 : 1
            })}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text
              style={{
                color: selected ? theme.flowState : theme.textSecondary,
                fontSize: 13.5,
                fontWeight: selected ? '700' : '500',
                letterSpacing: 0.2
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function SettingsScreen({
  theme,
  state,
  store,
  folderUri,
  autoSync,
  onSetAutoSync,
  onPickFolder,
  onShowSnack,
  themeValue,
  onThemeChange
}) {
  const insets = useSafeAreaInsets()
  const data = state.data
  const settings = data?.settings || {}
  const [snack, setSnack] = useState(null)

  const [fatigueIncrement, setFatigueIncrement] = useState('')
  const [fatigueCap, setFatigueCap] = useState('')
  useEffect(() => {
    setFatigueIncrement(String(settings.fatigueIncrement ?? 0.10))
    setFatigueCap(String(settings.fatigueCap ?? 3.0))
  }, [settings.fatigueIncrement, settings.fatigueCap])

  const run = useCallback(
    async buildNext => {
      try {
        await store.mutate(buildNext)
      } catch (e) {
        if (e && e.code === 'SCHEMA_VERSION_TOO_NEW') {
          setSnack(`File is now schema ${e.schemaVersion} — update this app first`)
        } else {
          setSnack('Save failed: ' + (e.message || e))
        }
      }
    },
    [store]
  )

  // Optimistic theme change: App applies the override instantly; we only
  // surface failures here (the override is rolled back by the App).
  const handleThemeTap = useCallback(
    value => {
      if (!onThemeChange) {
        run((d, now) => updateSettings(d, { theme: value }, now))
        return
      }
      Promise.resolve(onThemeChange(value)).catch(e =>
        setSnack('Save failed: ' + ((e && e.message) || e))
      )
    },
    [onThemeChange, run]
  )

  const commitNumber = (key, raw, fallback, parse) => {
    if (raw.trim() === '') return
    const value = parse(raw.trim())
    if (!Number.isFinite(value) || value === settings[key]) return
    run((d, now) => updateSettings(d, { [key]: value }, now))
  }

  const handleBackupNow = async () => {
    try {
      await store.backupNow()
      setSnack('Backup saved to the app’s private .backups folder')
    } catch (e) {
      setSnack('Backup failed: ' + (e.message || e))
    }
  }

  const handleChangeFolder = () => {
    Alert.alert(
      'Change data folder',
      'Pick the Syncthing folder that contains tracker.json. The app will reload from it — nothing is moved or deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose folder', onPress: () => onPickFolder().catch(e => setSnack('Folder pick failed: ' + (e.message || e))) }
      ]
    )
  }

  const themeSelection = themeValue || settings.theme || 'system'

  return (
    <View style={{ flex: 1 }}>
      <TopAppBar theme={theme} title="Settings" subtitle={state.status === 'ready' ? 'tracker.json loaded' : state.status} />
      <ScrollView
        contentContainerStyle={{
          padding: SPACING.lg,
          paddingBottom: insets.bottom + 120
        }}
      >
        {/* Sync */}
        <SectionCard theme={theme} title="Sync">
          <SettingsRow
            theme={theme}
            icon="folder-sync-outline"
            label="Data folder"
            hint={folderUri || 'Not selected'}
            control={<TextButton theme={theme} label="Change" onPress={handleChangeFolder} />}
          />
          <SettingsRow
            theme={theme}
            icon="autorenew"
            label="Auto-sync (poll every 15 s)"
            hint="Also refreshes when the app returns to the foreground"
            control={
              <Switch
                value={autoSync}
                onValueChange={onSetAutoSync}
                trackColor={{ true: theme.flowState, false: theme.bgTertiary }}
                thumbColor="#ffffff"
              />
            }
          />
          <SettingsRow
            theme={theme}
            icon="content-save-cog-outline"
            label="Backup now"
            hint="Copies the current file into the app’s private .backups (last 20 kept)"
            control={<TextButton theme={theme} label="Backup" onPress={handleBackupNow} />}
          />
          <SettingsRow
            theme={theme}
            icon="alert-octagon-outline"
            label="Sync conflicts"
            hint={
              state.conflicts.length > 0
                ? `${state.conflicts.length} conflict copy(ies) in the folder — resolve them in Syncthing; the app never loads or deletes them automatically`
                : 'None detected'
            }
          />
        </SectionCard>

        {/* Appearance */}
        <SectionCard theme={theme} title="Appearance">
          <Text style={{ color: theme.textPrimary, ...TYPE.bodyStrong, marginBottom: SPACING.sm }}>Theme</Text>
          <Segmented
            theme={theme}
            value={themeSelection}
            onChange={handleThemeTap}
            options={[
              { label: 'System', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' }
            ]}
          />
          <Text style={{ color: theme.textMuted, marginTop: SPACING.sm, ...TYPE.caption }}>
            Applies instantly; saved to tracker.json like every other change.
          </Text>
        </SectionCard>

        {/* Scoring */}
        <SectionCard theme={theme} title="Scoring">
          <Text style={{ color: theme.textMuted, marginBottom: SPACING.md, ...TYPE.caption }}>
            score(task i) = base × min(1.0 + i × increment, cap) × category multiplier — shared with the desktop via @performance-tracker/core.
          </Text>
          <View style={{ flexDirection: 'row', gap: SPACING.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, ...TYPE.secondary, marginBottom: 6 }}>
                Fatigue increment
              </Text>
              <TextInput
                style={inputStyle(theme)}
                value={fatigueIncrement}
                onChangeText={setFatigueIncrement}
                onEndEditing={() => commitNumber('fatigueIncrement', fatigueIncrement, 0.10, parseFloat)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, ...TYPE.secondary, marginBottom: 6 }}>Fatigue cap</Text>
              <TextInput
                style={inputStyle(theme)}
                value={fatigueCap}
                onChangeText={setFatigueCap}
                onEndEditing={() => commitNumber('fatigueCap', fatigueCap, 3.0, parseFloat)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
          </View>
          <View style={{ marginTop: SPACING.lg }}>
            <Text style={{ color: theme.textPrimary, ...TYPE.bodyStrong, marginBottom: SPACING.sm }}>Week starts on</Text>
            <Segmented
              theme={theme}
              value={settings.weekStartsOn ?? 1}
              onChange={value => run((d, now) => updateSettings(d, { weekStartsOn: value }, now))}
              options={[
                { label: 'Monday', value: 1 },
                { label: 'Sunday', value: 0 }
              ]}
            />
          </View>
        </SectionCard>

        {/* About */}
        <SectionCard theme={theme} title="About">
          <SettingsRow
            theme={theme}
            icon="information-outline"
            label="Version"
            hint={`v${APP_VERSION} (js bundle) — schemaVersion 1 supported`}
          />
          <SettingsRow
            theme={theme}
            icon="file-document-outline"
            label="Data file"
            hint="tracker.json — written atomically (tmp + verify), heals only when needed, never rewrites unchanged content"
          />
          <SettingsRow
            theme={theme}
            icon="cellphone-link"
            label="Desktop companion"
            hint="Same file, same scores — every rule lives in @performance-tracker/core"
          />
        </SectionCard>

        <FilledButton
          theme={theme}
          label="Reload from disk"
          icon="refresh"
          onPress={() => store.load().catch(() => {})}
          style={{ marginTop: SPACING.sm }}
        />
      </ScrollView>

      <Snackbar theme={theme} message={snack} onDone={() => setSnack(null)} />
    </View>
  )
}
