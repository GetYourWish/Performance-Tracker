#!/usr/bin/env node
// Desktop packaging preflight: run before electron-builder so the build fails
// fast with actionable instructions instead of the cryptic
// "Cannot compute electron version from installed node modules" error.
//
// Root causes this guards against (all observed in the wild):
//   1. `npm audit fix --force` rewrites the exact `electron` pin in
//      desktop/package.json to a `^` range and downgrades electron-builder
//      below v26, which cannot resolve electron in npm workspaces
//      (electron-userland/electron-builder#3984).
//   2. Stale node_modules left over after manifest/lockfile changes.
//   3. electron simply not installed (fresh clone, failed npm install).
// Wired into desktop/package.json `dist` and `dist:win` scripts.
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const desktopDir = path.join(root, 'desktop')
const MIN_BUILDER_MAJOR = 26

// Exact x.y.z, optionally with a prerelease/build suffix. No ^ ~ > * ranges.
const EXACT = /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/

let failed = false
const fail = (msg) => { console.error('desktop-preflight FAIL: ' + msg); failed = true }
const ok = (msg) => { console.log('desktop-preflight OK: ' + msg) }
const warn = (msg) => { console.warn('desktop-preflight WARN: ' + msg) }

// Find <name>/package.json by walking up from desktop/ (desktop/node_modules,
// then the repo root node_modules where npm workspaces hoist dependencies).
function resolvePkg (name) {
  let dir = desktopDir
  for (;;) {
    const p = path.join(dir, 'node_modules', name, 'package.json')
    if (fs.existsSync(p)) return p
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readJson (p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    fail('cannot parse ' + path.relative(root, p) + ': ' + err.message)
    return null
  }
}

function majorOf (version) {
  // Tolerate range prefixes ("^26.15.3", "~25.1.0", ">=26"): use the first
  // "digits." group in the string. Returns NaN for "latest", "workspace:*" etc.
  const m = /(\d+)\./.exec(String(version || ''))
  return m ? Number(m[1]) : NaN
}

const pkgPath = path.join(desktopDir, 'package.json')
const pkg = readJson(pkgPath)
const deps = pkg ? Object.assign({}, pkg.dependencies, pkg.devDependencies) : {}
const declaredElectron = deps.electron
const declaredBuilder = deps['electron-builder']

// 1. electron must be pinned to an exact version.
if (declaredElectron === undefined) {
  fail('desktop/package.json does not declare electron')
} else if (!EXACT.test(declaredElectron)) {
  fail(
    'desktop/package.json declares electron "' + declaredElectron + '" — it must be an EXACT version ' +
    '(e.g. "44.0.0", no ^ ~ *). electron-builder cannot compute the version from a range in an ' +
    'npm-workspaces monorepo. This is usually caused by running `npm audit fix --force`, which ' +
    'rewrites the pin; restore it with: git checkout -- desktop/package.json'
  )
}

// 2. electron-builder must be v26+ (25.x cannot resolve electron in workspaces).
if (declaredBuilder === undefined) {
  fail('desktop/package.json does not declare electron-builder')
} else {
  const major = majorOf(declaredBuilder)
  if (!Number.isFinite(major) || major < MIN_BUILDER_MAJOR) {
    fail(
      'desktop/package.json declares electron-builder "' + declaredBuilder + '" — v' + MIN_BUILDER_MAJOR +
      '+ is required. electron-builder 25.x cannot detect electron in npm workspaces ' +
      '(electron-userland/electron-builder#3984). If this was changed by `npm audit fix --force`, ' +
      'restore it with: git checkout -- desktop/package.json'
    )
  }
}

// 3. electron must actually be installed and match the pin.
const electronPkgPath = resolvePkg('electron')
if (!electronPkgPath) {
  fail(
    'electron is not installed (no node_modules/electron found from desktop/) — ' +
    'run `npm install` at the repository root'
  )
} else {
  const installed = readJson(electronPkgPath)
  const version = installed && installed.version
  if (version) {
    if (declaredElectron && EXACT.test(declaredElectron) && version !== declaredElectron) {
      fail(
        'installed electron is ' + version + ' but desktop/package.json pins ' + declaredElectron +
        ' — node_modules is out of sync. Delete node_modules (repo root and desktop/), then run `npm install`'
      )
    } else {
      ok('electron ' + version + ' installed at ' + path.relative(root, path.dirname(electronPkgPath)))
    }
  }
}

// 4. the electron-builder that will actually run must be v26+ too.
const builderPkgPath = resolvePkg('electron-builder')
if (!builderPkgPath) {
  fail('electron-builder is not installed (no node_modules/electron-builder found from desktop/) — run `npm install` at the repository root')
} else {
  const installed = readJson(builderPkgPath)
  const version = installed && installed.version
  const major = majorOf(version)
  if (version && Number.isFinite(major)) {
    if (major < MIN_BUILDER_MAJOR) {
      fail(
        'installed electron-builder is ' + version + ' but v' + MIN_BUILDER_MAJOR + '+ is required — ' +
        'node_modules is stale (this is what prints "Cannot compute electron version" with builder 25.x). ' +
        'Delete node_modules (repo root and desktop/), then run `npm install`'
      )
    } else {
      ok('electron-builder ' + version + ' installed at ' + path.relative(root, path.dirname(builderPkgPath)))
    }
  }
}

// 5. electron runtime binary: only a warning — electron-builder downloads its
//    own zip for packaging; the local binary is only needed for dev (`npm run dev`).
if (electronPkgPath) {
  const electronDir = path.dirname(electronPkgPath)
  const hasBinary = fs.existsSync(path.join(electronDir, 'dist')) || fs.existsSync(path.join(electronDir, 'path.txt'))
  if (!hasBinary && !process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    warn(
      'electron runtime binary was not downloaded (postinstall skipped?). Packaging still works ' +
      '(electron-builder fetches its own copy), but `npm run dev` / `npm start` need it. ' +
      'If your npm (11.9+) blocked the script, run: npm install-scripts approve electron && npm install'
    )
  }
}

if (failed) {
  console.error('')
  console.error('desktop-preflight: fix the problems above, then re-run this command.')
  console.error('Most common cause: `npm audit fix --force` rewrote the pinned versions.')
  console.error('Full recovery from the repository root:')
  console.error('  1. git checkout -- desktop/package.json package.json package-lock.json')
  console.error('     (or: git reset --hard origin/main)')
  console.error('  2. delete node_modules at the repo root and in desktop/')
  console.error('  3. npm install')
  process.exit(1)
}

console.log('desktop-preflight: versions verified, starting the build')
