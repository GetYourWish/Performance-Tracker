#!/usr/bin/env node
'use strict';

/**
 * Windows CMake/ninja fix for react-native-reanimated + react-native-worklets.
 *
 * Symptoms (assembleRelease on Windows):
 *
 *   1. Task :react-native-*:buildCMakeRelWithDebInfo[arm64-v8a] FAILED
 *      C/C++: ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 *   2. Task :react-native-worklets:buildCMakeRelWithDebInfo[arm64-v8a][worklets] FAILED
 *      ninja: error: mkdir(CMakeFiles/worklets.dir/C_/Users/…/Common): No such file or directory
 *
 * Root cause (1), verified against reanimated 4.6.0 / worklets 0.12.1 CMakeLists.txt:
 * both libraries glob their C++ sources with
 *
 *   file(GLOB_RECURSE … CONFIGURE_DEPENDS "…/*.cpp")
 *
 * CONFIGURE_DEPENDS makes CMake emit a Ninja phony (`VerifyGlobs.cmake_force`)
 * with no inputs. On Windows that phony is always dirty, so ninja re-runs
 * CMake, the manifest is rewritten, ninja still sees it dirty, 100 times,
 * then gives up. CMake issue #21106.
 *
 * Root cause (2): those globs run against an absolute path
 * (`${CMAKE_SOURCE_DIR}/../Common/cpp`). CMake encodes `C:\Users\…` as
 * `C_/Users/…` inside the object-file directory. The .cxx dir is already
 * ~130 chars, so the encoded object path exceeds Windows MAX_PATH (260)
 * and ninja mkdir fails. CMake 3.22.1's ninja (Android SDK default) does
 * not use the `\\?\` long-path prefix.
 *
 * CMAKE_OBJECT_PATH_MAX is a trap on this toolchain:
 *   - 1024 (tried first) is above the unhashed length, so CMake does not
 *     hash and ninja gets C_/Users/… → mkdir fails.
 *   - 128 (tried second) is below the *hashed* length (~215), so CMake
 *     hashes, decides the hash still does not fit, falls back to the
 *     original long path → mkdir fails the same way. Observed: .cxx hash
 *     changed (4zc15271) but the mkdir path was still C_/Users/….
 *   - 250 (Windows default) hashes long paths AND accepts the hashed
 *     form. Used as a backstop. The real fix is (4) below.
 *
 * Fix (idempotent, version-tolerant string surgery on the two libraries):
 *   1. Strip CONFIGURE_DEPENDS from the GLOB_RECURSE calls.
 *   2. set(CMAKE_SUPPRESS_REGENERATION ON) so ninja never gets RERUN_CMAKE.
 *   3. set(CMAKE_OBJECT_PATH_MAX 250 CACHE STRING "" FORCE) BEFORE project()
 *      — that is when the generator reads it. Gradle also gets the -D flag.
 *   4. Relativize the globbed *_CPP_SOURCES before add_library so object
 *      dirs become CMakeFiles/<tgt>.dir/__/Common/cpp/… instead of
 *      CMakeFiles/<tgt>.dir/C_/Users/…. This is what actually keeps the
 *      path under MAX_PATH, independent of CMake's hash fallback.
 *
 * Runs in THREE places so the flow is order-proof:
 *   1. npm postinstall of @performance-tracker/mobile
 *   2. every prebuild, via plugins/with-windows-cmake.js
 *   3. npm run clean:native — the documented repair,
 *      so `git pull` + clean:native + assembleRelease is enough.
 *
 * Does not change app JS, native UX, or Gradle/AGP versions.
 */

const fs = require('fs');
const path = require('path');

const TAG = '[with-windows-cmake]';
const MARKER = '>>> with-windows-cmake';
const REL_MARKER = '>>> with-windows-cmake-relsrc';
const CMAKE_SUPPRESS = '-DCMAKE_SUPPRESS_REGENERATION=ON';
// Windows default. See file header: 1024 and 128 both failed, for
// opposite reasons. 250 hashes C_/Users/… and still fits the hash.
const CMAKE_OBJMAX_VALUE = '250';
const CMAKE_OBJMAX = `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJMAX_VALUE}`;
const CMAKE_OBJMAX_SET = `set(CMAKE_OBJECT_PATH_MAX ${CMAKE_OBJMAX_VALUE} CACHE STRING "" FORCE)`;

const NATIVE_LIBS = [
  { name: 'react-native-reanimated', files: ['CMakeLists.txt', 'build.gradle.kts'] },
  { name: 'react-native-worklets', files: ['CMakeLists.txt', 'build.gradle.kts'] },
];

function findNodeModulesCandidates(startDir) {
  const found = [];
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) found.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

function detectEOL(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function cmakeFixBlock(eol) {
  return [
    `# ${MARKER}`,
    `# Windows+ninja: glob-verify phonies loop, and object paths`,
    `# must stay under MAX_PATH (260). This block MUST sit before project()`,
    `# because that is when the generator reads CMAKE_OBJECT_PATH_MAX.`,
    `# 1024: no hash, mkdir C_/Users/... failed.`,
    `# 128: hash did not fit, CMake fell back to the long path, same mkdir.`,
    `# 250: Windows default — long paths hash, hashed paths still fit.`,
    CMAKE_OBJMAX_SET,
    `set(CMAKE_SUPPRESS_REGENERATION ON)`,
    `# <<< with-windows-cmake`,
  ].join(eol);
}

function relativeSourcesBlock(eol) {
  return [
    `# ${REL_MARKER}`,
    `# Absolute glob results become C_/Users/... object dirs on Windows;`,
    `# ninja mkdir then fails past MAX_PATH (260). Relativize so objects`,
    `# land under CMakeFiles/<tgt>.dir/__/Common/cpp/... which stays short.`,
    'foreach(_pt_var IN ITEMS',
    '    WORKLETS_COMMON_CPP_SOURCES WORKLETS_ANDROID_CPP_SOURCES',
    '    REANIMATED_COMMON_CPP_SOURCES REANIMATED_ANDROID_CPP_SOURCES',
    '    REANIMATED_NATIVEVIEW_CPP_SOURCES)',
    '  if(DEFINED ${_pt_var})',
    '    set(_pt_rel "")',
    '    foreach(_pt_src IN LISTS ${_pt_var})',
    '      if(IS_ABSOLUTE "${_pt_src}")',
    '        file(RELATIVE_PATH _pt_src "${CMAKE_CURRENT_SOURCE_DIR}" "${_pt_src}")',
    '      endif()',
    '      list(APPEND _pt_rel "${_pt_src}")',
    '    endforeach()',
    '    set(${_pt_var} "${_pt_rel}")',
    '  endif()',
    'endforeach()',
    '# <<< with-windows-cmake-relsrc',
  ].join(eol);
}

/**
 * Drop a previously injected header (any 1024/128/250 generation) so a
 * fresh one can be prepended in front of project(). Does not touch the
 * relative-sources block (different marker).
 */
function stripOldHeaderBlock(contents) {
  return contents.replace(
    /# >>> with-windows-cmake(?!-relsrc)[^\n]*\r?\n[\s\S]*?# <<< with-windows-cmake(?!-relsrc)\r?\n(?:\r?\n)?/,
    ''
  );
}

function hasHeaderBlock(contents) {
  return /# >>> with-windows-cmake(?!-relsrc)/.test(contents);
}

/**
 * Pure string transform of a library CMakeLists.txt.
 * @returns {{ contents: string, changed: boolean }}
 */
function patchCMakeListsText(contents) {
  const eol = detectEOL(contents);
  let next = contents;

  next = next.replace(/(file\s*\(\s*GLOB[_A-Z]*\s+\S+)\s+CONFIGURE_DEPENDS\b/g, '$1');
  next = stripOldHeaderBlock(next);

  if (!hasHeaderBlock(next)) {
    next = cmakeFixBlock(eol) + eol + eol + next.replace(/^\uFEFF/, '');
  }

  if (!next.includes(REL_MARKER)) {
    const addLib = /^add_library\s*\(/m;
    if (addLib.test(next)) {
      next = next.replace(addLib, `${relativeSourcesBlock(eol)}${eol}${eol}add_library(`);
    }
  }

  return { contents: next, changed: next !== contents };
}

/**
 * Pure string transform of a library android/build.gradle.kts.
 * Inserts the two -D cmake flags into the first arguments() block
 * (defaultConfig), using that block's own indentation.
 * @returns {{ contents: string, changed: boolean, missing: boolean }}
 */
function patchGradleKtsText(contents) {
  // Migrate a previously-injected 1024/128 without duplicating the flag.
  let next = contents.replace(/-DCMAKE_OBJECT_PATH_MAX=\d+/g, `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJMAX_VALUE}`);
  if (next.includes(CMAKE_SUPPRESS) && next.includes(CMAKE_OBJMAX)) {
    return { contents: next, changed: next !== contents, missing: false };
  }
  const needle = '"-DANDROID_STL=c++_shared"';
  const idx = next.indexOf(needle);
  if (idx === -1) {
    return { contents: next, changed: next !== contents, missing: true };
  }
  const lineStart = next.lastIndexOf('\n', idx) + 1;
  const indent = next.slice(lineStart, idx);
  const eol = detectEOL(next);
  const insert = `${indent}${JSON.stringify(CMAKE_SUPPRESS)},${eol}${indent}${JSON.stringify(CMAKE_OBJMAX)},${eol}`;
  next = next.slice(0, lineStart) + insert + next.slice(lineStart);
  return { contents: next, changed: next !== contents, missing: false };
}

function writeIfChanged(filePath, original, next, label) {
  if (next === original) {
    console.log(`${TAG} ok: ${label} already patched (${filePath})`);
    return 'already';
  }
  fs.writeFileSync(filePath, next);
  console.log(`${TAG} patched ${label} (${filePath})`);
  return 'patched';
}

function findLibAndroidDir(candidates, libName) {
  for (const nm of candidates) {
    const dir = path.join(nm, libName, 'android');
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/**
 * Patch reanimated + worklets CMake/Gradle under every node_modules above
 * startDir (npm workspaces hoist to the repo root).
 *
 * @param {string} startDir e.g. the mobile/ workspace root
 * @returns {{ ok: boolean, patched: number, alreadyOk: number, missing: string[] }}
 */
function patchWindowsCmake(startDir) {
  const candidates = findNodeModulesCandidates(startDir);
  const result = { ok: true, patched: 0, alreadyOk: 0, missing: [] };
  if (candidates.length === 0) {
    console.warn(`${TAG} skip: no node_modules found above ${startDir}`);
    result.ok = false;
    result.missing.push('node_modules');
    return result;
  }
  console.log(`${TAG} scanning: ${candidates.join(' -> ')}`);

  for (const lib of NATIVE_LIBS) {
    const androidDir = findLibAndroidDir(candidates, lib.name);
    if (!androidDir) {
      console.warn(`${TAG} skip: ${lib.name}/android not installed`);
      result.ok = false;
      result.missing.push(lib.name);
      continue;
    }

    const cmakeFile = path.join(androidDir, 'CMakeLists.txt');
    if (!fs.existsSync(cmakeFile)) {
      console.warn(`${TAG} skip: ${lib.name} CMakeLists.txt not found at ${cmakeFile}`);
      result.ok = false;
      result.missing.push(lib.name + '/CMakeLists.txt');
    } else {
      const original = fs.readFileSync(cmakeFile, 'utf8');
      const { contents } = patchCMakeListsText(original);
      const status = writeIfChanged(cmakeFile, original, contents, lib.name + '/CMakeLists.txt');
      if (status === 'patched') result.patched += 1;
      else result.alreadyOk += 1;
    }

    const ktsFile = path.join(androidDir, 'build.gradle.kts');
    if (!fs.existsSync(ktsFile)) {
      console.warn(`${TAG} skip: ${lib.name} build.gradle.kts not found at ${ktsFile}`);
      result.ok = false;
      result.missing.push(lib.name + '/build.gradle.kts');
    } else {
      const original = fs.readFileSync(ktsFile, 'utf8');
      const patched = patchGradleKtsText(original);
      if (patched.missing) {
        console.warn(
          `${TAG} WARNING: ${lib.name}/build.gradle.kts has no -DANDROID_STL cmake argument ` +
            `to anchor on — cmake -D flags not injected. CMakeLists patch still applies.`
        );
        result.alreadyOk += 1;
      } else {
        const status = writeIfChanged(ktsFile, original, patched.contents, lib.name + '/build.gradle.kts');
        if (status === 'patched') result.patched += 1;
        else result.alreadyOk += 1;
      }
    }
  }

  if (result.patched > 0) {
    console.log(
      `${TAG} applied Windows ninja fix to ${result.patched} file(s). ` +
        `Wipe stale .cxx caches (npm run clean:native) before the next assembleRelease.`
    );
  }
  return result;
}

module.exports = {
  patchWindowsCmake,
  patchCMakeListsText,
  patchGradleKtsText,
  TAG,
  NATIVE_LIBS,
  CMAKE_SUPPRESS,
  CMAKE_OBJMAX,
  CMAKE_OBJMAX_VALUE,
  CMAKE_OBJMAX_SET,
  MARKER,
  REL_MARKER,
};

if (require.main === module) {
  const ok = patchWindowsCmake(path.join(__dirname, '..')).ok;
  if (!ok) process.exitCode = 1;
}
