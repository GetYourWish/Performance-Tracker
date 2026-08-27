// Verify the Board hook-order fix:
// Previously: useMemo(() => useSensors(...), []) registered dnd-kit hooks only
// on FIRST render (factory skipped on updates) -> hook misalignment ->
// "TypeError: Cannot read properties of undefined (reading 'length')" in
// areHookInputsEqual on the SECOND render of Board.
//
// This test mounts Board, then forces an update render — the crash scenario.
import { JSDOM } from 'jsdom'
import fsSync from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const APP_ROOT = path.resolve(import.meta.dirname, '..')
const SCRIPTS = import.meta.dirname

// ------------------------------------------------------------------
// jsdom globals — must exist BEFORE react-dom is imported
// ------------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
})

global.window = dom.window
global.document = dom.window.document
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
global.localStorage = dom.window.localStorage
global.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
dom.window.matchMedia = global.matchMedia
global.HTMLElement = dom.window.HTMLElement
global.SVGElement = dom.window.SVGElement
global.Element = dom.window.Element
global.Node = dom.window.Node
global.getComputedStyle = dom.window.getComputedStyle
global.requestAnimationFrame = cb => setTimeout(cb, 0)
global.cancelAnimationFrame = id => clearTimeout(id)
// dnd-kit requires ResizeObserver
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = dom.window.ResizeObserver = MockResizeObserver
// jsdom lacks Element.scrollIntoView / scrollBy used by some widgets
dom.window.Element.prototype.scrollIntoView = function () {}
dom.window.Element.prototype.scrollTo = function () {}
dom.window.scrollTo = function () {}

let failures = 0
const test = (name, cond) => {
  console.log(cond ? `  PASS  ${name}` : `  FAIL  ${name}`)
  if (!cond) failures++
}

// ------------------------------------------------------------------
// Build self-contained bundle: react + react-dom + @dnd-kit + Board
// ------------------------------------------------------------------
const entryFile = path.join(SCRIPTS, '.board-entry.mjs')
const outFile = path.join(SCRIPTS, '.board-test.mjs')
fsSync.writeFileSync(entryFile, [
  `import React, { useState } from 'react'`,
  `import { createRoot } from 'react-dom/client'`,
  `import Board from '${path.join(APP_ROOT, 'src/components/Board.jsx').replace(/\\/g, '/')}'`,
  `export { React, useState, createRoot, Board }`
].join('\n'))

execSync(
  `npx rolldown "${entryFile}" --format esm --file "${outFile}" --platform browser ` +
  `--external electron`,
  { stdio: 'pipe', cwd: APP_ROOT }
)

const { React, useState, createRoot, Board } = await import(outFile)

// ------------------------------------------------------------------
// Test: Board survives mount + UPDATE render (the crash scenario)
// ------------------------------------------------------------------
console.log('\n[3] Board mount + update render (hook-order crash scenario)')

const makeData = () => ({
  schemaVersion: 1,
  settings: { theme: 'dark', weekStartsOn: 1, fatigueIncrement: 0.1, fatigueCap: 3 },
  difficulties: [{ id: 'd1', label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true }],
  categories: [{ id: 'c1', name: 'Work', color: '#60a5fa', order: 0, active: true }],
  markers: [{ id: 'm1', categoryId: 'c1', order: 0 }],
  board: [
    { id: 'b1', type: 'marker', markerId: 'm1' },
    { id: 'b2', type: 'task', taskId: 't1' }
  ],
  tasks: [{ id: 't1', text: 'Test task', createdAt: new Date().toISOString() }],
  workingOn: [],
  logs: []
})

const errors = []
const origError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')) }

// Wrapper bumps a counter after mount to force an UPDATE render of Board
function TestHarness() {
  const [tick, setTick] = useState(0)
  useState && setTimeout(() => setTick(1), 50) // schedule update after mount
  return React.createElement(Board, {
    key: 0,
    data: makeData(),
    onSave: () => {}
  })
}

const root = createRoot(document.getElementById('root'))
let crashed = false
try {
  root.render(React.createElement(TestHarness))
  await new Promise(r => setTimeout(r, 600)) // allow mount + scheduled update + effects
} catch (e) {
  crashed = true
  console.log('  threw synchronously:', e.message)
}
console.error = origError

const html = document.getElementById('root').innerHTML
test('Board rendered content', html.includes('Test task'))
test('no length-of-undefined TypeError', !errors.some(e => e.includes("reading 'length'")))
test('no hook-order warnings', !errors.some(e => e.includes('Rendered more hooks') || e.includes('Rendered fewer hooks')))

// cleanup
for (const f of [entryFile, outFile]) fsSync.rmSync(f, { force: true })

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
