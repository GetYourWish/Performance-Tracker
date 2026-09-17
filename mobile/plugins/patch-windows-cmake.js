#!/usr/bin/env node
'use strict';

/**
 * Windows CMake/ninja fix for the RN New-Arch C++ build.
 *
 * Symptoms (assembleRelease on Windows):
 *
 *   1. Task :react-native-*:buildCMakeRelWithDebInfo FAILED
 *      ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 *   2. Task :react-native-worklets:buildCMakeRelWithDebInfo[worklets] FAILED
 *      ninja: error: mkdir(CMakeFiles/worklets.dir/C_/Users/…/Common)
 *
 *   3. Task :app:buildCMakeRelWithDebInfo[arm64-v8a] FAILED
 *      ninja: error: mkdir(safeareacontext_autolinked_build/CMakeFiles/
 *        react_codegen_safeareacontext.dir/C_/Users/…/react-native-safe-area-context)
 *
 * (1) file(GLOB_RECURSE … CONFIGURE_DEPENDS) emits a Ninja phony with no
 * inputs. On Windows it is always dirty, so ninja re-runs CMake 100 times.
 * CMake issue #21106.
 *
 * (2)(3) Globs (or codegen) feed CMake absolute Windows paths. CMake encodes
 * `C:\Users\…` as `C_/Users/…` in the object dir. The .cxx folder is already
 * ~130–180 chars, so mkdir exceeds MAX_PATH (260). CMake 3.22.1's ninja
 * (Android SDK default) does not use the `\\?\` long-path prefix.
 *
 * Symptom (3) is the APP cmake (New Arch autolinking), not the worklets
 * library cmake. RN points the app at
 *   react-native/ReactAndroid/cmake-utils/default-app-setup/CMakeLists.txt
 * which add_subdirectory's each autolinked codegen cmake (safe-area-context
 * lives at android/src/main/jni/CMakeLists.txt and globs common/cpp).
 *
 * CMAKE_OBJECT_PATH_MAX is a trap on this toolchain:
 *   - 1024: above the unhashed length → no hash → mkdir C_/Users/… fails.
 *   - 128: hashed path (~215) still >128 → CMake falls back to the long
 *     path → same mkdir. Observed as a new .cxx hash with the same error.
 *   - 250 (Windows default): long paths hash AND the hash fits. Backstop.
 *
 * Fix (idempotent string surgery):
 *   1. Strip CONFIGURE_DEPENDS from GLOB calls.
 *   2. set(CMAKE_SUPPRESS_REGENERATION ON).
 *   3. set(CMAKE_OBJECT_PATH_MAX 250 CACHE STRING "" FORCE) BEFORE project().
 *   4. Relativize globbed *_SRCS / *_SOURCES before add_library so object
 *      dirs are __/common/cpp/… not C_/Users/….
 *   5. Apply (3) to the app cmake (default-app-setup) and pass the -D flags
 *      through app/build.gradle so autolinked codegen inherits them.
 *
 * Runs in THREE places: npm postinstall, prebuild, npm run clean:native.
 * Does not change app JS, native UX, or Gradle/AGP versions.
 */

const fs = require('fs');
const path = require('path');

const TAG = '[with-windows-cmake]';
const MARKER = '>>> with-windows-cmake';
const REL_MARKER = '>>> with-windows-cmake-relsrc';
const CMAKE_SUPPRESS = '-DCMAKE_SUPPRESS_REGENERATION=ON';
const CMAKE_OBJMAX_VALUE = '250';
const CMAKE_OBJMAX = `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJMAX_VALUE}`;
const CMAKE_OBJMAX_SET = `set(CMAKE_OBJECT_PATH_MAX ${CMAKE_OBJMAX_VALUE} CACHE STRING "" FORCE)`;

const NATIVE_LIBS = [
  {
    name: 'react-native-reanimated',
    cmakeRel: path.join('android', 'CMakeLists.txt'),
    gradleRel: path.join('android', 'build.gradle.kts'),
  },
  {
    name: 'react-native-worklets',
    cmakeRel: path.join('android', 'CMakeLists.txt'),
    gradleRel: path.join('android', 'build.gradle.kts'),
  },
  {
    name: 'react-native-safe-area-context',
    cmakeRel: path.join('android', 'src', 'main', 'jni', 'CMakeLists.txt'),
    gradleRel: null,
  },
];

const APP_CMAKE_REL = path.join(
  'react-native',
  'ReactAndroid',
  'cmake-utils',
  'default-app-setup',
  'CMakeLists.txt'
);

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
    `# must stay under MAX_PATH (260). This block MUST sit at file start,`,
    `# because the native generator reads CMAKE_OBJECT_PATH_MAX at project().`,
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
    `# land under CMakeFiles/<tgt>.dir/__/common/cpp/... which stays short.`,
    'get_cmake_property(_pt_vars VARIABLES)',
    'foreach(_pt_var IN LISTS _pt_vars)',
    '  if(_pt_var MATCHES "(_CPP_SOURCES|_SRCS|_SOURCES)$")',
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

function stripOldHeaderBlock(contents) {
  return contents.replace(
    /# >>> with-windows-cmake(?!-relsrc)[^\n]*\r?\n[\s\S]*?# <<< with-windows-cmake(?!-relsrc)\r?\n(?:\r?\n)?/,
    ''
  );
}

function stripOldRelsrcBlock(contents) {
  return contents.replace(
    /# >>> with-windows-cmake-relsrc[^\n]*\r?\n[\s\S]*?# <<< with-windows-cmake-relsrc\r?\n(?:\r?\n)?/,
    ''
  );
}

function hasHeaderBlock(contents) {
  return /# >>> with-windows-cmake(?!-relsrc)/.test(contents);
}

/**
 * Pure string transform of a library / app CMakeLists.txt.
 * @returns {{ contents: string, changed: boolean }}
 */
function patchCMakeListsText(contents) {
  const eol = detectEOL(contents);
  let next = contents;

  next = next.replace(/(file\s*\(\s*GLOB[_A-Z]*\s+\S+)\s+CONFIGURE_DEPENDS\b/g, '$1');
  next = stripOldHeaderBlock(next);
  next = stripOldRelsrcBlock(next);

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
 * @returns {{ contents: string, changed: boolean, missing: boolean }}
 */
function patchGradleKtsText(contents) {
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

/**
 * Inject cmake -D flags into the app's Groovy build.gradle so the New Arch
 * app cmake (safeareacontext_autolinked_build etc.) inherits them.
 * @returns {{ contents: string, changed: boolean, missing: boolean }}
 */
function patchAppBuildGradleText(contents) {
  let next = contents.replace(/-DCMAKE_OBJECT_PATH_MAX=\d+/g, `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJMAX_VALUE}`);
  if (next.includes(`"${CMAKE_OBJMAX}"`) && next.includes(`"${CMAKE_SUPPRESS}"`)) {
    return { contents: next, changed: next !== contents, missing: false };
  }
  const androidOpen = next.search(/^android\s*\{/m);
  if (androidOpen === -1) {
    return { contents: next, changed: next !== contents, missing: true };
  }
  const brace = next.indexOf('{', androidOpen);
  const eol = detectEOL(next);
  const insert = [
    '',
    `    // ${MARKER}`,
    '    defaultConfig {',
    '        externalNativeBuild {',
    '            cmake {',
    `                arguments "${CMAKE_OBJMAX}", "${CMAKE_SUPPRESS}"`,
    '            }',
    '        }',
    '    }',
    '    // <<< with-windows-cmake',
    '',
  ].join(eol);
  next = next.slice(0, brace + 1) + insert + next.slice(brace + 1);
  return { contents: next, changed: true, missing: false };
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

function findInNodeModules(candidates, relParts) {
  for (const nm of candidates) {
    const filePath = path.join(nm, ...relParts);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function recordStatus(result, status) {
  if (status === 'patched') result.patched += 1;
  else result.alreadyOk += 1;
}

/**
 * Patch reanimated / worklets / safe-area-context CMake, the RN app cmake,
 * and app/build.gradle (when prebuild has produced android/).
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
    const cmakeFile = findInNodeModules(candidates, [lib.name, lib.cmakeRel]);
    if (!cmakeFile) {
      console.warn(`${TAG} skip: ${lib.name} CMakeLists.txt not found`);
      result.ok = false;
      result.missing.push(lib.name + '/CMakeLists.txt');
    } else {
      const original = fs.readFileSync(cmakeFile, 'utf8');
      const { contents } = patchCMakeListsText(original);
      recordStatus(result, writeIfChanged(cmakeFile, original, contents, lib.name + '/CMakeLists.txt'));
    }

    if (!lib.gradleRel) continue;
    const ktsFile = findInNodeModules(candidates, [lib.name, lib.gradleRel]);
    if (!ktsFile) {
      console.warn(`${TAG} skip: ${lib.name} ${lib.gradleRel} not found`);
      result.ok = false;
      result.missing.push(lib.name + '/' + lib.gradleRel);
    } else {
      const original = fs.readFileSync(ktsFile, 'utf8');
      const patched = patchGradleKtsText(original);
      if (patched.missing) {
        console.warn(
          `${TAG} WARNING: ${lib.name} gradle has no -DANDROID_STL cmake argument ` +
            `to anchor on — cmake -D flags not injected. CMakeLists patch still applies.`
        );
        result.alreadyOk += 1;
      } else {
        recordStatus(
          result,
          writeIfChanged(ktsFile, original, patched.contents, lib.name + '/build.gradle.kts')
        );
      }
    }
  }

  const appCmake = findInNodeModules(candidates, APP_CMAKE_REL.split(path.sep));
  if (!appCmake) {
    console.warn(
      `${TAG} skip: react-native default-app-setup/CMakeLists.txt not found — ` +
        `:app:buildCMakeRelWithDebInfo may still mkdir C_/Users/... for codegen`
    );
  } else {
    const original = fs.readFileSync(appCmake, 'utf8');
    const { contents } = patchCMakeListsText(original);
    recordStatus(result, writeIfChanged(appCmake, original, contents, 'react-native/default-app-setup/CMakeLists.txt'));
  }

  const appGradle = path.join(startDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(appGradle)) {
    const original = fs.readFileSync(appGradle, 'utf8');
    const patched = patchAppBuildGradleText(original);
    if (patched.missing) {
      console.warn(`${TAG} WARNING: ${appGradle} has no android { } block to inject cmake arguments`);
    } else {
      recordStatus(result, writeIfChanged(appGradle, original, patched.contents, 'android/app/build.gradle'));
    }
  } else {
    console.log(`${TAG} skip: ${appGradle} not generated yet (run prebuild first, or ignore if already generated)`);
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
  patchAppBuildGradleText,
  TAG,
  NATIVE_LIBS,
  APP_CMAKE_REL,
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
