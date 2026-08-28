// rows.js — board row renderers, mirroring desktop BoardRow.jsx visuals:
//  - task rows: row-fill card, category color bar, text, action icons
//  - marker rows: centered pill with category.color+'4D' background,
//    "/Name" label, note indicator
// Action buttons / drag handle light up in M2; M1 renders read-only rows.

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons'
import { RADIUS, SPACING } from '../theme.js'

// '#RRGGBB' + '4D' desktop alpha suffix → rgba() RN color
export function withAlpha(hex, alphaHex = '4D') {
  if (typeof hex !== 'string' || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) {
    return hex
  }
  const r = hex.slice(1, 3)
  const g = hex.slice(3, 5)
  const b = hex.slice(5, 7)
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${parseInt(alphaHex, 16) / 255})`
}

export function TaskRow({ theme, task, category, isWorkingOn, flowStateColor, onOpen }) {
  return (
    <Pressable
      onPress={onOpen}
      android_ripple={{ color: theme.ripple }}
      style={[
        styles.row,
        { backgroundColor: theme.rowFill, borderRadius: RADIUS.md, marginBottom: SPACING.xs },
        isWorkingOn && {
          borderWidth: 1.5,
          borderColor: flowStateColor,
          backgroundColor: withAlpha(flowStateColor, '1A')
        }
      ]}
    >
      {category ? (
        <View
          style={{
            width: 4,
            alignSelf: 'stretch',
            borderRadius: 2,
            backgroundColor: category.color,
            marginRight: SPACING.sm
          }}
        />
      ) : null}
      <Text
        numberOfLines={4}
        style={{ flex: 1, color: theme.textPrimary, fontSize: 15.5, lineHeight: 21 }}
      >
        {String(task?.text ?? '')}
      </Text>
    </Pressable>
  )
}

export function MarkerRow({ theme, marker, category, onPress }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.sm }}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.ripple, borderless: true }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.sm,
          backgroundColor: withAlpha(category?.color),
          borderRadius: 20,
          paddingHorizontal: 20,
          paddingVertical: 8
        }}
        accessibilityLabel={`Category marker: ${String(category?.name ?? '')}`}
      >
        <Icon name="information-outline" size={15} color={theme.textPrimary} />
        <Text style={{ color: theme.textPrimary, fontWeight: '500', fontSize: 14 }}>
          /{String(category?.name ?? '')}
        </Text>
      </Pressable>
    </View>
  )
}

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    minHeight: 48
  }
})
