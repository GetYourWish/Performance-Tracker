/**
 * Local Expo config plugin: make expo's Gradle plugin builds compile under
 * Gradle 9.4.1 (required by the Android Gradle Plugin in the RN 0.87 template).
 *
 * Why: Gradle 9.4.1 ships kotlin-stdlib 2.3.0 on its own classpath. Expo's
 * included Gradle builds pin Kotlin Gradle Plugin 2.1.20, whose compiler can
 * only read Kotlin metadata up to 2.2.0, so every `compileKotlin` of those
 * plugins fails with:
 *
 *   e: ... Module was compiled with an incompatible version of Kotlin.
 *   The binary version of its metadata is 2.3.0, expected version is 2.1.0.
 *
 * (Kotlin 2.1.20 also exposes the removed `kotlinOptions` DSL as an
 * error-level deprecation when the classpath bumps, so the one build script
 * still using it is migrated to `compilerOptions`.)
 *
 * No upstream release fixes this yet (expo-modules-autolinking 57.0.12 is the
 * latest and pins 2.1.20), so this mod patches the pinned versions inside
 * node_modules during prebuild. `npm install` restores the original files,
 * but prebuild re-applies the patch — so the flow `npm install` ->
 * `npm run prebuild` -> `gradlew assembleDebug` is always correct.
 *
 * Idempotent: versions >= 2.2.0 (i.e. compilers that can read Kotlin 2.3
 * metadata) are left untouched, so this becomes a no-op once Expo pins a
 * compatible Kotlin.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KGP_MIN = [2, 2, 0]; // compilers >= 2.2.0 read Kotlin 2.3.0 metadata
const KGP_TARGET = '2.3.0';

function findNodeModules(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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

function patchFile(label, filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.warn(
      `[with-expo-gradle-kotlin] skip: ${label} not found at ${filePath} ` +
        '(upstream layout may have changed — patch may be obsolete)'
    );
    return;
  }
  let contents = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const { pattern, to, test } of replacements) {
    if (test.test(contents)) {
      contents = contents.replace(pattern, to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, contents);
  }
}

/** Replace `kotlin("jvm") version "X"` (optionally ` apply false`) when X < 2.2.0 */
function patchKgpVersion(filePath, applyFalse) {
  const re = new RegExp(
    'kotlin\\("jvm"\\) version "(\\d+\\.\\d+\\.\\d+)"' +
      (applyFalse ? '(?= apply false)' : '')
  );
  patchFile(filePath, filePath, [
    {
      test: re,
      pattern: re,
      to: (match, version) =>
        isOlderThan(version, KGP_MIN)
          ? `kotlin("jvm") version "${KGP_TARGET}"`
          : match,
    },
  ]);
}

function withExpoGradleKotlin(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const nodeModules = findNodeModules(config.modRequest.projectRoot);
      if (!nodeModules) {
        console.warn(
          '[with-expo-gradle-kotlin] skip: node_modules not found above ' +
            config.modRequest.projectRoot
        );
        return config;
      }

      // 1) expo-modules-autolinking/android/expo-gradle-plugin (included build)
      const autolinkingPlugin = path.join(
        nodeModules,
        'expo-modules-autolinking',
        'android',
        'expo-gradle-plugin'
      );
      patchKgpVersion(path.join(autolinkingPlugin, 'build.gradle.kts'), true);

      // 1b) its shared subproject: serialization plugin version + removed DSL
      const sharedBuild = path.join(
        autolinkingPlugin,
        'expo-autolinking-plugin-shared',
        'build.gradle.kts'
      );
      patchFile('expo-autolinking-plugin-shared build.gradle.kts', sharedBuild, [
        {
          test: /kotlin\("plugin\.serialization"\) version "(\d+\.\d+\.\d+)"/,
          pattern: /kotlin\("plugin\.serialization"\) version "(\d+\.\d+\.\d+)"/,
          to: (match, version) =>
            isOlderThan(version, KGP_MIN)
              ? `kotlin("plugin.serialization") version "${KGP_TARGET}"`
              : match,
        },
        {
          test: /kotlinOptions \{[\s\S]*?jvmTarget = JavaVersion\.VERSION_\d+\.toString\(\)[\s\S]*?\}/,
          pattern: /(tasks\.withType<KotlinCompile> \{\n)(\s*)kotlinOptions \{\n\s*jvmTarget = (JavaVersion\.VERSION_\d+)\.toString\(\)\n\s*\}\n(\s*\})/,
          to: (match, head, indent, version, tail) =>
            `${head}${indent}compilerOptions {\n${indent}  jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.${version.replace('JavaVersion.VERSION_', 'JVM_')})\n${indent}}\n${tail}`,
        },
      ]);

      // 2) expo-modules-core/expo-module-gradle-plugin (included build)
      patchKgpVersion(
        path.join(
          nodeModules,
          'expo-modules-core',
          'expo-module-gradle-plugin',
          'build.gradle.kts'
        ),
        false
      );

      return config;
    },
  ]);
}

module.exports = withExpoGradleKotlin;
