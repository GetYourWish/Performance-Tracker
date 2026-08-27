// Verify the React #62 fix:
// 1. ErrorBoundary fallback must render cleanly when it catches an error
//    (previously crashed with "Minified React error #62" because <pre style="...">
//     passed a raw string as the style prop)
// 2. Source scan: no string-valued style props remain anywhere
import { JSDOM } from 'jsdom'
import fsSync from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const APP_ROOT = path.resolve(import.meta.dirname, '..')
const SCRIPTS = import.meta.dirname

// ------------------------------------------------------------------
// 1. jsdom globals — must exist BEFORE react-dom is imported
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
global.matchMedia = dom.window.matchMedia
global.HTMLElement = dom.window.HTMLElement
global.SVGElement = dom.window.SVGElement
global.Element = dom.window.Element
global.Node = dom.window.Node
global.getComputedStyle = dom.window.getComputedStyle
global.requestAnimationFrame = cb => setTimeout(cb, 0)
global.cancelAnimationFrame = id => clearTimeout(id)

// Mock Electron IPC bridge used by the app at boot
window.electronAPI = {
  loadData: async () => ({ success: true, data: null }),
  saveData: async () => ({ success: true }),
  getDataPath: async () => 'C:\\fake\\data.json',
  getSavedState: async () => ({ theme: 'dark', view: null }),
  saveState: async () => ({ success: true }),
  getDefaultDataPath: async () => 'C:\\fake\\data.json',
  onFileChanged: () => () => {},
  openFolderPicker: async () => ({ success: true, canceled: true }),
  getIconThemes: async () => ['gradient', 'ember'],
  getAppVersion: async () => '1.0.0'
}

let failures = 0
const test = (name, cond) => {
  console.log(cond ? `  PASS  ${name}` : `  FAIL  ${name}`)
  if (!cond) failures++
}

// ------------------------------------------------------------------
// 2. Build a single self-contained test bundle (react + react-dom +
//    ErrorBoundary) so Node never has to load .jsx directly
// ------------------------------------------------------------------
const entryFile = path.join(SCRIPTS, '.test-entry.mjs')
const outFile = path.join(SCRIPTS, '.boundary-test.mjs')
fsSync.writeFileSync(entryFile, [
  `import React from 'react'`,
  `import { createRoot } from 'react-dom/client'`,
  `import ErrorBoundary from '${path.join(APP_ROOT, 'src/components/ErrorBoundary.jsx').replace(/\\/g, '/')}'`,
  `export { React, createRoot, ErrorBoundary }`
].join('\n'))

execSync(
  `npx rolldown "${entryFile}" --format esm --file "${outFile}" --platform browser`,
  { stdio: 'pipe', cwd: APP_ROOT }
)

const { React, createRoot, ErrorBoundary } = await import(outFile)

// ------------------------------------------------------------------
// Test 1: ErrorBoundary renders its fallback when a child throws
// ------------------------------------------------------------------
console.log('\n[1] ErrorBoundary fallback render (the #62 crash scenario)')

function Bomb() { throw new Error('Simulated app crash: original underlying error') }

const errors = []
const origError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')) } // silence expected React error logs

const root = createRoot(document.getElementById('root'))
root.render(
  React.createElement(React.StrictMode, null,
    React.createElement(ErrorBoundary, null, React.createElement(Bomb))
  )
)
await new Promise(r => setTimeout(r, 300))
console.error = origError

const html = document.getElementById('root').innerHTML
test('fallback heading rendered', html.includes('Something went wrong'))
test('original error message surfaced', html.includes('Simulated app crash'))
test('stack trace rendered (real stack present)', html.includes('verify-fix.mjs') || html.includes('stack trace available'))
test('reload button rendered', html.includes('Reload Application'))
test('NO React #62 anywhere', !errors.some(e => e.includes('#62') || e.includes('style` prop expects')))

// ------------------------------------------------------------------
// Test 2: no string-valued style props left in source
// ------------------------------------------------------------------
console.log('\n[2] Source scan: no string-valued style props')
let bad = []
const scan = dir => {
  for (const f of fsSync.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fsSync.statSync(p)
    if (st.isDirectory()) scan(p)
    else if (/\.(jsx|js)$/.test(f)) {
      const src = fsSync.readFileSync(p, 'utf8')
      // style="..." or style={`...`} — React does not accept string styles
      if (/style\s*=\s*(["'`])/.test(src)) bad.push(path.relative(APP_ROOT, p))
    }
  }
}
scan(path.join(APP_ROOT, 'src'))
test(`no string style props (found: ${bad.join(', ') || 'none'})`, bad.length === 0)

// cleanup temp bundles
for (const f of [entryFile, outFile]) fsSync.rmSync(f, { force: true })

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
