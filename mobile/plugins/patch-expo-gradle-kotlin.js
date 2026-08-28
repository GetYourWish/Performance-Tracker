#!/usr/bin/env node
'use strict';

/**
 * Patches Expo's pinned Kotlin Gradle Plugin (KGP) versions so Expo's included
 * Gradle builds compile under Gradle 9.4.1, which the Android Gradle Plugin in
 * the RN 0.87 template requires (see plugins/with-gradle-version.js).
 *
 * Why: Gradle 9.4.1 ships kotlin-stdlib 2.3.0 on its own classpath. Expo's
 * included Gradle builds pin KGP 2.1.20, whose compiler only reads Kotlin
 * metadata up to 2.2.0, so every compileKotlin of those plugins fails with:
 *
 *   e: Incompatible classes were found in dependencies. Remove them from the
 *   classpath or use '-Xskip-metadata-version-check' to suppress errors
 *
 * No upstream release fixes this yet (expo-modules-autolinking 57.0.12 is the
 * latest and pins 2.1.20), so the pinned versions inside node_modules are
 * patched in place.
 *
 * Runs in TWO places so the flow is order-proof:
 *   1. npm postinstall of @performance-tracker/mobile — `npm install` restores
 *      pristine files, this immediately re-applies the patch
 *   2. every prebuild, via plugins/with-expo-gradle-kotlin.js
 *
 * Every decision is logged with the [with-expo-gradle-kotlin] tag so build
 * output always shows whether and where the patch was applied.
 *
 * Idempotent and version-gated: pins >= 2.2.0 (compilers that can read Kotlin
 * 2.3 metadata) are left untouched, so this becomes a no-op once Expo pins a
 * compatible Kotlin.
 */

const fs = require('fs');
const path = require('path');

const TAG = '[with-expo-gradle-kotlin]';
const KGP_MIN = [2, 2, 0]; // compilers >= 2.2.0 read Kotlin 2.3.0 metadata
const KGP_TARGET = '2.3.0';

/**
 * Every existing node_modules from startDir upward (up to 5 levels).
 * npm workspaces hoist to the repo root, but a stray nested
 * <workspace>/node_modules must not make us stop looking too early.
 */
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

function parseVersion(version) {
  return version.split('.').map((n) => parseInt(n, 10) || 0);
}

function isOlderThan(version, min) {
  const v = parseVersion(version);
  for (let i = 0; i < min.length; i++) {
    if ((v[i] || 0) !== min[i]) return (v[i] || 0) < min[i];
  }
  return false;
}

/**
 * Patch every `kotlin("<plugin>") version "X"` occurrence whose X < KGP_MIN.
 * Returns updated contents, the unchanged contents (nothing to do), or null
 * after printing a loud warning when the expected pin is absent.
 */
function replaceVersionPin(contents, pluginId, label, filePath) {
  const re = new RegExp(
    'kotlin\\("' + pluginId.replace(/\./g, '\\.') + '"\\) version "(\\d+\\.\\d+\\.\\d+)"',
    'g'
  );
  const matches = Array.from(contents.matchAll(re));
  if (matches.length === 0) {
    console.warn(
      `${TAG} WARNING: ${label} exists but has no kotlin("${pluginId}") version pin — ` +
        `upstream layout changed, patch NOT applied (${filePath}). ` +
        `If the Gradle build then fails with "Incompatible classes were found in dependencies", ` +
        `plugins/patch-expo-gradle-kotlin.js needs an update.`
    );
    return null;
  }
  let out = contents;
  for (const m of matches) {
    if (isOlderThan(m[1], KGP_MIN)) {
      out = out.split(m[0]).join(`kotlin("${pluginId}") version "${KGP_TARGET}"`);
      console.log(`${TAG} patched ${label}: kotlin("${pluginId}") ${m[1]} -> ${KGP_TARGET}`);
    } else {
      console.log(
        `${TAG} ok: ${label} kotlin("${pluginId}") ${m[1]} ` +
          `(reads Kotlin 2.3 metadata, no patch needed)`
      );
    }
  }
  return out;
}

/**
 * Kotlin >= 2.2 removed the `kotlinOptions {}` DSL (error-level deprecation on
 * this classpath), so the one build script still using it is migrated to
 * `compilerOptions {}` / JvmTarget. Returns updated contents, unchanged
 * contents (already migrated), or null after a loud warning.
 */
function patchKotlinOptionsDsl(contents, label, filePath) {
  if (!/kotlinOptions/.test(contents)) {
    console.log(`${TAG} ok: ${label} uses compilerOptions (kotlinOptions migration not needed)`);
    return contents;
  }
  const re =
    /(tasks\.withType<KotlinCompile> \{\n)(\s*)kotlinOptions \{\n\s*jvmTarget = (JavaVersion\.VERSION_\d+)\.toString\(\)\n\s*\}\n(\s*\})/;
  const m = contents.match(re);
  if (!m) {
    console.warn(
      `${TAG} WARNING: ${label} still uses the removed "kotlinOptions" DSL but did not match ` +
        `the expected shape — migration NOT applied (${filePath}). ` +
        `The Gradle build will fail until plugins/patch-expo-gradle-kotlin.js is updated.`
    );
    return null;
  }
  const jvmTarget = m[3].replace('JavaVersion.VERSION_', 'JVM_');
  console.log(`${TAG} patched ${label}: kotlinOptions -> compilerOptions (JvmTarget.${jvmTarget})`);
  return contents.replace(
    re,
    (match, head, indent, version, tail) =>
      `${head}${indent}compilerOptions {\n` +
      `${indent}  jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.${jvmTarget})\n` +
      `${indent}}\n${tail}`
  );
}

/**
 * Apply patchFns to the target file in EVERY candidate node_modules that has
 * it (patching all copies avoids guessing which copy the Gradle build will
 * resolve). Returns false when the file was not found anywhere.
 */
function patchTarget(nodeModulesList, targetSegments, label, patchFns) {
  let found = false;
  for (const nm of nodeModulesList) {
    const filePath = path.join(nm, ...targetSegments);
    if (!fs.existsSync(filePath)) continue;
    found = true;
    const original = fs.readFileSync(filePath, 'utf8');
    let contents = original;
    for (const patchFn of patchFns) {
      const result = patchFn(contents, label, filePath);
      if (result === null) return false; // loud warning already printed
      contents = result;
    }
    if (contents !== original) fs.writeFileSync(filePath, contents);
  }
  if (!found) {
    console.warn(
      `${TAG} WARNING: ${label} not found in any node_modules above the project:\n` +
        nodeModulesList.map((nm) => `${TAG}   tried ${path.join(nm, ...targetSegments)}`).join('\n') +
        `\n${TAG} WARNING: without this patch the Gradle build fails with ` +
        `"Incompatible classes were found in dependencies". If upstream moved this file, ` +
        `plugins/patch-expo-gradle-kotlin.js needs an update.`
    );
  }
  return found;
}

/**
 * Patch the Kotlin pins inside expo's included Gradle builds.
 * @param {string} startDir project directory to walk up from (e.g. mobile/)
 * @returns {boolean} true when every target file was found (patched or already ok)
 */
function patchExpoGradleKotlin(startDir) {
  const candidates = findNodeModulesCandidates(startDir);
  if (candidates.length === 0) {
    console.warn(`${TAG} skip: no node_modules found above ${startDir} (nothing to patch)`);
    return false;
  }
  console.log(`${TAG} scanning: ${candidates.join(' -> ')}`);

  const autolinking = ['expo-modules-autolinking', 'android', 'expo-gradle-plugin'];

  let allFound = true;
  allFound =
    patchTarget(candidates, [...autolinking, 'build.gradle.kts'], 'expo-gradle-plugin/build.gradle.kts', [
      (c, l, f) => replaceVersionPin(c, 'jvm', l, f),
    ]) && allFound;

  allFound =
    patchTarget(
      candidates,
      [...autolinking, 'expo-autolinking-plugin-shared', 'build.gradle.kts'],
      'expo-autolinking-plugin-shared/build.gradle.kts',
      [
        (c, l, f) => replaceVersionPin(c, 'plugin.serialization', l, f),
        patchKotlinOptionsDsl,
      ]
    ) && allFound;

  allFound =
    patchTarget(
      candidates,
      ['expo-modules-core', 'expo-module-gradle-plugin', 'build.gradle.kts'],
      'expo-module-gradle-plugin/build.gradle.kts',
      [(c, l, f) => replaceVersionPin(c, 'jvm', l, f)]
    ) && allFound;

  return allFound;
}

module.exports = { patchExpoGradleKotlin };

if (require.main === module) {
  // Run as `node plugins/patch-expo-gradle-kotlin.js` (mobile postinstall).
  // Walk up from mobile/ so both workspace-root and nested node_modules are scanned.
  const ok = patchExpoGradleKotlin(path.join(__dirname, '..'));
  if (!ok) {
    process.exitCode = 1; // make the drift impossible to miss during npm install
  }
}
