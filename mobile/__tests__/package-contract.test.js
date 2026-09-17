// Package contract test — the app's imports must match the REAL export shape
// of react-native-draggable-flatlist, not the shape we imagine it has.
//
// REGRESSION THIS GUARDS (2026-09-17 crash report):
//   BoardScreen did `import { DraggableFlatList, ScaleDecorator } from
//   'react-native-draggable-flatlist'`. The package's v4 entry exports the
//   list component as the DEFAULT export only — the named binding was
//   `undefined` in the release bundle, and the first board render on a real
//   device died with:
//     "Element type is invalid: expected a string (for built-in components)
//      or a class/function (for composite components) but got: undefined"
//   The jest mocks had invented a named DraggableFlatList export, so every
//   test passed while the app crashed on device. (Same failure class as the
//   SAF createFileAsync(parentUri, mimeType, fileName) arg-order bug: a mock
//   that mirrors the app's wrong assumption instead of the real API.)
//
// This test reads the ACTUAL installed package (both entries Metro can pick:
// the `react-native` field src/index.tsx and the `main` field
// lib/commonjs/index.js) and pins its export shape. If the package ever
// changes its export shape (major upgrade), this fails BEFORE the app ships
// with a silently-undefined import.

const fs = require('fs')
const path = require('path')

const pkgRoot = path.dirname(require.resolve('react-native-draggable-flatlist/package.json'))

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return null
  }
}

describe('react-native-draggable-flatlist export contract', () => {
  const srcEntry = readIfExists(path.join(pkgRoot, 'src', 'index.tsx'))
  const cjsEntry = readIfExists(path.join(pkgRoot, 'lib', 'commonjs', 'index.js'))

  test('package is installed and both entries are readable', () => {
    expect(srcEntry).toBeTruthy()
    expect(cjsEntry).toBeTruthy()
  })

  test('src entry (Metro "react-native" field): list is the DEFAULT export, ScaleDecorator named', () => {
    expect(srcEntry).toMatch(/export\s+default\s+DraggableFlatList/)
    expect(srcEntry).toMatch(/export\s+\*\s+from\s+"\.\/components\/CellDecorators"/)
    // no named re-export of the list itself
    expect(srcEntry).not.toMatch(/export\s*\{[^}]*DraggableFlatList/)
  })

  test('CJS entry (package "main"): exports.default carries the list, no named DraggableFlatList', () => {
    expect(cjsEntry).toMatch(/exports\.default/)
    expect(cjsEntry).not.toMatch(/exports\.DraggableFlatList\b/)
    // ScaleDecorator is re-exported as a named getter from CellDecorators
    expect(cjsEntry).toMatch(/_CellDecorators/)
  })

  test('CellDecorators really exports ScaleDecorator (named)', () => {
    const cjs = readIfExists(path.join(pkgRoot, 'lib', 'commonjs', 'components', 'CellDecorators.js'))
    expect(cjs).toBeTruthy()
    expect(cjs).toMatch(/exports\.ScaleDecorator\s*=/)
  })

  test("BoardScreen imports the list as the DEFAULT export (a named import resolves to undefined)", () => {
    const board = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'BoardScreen.js'), 'utf8')
    expect(board).toMatch(
      /import\s+DraggableFlatList\s*,\s*\{[^}]*ScaleDecorator[^}]*\}\s*from\s+'react-native-draggable-flatlist'/
    )
    // and NOT as a named-only import
    expect(board).not.toMatch(
      /import\s*\{\s*DraggableFlatList/
    )
  })
})
