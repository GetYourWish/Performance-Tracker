// ui.js — the Android-native component kit.
// Material behavior (ripple, elevation, FAB, bottom navigation, dialogs,
// edge-to-edge safe areas) with the desktop app's aurora-glass skin.

import React, { useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Animated,
  Easing
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RADIUS, SPACING } from '../theme.js'

// Canvas: indigo gradient + the three aurora blobs (desktop .aurora-background)
export function AuroraBackground({ theme }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={theme.canvas} style={StyleSheet.absoluteFill} />
      {theme.aurora.map((blob, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            width: 420,
            height: 420,
            borderRadius: 210,
            backgroundColor: blob.color
          }}
        />
      ))}
    </View>
  )
}

export function GlassCard({ theme, style, children }) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.glassBg,
          borderColor: theme.glassBorder,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          shadowColor: theme.shadow,
          shadowOpacity: theme.dark ? 0.5 : 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2
        },
        style
      ]}
    >
      {children}
    </View>
  )
}

export function IconBtn({ name, color, onPress, disabled, size = 22, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(128,128,128,0.25)', borderless: true, radius: 24 }}
      hitSlop={6}
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        padding: 8,
        borderRadius: 20
      })}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  )
}

// Material 3 small top app bar on a glass surface
export function TopAppBar({ theme, title, subtitle, actions }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        paddingTop: insets.top + SPACING.xs,
        backgroundColor: theme.glassBg,
        borderBottomColor: theme.border,
        borderBottomWidth: StyleSheet.hairlineWidth
      }}
    >
      <View
        style={{
          height: 56,
          paddingHorizontal: SPACING.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.xs
        }}
      >
        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
          <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions}
      </View>
    </View>
  )
}

// Material 3 navigation bar (bottom) — glass surface, pill indicator
export function BottomNav({ theme, tabs, active, onChange }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        backgroundColor: theme.glassBg,
        borderTopColor: theme.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingBottom: insets.bottom,
        flexDirection: 'row'
      }}
    >
      {tabs.map(tab => {
        const isActive = active === tab.key
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            android_ripple={{ color: theme.ripple }}
            style={{ flex: 1, alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.sm }}
            accessibilityLabel={tab.label}
          >
            <View
              style={{
                paddingHorizontal: SPACING.lg,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: isActive ? theme.rowFillSelected : 'transparent'
              }}
            >
              <Icon name={isActive ? tab.iconActive || tab.icon : tab.icon} size={24}
                color={isActive ? theme.textPrimary : theme.textMuted} />
            </View>
            <Text
              style={{
                fontSize: 12,
                marginTop: 2,
                color: isActive ? theme.textPrimary : theme.textMuted,
                fontWeight: isActive ? '600' : '400'
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Material 3 extended FAB
export function Fab({ theme, label, icon, onPress, bottomInset = 96 }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.25)', radius: 200 }}
      style={({ pressed }) => ({
        position: 'absolute',
        right: SPACING.lg,
        bottom: bottomInset,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        backgroundColor: pressed ? theme.flowStatePressed || '#7c3aed' : theme.flowState,
        borderRadius: RADIUS.fab,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        shadowColor: theme.shadow,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6
      })}
      accessibilityLabel={label}
    >
      <Icon name={icon} size={22} color="#ffffff" />
      <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  )
}

// Material 3 dialog: scrim + centered 28dp-rounded surface
export function Dialog({ theme, visible, title, onClose, children, actions, wide }) {
  useEffect(() => {
    if (!visible) return undefined
    const anim = new Animated.Value(0)
    Animated.timing(anim, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    return () => anim.stop()
  }, [visible])

  if (!visible) return null
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={[
            {
              width: '100%',
              maxWidth: wide ? 560 : 400,
              maxHeight: '85%',
              backgroundColor: theme.bgPrimary,
              borderRadius: RADIUS.sheet,
              padding: SPACING.xl
            },
            { shadowColor: theme.shadow, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }
          ]}
        >
          <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: '600', marginBottom: SPACING.md }}>
            {title}
          </Text>
          {children}
          {actions ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.lg }}>
              {actions}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// M3 text button (dialog actions)
export function TextButton({ theme, label, onPress, disabled, destructive }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: theme.ripple, borderless: true }}
      style={({ pressed }) => ({
        paddingHorizontal: SPACING.md,
        paddingVertical: 10,
        borderRadius: RADIUS.md,
        opacity: disabled ? 0.38 : pressed ? 0.8 : 1
      })}
    >
      <Text style={{ color: destructive ? ACCENT_DANGER : theme.flowState, fontWeight: '600', fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  )
}

const ACCENT_DANGER = '#dc2626'

// M3 filled button
export function FilledButton({ theme, label, icon, onPress, disabled, destructive, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={({ pressed }) => [
        {
          flexDirection: icon ? 'row' : undefined,
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACING.sm,
          backgroundColor: disabled
            ? theme.rowFillSelected
            : destructive
              ? ACCENT_DANGER
              : theme.flowState,
          borderRadius: RADIUS.xl,
          paddingHorizontal: SPACING.xl,
          paddingVertical: 12,
          opacity: pressed ? 0.85 : 1
        },
        style
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={disabled ? theme.textMuted : '#ffffff'} /> : null}
      <Text style={{ color: disabled ? theme.textMuted : '#ffffff', fontWeight: '600', fontSize: 15, textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  )
}

// Settings row (icon + label + value/control) used by SettingsScreen
export function SettingsRow({ theme, icon, label, hint, control, onPress }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md }}>
      <Icon name={icon} size={22} color={theme.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{label}</Text>
        {hint ? (
          <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>{hint}</Text>
        ) : null}
      </View>
      {control}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.ripple }}>
      {body}
    </Pressable>
  )
}

// Transient snackbar pinned above the bottom nav
export function Snackbar({ theme, message, onDone, duration = 2600 }) {
  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(() => onDone && onDone(), duration)
    return () => clearTimeout(t)
  }, [message, duration, onDone])
  if (!message) return null
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: SPACING.lg,
        right: SPACING.lg,
        bottom: 96,
        backgroundColor: theme.dark ? '#e8e8e8' : '#322f35',
        borderRadius: RADIUS.md,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        elevation: 6,
        shadowColor: theme.shadow,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 }
      }}
    >
      <Text style={{ color: theme.dark ? '#1a1a1a' : '#f0f0f0', fontSize: 14 }}>{message}</Text>
    </View>
  )
}
