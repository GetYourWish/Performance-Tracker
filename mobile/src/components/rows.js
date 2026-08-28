// rows.js — interactive board row renderers, mirroring desktop BoardRow.jsx
// visuals and behavior:
//  - task rows: row-fill card, category color bar, tap-to-edit text,
//    working-on star (flowState highlight), complete ✓, delete 🗑
//  - marker rows: centered pill with category.color+'4D' background,
//    "/Name" label, note indicator (i), add-task-below (+), delete ✕
//  - drag: long-press the ⋮⋮ handle (react-native-draggable-flatlist), the
//    Android-idiomatic equivalent of the desktop drag handle
//
// '#RRGGBB' + '4D' desktop alpha suffix → rgba() RN color.

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { RADIUS, SPACING } from '../theme.js'

export function withAlpha(hex, alphaHex = '4D') {
  if (typeof hex !== 'string' || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) {
    return hex
  }
  const r = hex.slice(1, 3)
  const g = hex.slice(3, 5)
  const b = hex.slice(5, 7)
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${parseInt(alphaHex, 16) / 255})`
}

function DragHandle({ theme, drag, isActive }) {
  return (
    <Pressable
      onLongPress={drag}
      disabled={isActive}
      delayLongPress={220}
      android_ripple={{ color: theme.ripple, borderless: true, radius: 20 }}
      hitSlop={4}
      style={{ padding: 6 }}
      accessibilityLabel="Long-press to drag"
    >
      <Icon name="drag-vertical" size={20} color={theme.textMuted} />
    </Pressable>
  )
}

export function TaskRow({
  theme,
  task,
  category,
  isWorkingOn,
  flowStateColor,
  onOpen,
  onComplete,
  onDelete,
  onToggleWorkingOn,
  drag,
  isActive
}) {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.rowFill, borderRadius: RADIUS.md, marginBottom: SPACING.xs },
        isWorkingOn && {
          borderWidth: 1.5,
          borderColor: flowStateColor,
          backgroundColor: withAlpha(flowStateColor, '1A')
        },
        isActive && { opacity: 0.85, elevation: 6, shadowColor: theme.shadow, shadowRadius: 8, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 } }
      ]}
    >
      <DragHandle theme={theme} drag={drag} isActive={isActive} />
      {category ? (
        <View
          style={{
            width: 4,
            alignSelf: 'stretch',
            borderRadius: 2,
            backgroundColor: category.color,
            marginRight: SPACING.xs
          }}
        />
      ) : null}
      <Pressable
        onPress={onOpen}
        android_ripple={{ color: theme.ripple }}
        style={{ flex: 1, paddingVertical: 4 }}
        accessibilityLabel={`Task: ${String(task?.text ?? '')}`}
      >
        <Text numberOfLines={4} style={{ color: theme.textPrimary, fontSize: 15.5, lineHeight: 21 }}>
          {String(task?.text ?? '')}
        </Text>
      </Pressable>
      <IconBtn
        theme={theme}
        name={isWorkingOn ? 'star' : 'star-outline'}
        color={isWorkingOn ? flowStateColor : theme.textMuted}
        onPress={onToggleWorkingOn}
        accessibilityLabel={isWorkingOn ? 'Stop working on' : 'Mark as working on'}
      />
      <IconBtn
        theme={theme}
        name="check"
        color={theme.textSecondary}
        onPress={onComplete}
        accessibilityLabel={`Complete task: ${String(task?.text ?? '')}`}
      />
      <IconBtn
        theme={theme}
        name="trash-can-outline"
        color={theme.textMuted}
        onPress={onDelete}
        accessibilityLabel={`Delete task: ${String(task?.text ?? '')}`}
      />
    </View>
  )
}

export function MarkerRow({
  theme,
  marker,
  category,
  onNote,
  onAddBelow,
  onDelete,
  drag,
  isActive
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.sm, opacity: isActive ? 0.85 : 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.xs,
          backgroundColor: withAlpha(category?.color),
          borderRadius: 20,
          paddingRight: 4
        }}
        accessibilityLabel={`Category marker: ${String(category?.name ?? '')}`}
      >
        <DragHandle theme={theme} drag={drag} isActive={isActive} />
        <Pressable
          onPress={onNote}
          android_ripple={{ color: theme.ripple, borderless: true }}
          hitSlop={4}
          accessibilityLabel="Category note"
        >
          <Icon name="information-outline" size={15} color={theme.textPrimary} />
        </Pressable>
        <Text style={{ color: theme.textPrimary, fontWeight: '500', fontSize: 14 }}>
          /{String(category?.name ?? '')}
        </Text>
        <Pressable
          onPress={onAddBelow}
          android_ripple={{ color: theme.ripple, borderless: true }}
          hitSlop={4}
          style={{ paddingHorizontal: 6, paddingVertical: 6 }}
          accessibilityLabel={`Add task below ${String(category?.name ?? '')}`}
        >
          <Icon name="plus" size={17} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          android_ripple={{ color: theme.ripple, borderless: true }}
          hitSlop={4}
          style={{ paddingHorizontal: 6, paddingVertical: 6 }}
          accessibilityLabel={`Delete ${String(category?.name ?? '')} marker`}
        >
          <Icon name="close" size={17} color={theme.textPrimary} />
        </Pressable>
      </View>
    </View>
  )
}

function IconBtn({ theme, name, color, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.ripple, borderless: true, radius: 22 }}
      hitSlop={4}
      style={{ padding: 7, borderRadius: 20 }}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={name} size={21} color={color} />
    </Pressable>
  )
}

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 6,
    minHeight: 48
  }
})
