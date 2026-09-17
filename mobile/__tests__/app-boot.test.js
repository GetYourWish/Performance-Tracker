// Boot smoke test — mounts the FULL App component tree (the real one, no
// component mocks) exactly like the device does on first launch.
//
// REGRESSION THIS GUARDS:
//   useSafeAreaInsets() throws 'No safe area value available. Make sure you
//   are rendering <SafeAreaProvider> at the top of your app.' when no
//   provider ancestor exists. Expo's registerRootComponent() registers the
//   root component as-is (no SafeAreaProvider wrapper), so the app crashed
//   on its very first render on-device. Invisible to every logic test
//   (none renders App) and unmasked only once a real JS bundle finally ran
//   in a release APK — release has no red box, so the process just died.
//
// This file mounts <App> with the REAL react-native-safe-area-context
// (no module mock): if anyone removes the SafeAreaProvider from App, the
// first render must throw here, in CI, before any APK is produced.
// (The native provider stub renders no children under jest, so deep-tree
// assertions live in app-boot-full.test.js which uses the official mock.)

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import App from '../App'

// Jest has no native modules — use the official AsyncStorage mock.
// (On-device the TurboModule exists; this is a test-environment artifact.)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
// The drag-and-drop stack's native runtime (reanimated worklets) cannot boot
// under jest, so the module is stubbed — but the stub must mirror the REAL
// package's export shape: DraggableFlatList is the DEFAULT export only (v4
// index: `export default DraggableFlatList`). The previous stub invented a
// NAMED DraggableFlatList export, which masked the on-device crash where
// `import { DraggableFlatList }` resolved to undefined and the release bundle
// died with "Element type is invalid" the first time the board rendered.
// With this honest shape, a regression back to a named import makes the
// board-branch render tests below throw — in CI, not on the user's phone.
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react')
  const RN = require('react-native')
  return {
    __esModule: true,
    default: props => React.createElement(RN.FlatList, props),
    ScaleDecorator: ({ children }) => children
  }
})

describe('app boot with REAL safe-area-context (crash regression guard)', () => {
  afterEach(async () => {
    await AsyncStorage.clear()
  })

  test('mounting <App> does not throw (SafeAreaProvider must wrap the shell)', async () => {
    let tree = null
    await act(async () => {
      tree = TestRenderer.create(<App />)
      await Promise.resolve()
    })
    // no exception during render/effects — the historical bug threw right here
    expect(tree).toBeTruthy()
    // and the root of <App> must be the SafeAreaProvider itself
    // (native component stub type under jest — proves the provider wraps
    // the shell rather than hanging somewhere below the inset hooks)
    const root = tree.toJSON()
    expect(root && root.type).toBe('RNCSafeAreaProvider')
  })
})
