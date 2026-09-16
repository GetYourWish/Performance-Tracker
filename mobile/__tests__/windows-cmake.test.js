// Unit tests for mobile/plugins/patch-windows-cmake.js
//
// The patcher is the source-level fix for the Windows C++ build failure
//   "ninja: error: manifest 'build.ninja' still dirty after 100 tries"
// which is caused by file(GLOB_RECURSE … CONFIGURE_DEPENDS) in
// react-native-reanimated 4.6.x and react-native-worklets 0.12.x.
// The transforms are pure string work, tested against excerpts of the
// real 4.6.0 / 0.12.1 files shipped on npm.

const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  patchCMakeListsText,
  patchGradleKtsText,
  patchWindowsCmake,
  CMAKE_SUPPRESS,
  CMAKE_OBJMAX,
  MARKER,
  NATIVE_LIBS
} = require('../plugins/patch-windows-cmake')

const REANIMATED_CMAKELISTS = `project(Reanimated)
cmake_minimum_required(VERSION 3.16)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

file(GLOB_RECURSE REANIMATED_COMMON_CPP_SOURCES CONFIGURE_DEPENDS
     "\${COMMON_CPP_DIR}/reanimated/*.cpp")
file(GLOB_RECURSE REANIMATED_ANDROID_CPP_SOURCES CONFIGURE_DEPENDS
     "\${ANDROID_CPP_DIR}/reanimated/*.cpp")
file(GLOB_RECURSE REANIMATED_NATIVEVIEW_CPP_SOURCES CONFIGURE_DEPENDS
     "\${NATIVEVIEW_DIR}/react/renderer/components/rnreanimated/*.cpp")

add_library(reanimated SHARED \${REANIMATED_COMMON_CPP_SOURCES})
`

const WORKLETS_CMAKELISTS = `cmake_minimum_required(VERSION 3.16)
project(Worklets)

file(GLOB_RECURSE WORKLETS_COMMON_CPP_SOURCES CONFIGURE_DEPENDS
     "\${COMMON_CPP_DIR}/worklets/*.cpp")
file(GLOB_RECURSE WORKLETS_ANDROID_CPP_SOURCES CONFIGURE_DEPENDS
     "\${ANDROID_CPP_DIR}/worklets/*.cpp")
`

const REANIMATED_KTS = `        @Suppress("UnstableApiUsage")
        externalNativeBuild {
            cmake {
                arguments(
                    "-DANDROID_STL=c++_shared",
                    "-DANDROID_TOOLCHAIN=clang",
                    "-DREACT_NATIVE_DIR=\${toPlatformFileString(reactNativeRootDir.path)}",
                    "-DREANIMATED_VERSION=$REANIMATED_VERSION"
                )
                targets("reanimated")
            }
        }
`

describe('patchCMakeListsText', () => {
  test('strips CONFIGURE_DEPENDS and inserts the suppress-regeneration block (reanimated shape)', () => {
    const { contents, changed } = patchCMakeListsText(REANIMATED_CMAKELISTS)
    expect(changed).toBe(true)
    expect(contents).not.toMatch(/\bCONFIGURE_DEPENDS\b/)
    expect(contents).toContain('file(GLOB_RECURSE REANIMATED_COMMON_CPP_SOURCES')
    expect(contents).toContain('${COMMON_CPP_DIR}/reanimated/*.cpp')
    expect(contents).toContain('set(CMAKE_SUPPRESS_REGENERATION ON)')
    expect(contents).toContain('set(CMAKE_OBJECT_PATH_MAX 1024)')
    expect(contents).toContain(MARKER)
    // block lands after cmake_minimum_required, sources still compile
    const reqAt = contents.indexOf('cmake_minimum_required')
    const blockAt = contents.indexOf('set(CMAKE_SUPPRESS_REGENERATION ON)')
    const globAt = contents.indexOf('file(GLOB_RECURSE')
    expect(reqAt).toBeGreaterThanOrEqual(0)
    expect(blockAt).toBeGreaterThan(reqAt)
    expect(globAt).toBeGreaterThan(blockAt)
  })

  test('handles cmake_minimum_required appearing before project() (worklets shape)', () => {
    const { contents, changed } = patchCMakeListsText(WORKLETS_CMAKELISTS)
    expect(changed).toBe(true)
    expect(contents).not.toMatch(/\bCONFIGURE_DEPENDS\b/)
    expect(contents).toContain('file(GLOB_RECURSE WORKLETS_COMMON_CPP_SOURCES')
    expect(contents).toContain('set(CMAKE_SUPPRESS_REGENERATION ON)')
  })

  test('is idempotent', () => {
    const once = patchCMakeListsText(REANIMATED_CMAKELISTS).contents
    const twice = patchCMakeListsText(once)
    expect(twice.changed).toBe(false)
    expect(twice.contents).toBe(once)
    expect(twice.contents.split('CMAKE_SUPPRESS_REGENERATION').length - 1).toBe(1)
  })

  test('preserves CRLF when the input is a Windows checkout', () => {
    const crlf = REANIMATED_CMAKELISTS.replace(/\n/g, '\r\n')
    const { contents } = patchCMakeListsText(crlf)
    expect(contents).toContain('\r\n')
    expect(contents).toContain('set(CMAKE_SUPPRESS_REGENERATION ON)\r\n')
    expect(contents.includes('ON\nset(CMAKE_OBJECT')).toBe(false)
  })
})

describe('patchGradleKtsText', () => {
  test('injects both -D flags ahead of the existing ANDROID_STL argument', () => {
    const { contents, changed, missing } = patchGradleKtsText(REANIMATED_KTS)
    expect(missing).toBe(false)
    expect(changed).toBe(true)
    expect(contents).toContain(CMAKE_SUPPRESS)
    expect(contents).toContain(CMAKE_OBJMAX)
    const suppressAt = contents.indexOf(CMAKE_SUPPRESS)
    const stlAt = contents.indexOf('-DANDROID_STL=c++_shared')
    expect(suppressAt).toBeGreaterThanOrEqual(0)
    expect(stlAt).toBeGreaterThan(suppressAt)
    // still a valid arguments() list — flags are quoted comma-separated
    expect(contents).toContain(`"${CMAKE_SUPPRESS}",`)
    expect(contents).toContain(`"${CMAKE_OBJMAX}",`)
  })

  test('is idempotent', () => {
    const once = patchGradleKtsText(REANIMATED_KTS).contents
    const twice = patchGradleKtsText(once)
    expect(twice.changed).toBe(false)
    expect(twice.contents).toBe(once)
    expect(twice.contents.split(CMAKE_SUPPRESS).length - 1).toBe(1)
  })

  test('reports missing when there is no cmake ANDROID_STL argument to anchor on', () => {
    const { missing, changed, contents } = patchGradleKtsText('plugins { id("com.android.library") }\n')
    expect(missing).toBe(true)
    expect(changed).toBe(false)
    expect(contents).toBe('plugins { id("com.android.library") }\n')
  })
})

describe('patchWindowsCmake filesystem walk', () => {
  let tmp
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-cmake-test-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function seedLayout({ hoisted }) {
    const mobileRoot = path.join(tmp, 'mobile')
    const nm = hoisted ? path.join(tmp, 'node_modules') : path.join(mobileRoot, 'node_modules')
    fs.mkdirSync(mobileRoot, { recursive: true })
    for (const lib of NATIVE_LIBS) {
      const android = path.join(nm, lib.name, 'android')
      fs.mkdirSync(android, { recursive: true })
      fs.writeFileSync(path.join(android, 'CMakeLists.txt'), REANIMATED_CMAKELISTS)
      fs.writeFileSync(path.join(android, 'build.gradle.kts'), REANIMATED_KTS)
    }
    return { mobileRoot, nm }
  }

  test('patches CMakeLists + gradle.kts for both libraries (nested node_modules)', () => {
    const { mobileRoot, nm } = seedLayout({ hoisted: false })
    const result = patchWindowsCmake(mobileRoot)
    expect(result.ok).toBe(true)
    expect(result.patched).toBe(4)
    expect(result.missing).toEqual([])
    for (const lib of NATIVE_LIBS) {
      const cmake = fs.readFileSync(path.join(nm, lib.name, 'android', 'CMakeLists.txt'), 'utf8')
      expect(cmake).not.toMatch(/\bCONFIGURE_DEPENDS\b/)
      expect(cmake).toContain('CMAKE_SUPPRESS_REGENERATION')
      const kts = fs.readFileSync(path.join(nm, lib.name, 'android', 'build.gradle.kts'), 'utf8')
      expect(kts).toContain(CMAKE_SUPPRESS)
    }
  })

  test('finds libraries when npm hoisted them to the repo root', () => {
    const { mobileRoot } = seedLayout({ hoisted: true })
    const result = patchWindowsCmake(mobileRoot)
    expect(result.ok).toBe(true)
    expect(result.patched).toBe(4)
  })

  test('second run is a no-op (alreadyOk, no extra writes)', () => {
    const { mobileRoot, nm } = seedLayout({ hoisted: false })
    patchWindowsCmake(mobileRoot)
    const before = fs.readFileSync(path.join(nm, 'react-native-reanimated', 'android', 'CMakeLists.txt'), 'utf8')
    const second = patchWindowsCmake(mobileRoot)
    expect(second.patched).toBe(0)
    expect(second.alreadyOk).toBe(4)
    expect(second.ok).toBe(true)
    const after = fs.readFileSync(path.join(nm, 'react-native-reanimated', 'android', 'CMakeLists.txt'), 'utf8')
    expect(after).toBe(before)
  })

  test('returns ok=false when node_modules is missing, without throwing', () => {
    const mobileRoot = path.join(tmp, 'mobile')
    fs.mkdirSync(mobileRoot, { recursive: true })
    const result = patchWindowsCmake(mobileRoot)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('node_modules')
  })
})
