#!/usr/bin/env node
'use strict';

/**
 * Windows CMake/ninja fix for react-native-reanimated + react-native-worklets.
 *
 * Symptoms (assembleRelease on Windows):
 *
 *   1. Task :react-native-reanimated:buildCMakeRelWithDebInfo[arm64-v8a][reanimated] FAILED
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
 * then gives up. This is a CMake+Ninja+Windows toolchain loop, not an app
 * bug. CMake issue #21106 / ninja "still dirty after 100 tries".
 *
 * Root cause (2): worklets (and reanimated) glob sources under an absolute
 * path (`${CMAKE_SOURCE_DIR}/../Common/cpp`). CMake encodes `C:\Users\…` as
 * `C_/Users/…` inside the object-file directory. A high CMAKE_OBJECT_PATH_MAX
 * (1024) disables CMake's hash-shortening, so ninja tries to mkdir a path
 * that exceeds Windows MAX_PATH (260) and fails. CMake 3.22.1's ninja (the
 * Android SDK default) does not use the `\\?\` long-path prefix. The Windows
 * default CMAKE_OBJECT_PATH_MAX is 250 for this reason — keep it LOW so
 * CMake hashes `C_/Users/…` down to a short directory name.
 *
 * Fix (idempotent, version-tolerant string surgery on the two libraries):
 *   1. Strip CONFIGURE_DEPENDS from the GLOB_RECURSE calls — the source
 *      list of a third-party library does not change during a Gradle build.
 *   2. set(CMAKE_SUPPRESS_REGENERATION ON) so ninja never gets a RERUN_CMAKE
 *      rule (belt-and-suspenders for any other restat loop).
 *   3. set(CMAKE_OBJECT_PATH_MAX 128) so CMake hash-shortens object paths
 *      well before Windows MAX_PATH. (A previous 1024 value caused symptom 2.)
 *   4. Pass the same two -D flags through each library's Gradle cmake
 *      arguments() so they apply even if CMakeLists is later restored.
 *
 * Runs in THREE places so the flow is order-proof:
 *   1. npm postinstall of @performance-tracker/mobile
 *   2. every prebuild, via plugins/with-windows-cmake.js
 *   3. npm run clean:native — the documented repair for this exact error,
 *      so `git pull` + clean:native + assembleRelease is enough; prebuild
 *      is NOT required for the CMakeLists patch to take effect.
 *
 * Does not change app JS, native UX, or Gradle/AGP versions.
 */

const fs = require('fs');
const path = require('path');

const TAG = '[with-windows-cmake]';
const MARKER = '>>> with-windows-cmake';
const CMAKE_SUPPRESS = '-DCMAKE_SUPPRESS_REGENERATION=ON';
// Low on purpose — 1024 disabled hashing and blew past Windows MAX_PATH.
const CMAKE_OBJMAX_VALUE = '128';
const CMAKE_OBJMAX = `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJMAX_VALUE}`;
const CMAKE_OBJMAX_SET = `set(CMAKE_OBJECT_PATH_MAX ${CMAKE_OBJMAX_VALUE})`;

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
    `# Windows+ninja: a CMake glob-verify phony with no inputs is always dirty,`,
    `# so ninja re-runs CMake 100 times and fails with`,
    `# "manifest 'build.ninja' still dirty after 100 tries".`,
    `set(CMAKE_SUPPRESS_REGENERATION ON)`,
    `# Keep object paths short. A high limit (1024) disabled hashing and made`,
    `# ninja fail with mkdir(CMakeFiles/…/C_/Users/…/Common): No such file`,
    `# or directory — the encoded absolute source path exceeds MAX_PATH (260).`,
    CMAKE_OBJMAX_SET,
    `# <<< with-windows-cmake`,
  ].join(eol);
}

/**
 * Pure string transform of a library CMakeLists.txt.
 * @returns {{ contents: string, changed: boolean }}
 */
function patchCMakeListsText(contents) {
  const globDepends = /\bfile\s*\(\s*GLOB[_A-Z]*\s+\S+\s+CONFIGURE_DEPENDS\b/;
  const eol = detectEOL(contents);
  let next = contents;
  // Only strip the keyword from file(GLOB[_RECURSE] VAR CONFIGURE_DEPENDS …)
  // — never from comments or other text.
  next = next.replace(/(file\s*\(\s*GLOB[_A-Z]*\s+\S+)\s+CONFIGURE_DEPENDS\b/g, '$1');

  // Migrate a previously-injected high limit (1024 disabled hashing).
  next = next.replace(/set\(CMAKE_OBJECT_PATH_MAX\s+\d+\)/g, CMAKE_OBJMAX_SET);

  if (next.includes(MARKER) && !globDepends.test(next) && next.includes(CMAKE_OBJMAX_SET)) {
    return { contents: next, changed: next !== contents };
  }

  if (!next.includes(MARKER)) {
    const block = cmakeFixBlock(eol);
    const req = /^(cmake_minimum_required\([^)]*\))[ \t]*\r?$/m;
    if (req.test(next)) {
      next = next.replace(req, `$1${eol}${eol}${block}`);
    } else {
      next = block + eol + eol + next;
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
  // Migrate a previously-injected high limit without duplicating the flag.
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
};

if (require.main === module) {
  const ok = patchWindowsCmake(path.join(__dirname, '..')).ok;
  if (!ok) process.exitCode = 1;
}
