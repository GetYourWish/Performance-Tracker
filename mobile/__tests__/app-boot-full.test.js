// Full boot pipeline test — mounts <App> with a fully self-contained
// safe-area-context mock (own React contexts, zero requireActual) and asserts
// the whole first-run flow resolves to the SetupScreen:
//   boot splash → AsyncStorage empty → status 'no-folder' → SetupScreen(fresh)
//
// The crash-regression guard (REAL context, throws without a provider, root
// element must be the provider) lives in app-boot.test.js; this file proves
// the tree actually RENDERS once the provider is in place.

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import App from '../App'

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const insets = { top: 0, bottom: 0, left: 0, right: 0 }
  const frame = { width: 320, height: 640, x: 0, y: 0 }
  const InsetsCtx = React.createContext(insets)
  const FrameCtx = React.createContext(frame)
  return {
    __esModule: true,
    SafeAreaProvider: ({ children }) =>
      React.createElement(
        InsetsCtx.Provider,
        { value: insets },
        React.createElement(FrameCtx.Provider, { value: frame }, children)
      ),
    SafeAreaInsetsContext: InsetsCtx,
    SafeAreaFrameContext: FrameCtx,
    SafeAreaConsumer: InsetsCtx.Consumer,
    initialWindowMetrics: { insets, frame },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    withSafeAreaInsets: Wrapped => props => React.createElement(Wrapped, { ...props, insets })
  }
})
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react')
  const RN = require('react-native')
  return {
    DraggableFlatList: props => React.createElement(RN.FlatList, props),
    ScaleDecorator: ({ children }) => children
  }
})

async function flushMicrotasks(times = 12) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

function collectTexts(node, out = []) {
  if (node == null) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    node.forEach(child => collectTexts(child, out))
    return out
  }
  if (node.children) collectTexts(node.children, out)
  return out
}

describe('app boot pipeline (full tree render)', () => {
  afterEach(async () => {
    await AsyncStorage.clear()
  })

  test('first run mounts all the way to the setup screen without throwing', async () => {
    let tree = null
    await act(async () => {
      tree = TestRenderer.create(<App />)
      await Promise.resolve()
    })
    await flushMicrotasks()

    expect(tree).toBeTruthy()

    const texts = collectTexts(tree.toJSON()).join(' | ')
    // fresh install → SetupScreen fresh-mode headline
    expect(texts).toContain('Welcome to Performance Tracker')
    // and it must still be mounted (not an error screen)
    expect(texts).not.toContain('No safe area value available')
  })
})
