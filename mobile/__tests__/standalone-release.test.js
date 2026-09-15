// Unit tests for mobile/plugins/with-standalone-release.js
//
// The plugin makes the standalone-APK path foolproof:
//   1. debug buildType gets versionNameSuffix "-debug" so debug and release
//      builds are distinguishable on the device,
//   2. a verifyStandaloneApk Gradle task is appended and wired to
//      assembleRelease.finalizedBy — a release APK without the embedded
//      assets/index.android.bundle fails the build instead of showing RN's
//      "Unable to load script" red screen on the phone.
//
// The Gradle surgery is pure string work, so it is tested directly.

const { patchAppBuildGradle, composeVerifyBlock, TAG } = require('../plugins/with-standalone-release')

// Excerpt of the Expo SDK 57 template's android/app/build.gradle (the parts
// the plugin touches), kept close to the real thing on purpose.
const TEMPLATE_EXCERPT = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
}

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`

describe('with-standalone-release plugin', () => {
  describe('patchAppBuildGradle on a fresh template', () => {
    let patched
    beforeEach(() => {
      patched = patchAppBuildGradle(TEMPLATE_EXCERPT)
    })

    test('injects versionNameSuffix into the DEBUG buildType only', () => {
      const { contents } = patched
      // exactly one suffix, inside the debug block, before the release block
      const occurrences = contents.split('versionNameSuffix "-debug"').length - 1
      expect(occurrences).toBe(1)

      const debugBlock = contents.slice(
        contents.indexOf('buildTypes {'),
        contents.indexOf('release {')
      )
      expect(debugBlock).toContain('versionNameSuffix "-debug"')
      expect(debugBlock).toContain('signingConfig signingConfigs.debug')
      // the release block itself is untouched
      const releaseBlock = contents.slice(contents.indexOf('release {'))
      expect(releaseBlock).not.toContain('versionNameSuffix')
    })

    test('appends the verifyStandaloneApk task wired to assembleRelease', () => {
      const { contents } = patched
      expect(contents).toContain('tasks.register("verifyStandaloneApk")')
      expect(contents).toMatch(
        /tasks\.matching \{ it\.name == "assembleRelease" \}\.configureEach \{ it\.finalizedBy "verifyStandaloneApk" \}/
      )
    })

    test('verify task checks the right APK entry with the right threshold', () => {
      const { contents } = patched
      expect(contents).toContain('outputs/apk/release/app-release.apk')
      expect(contents).toContain('apk.getEntry("assets/index.android.bundle")')
      expect(contents).toContain('bundleMinBytes = 1000000L')
      expect(contents).toContain('GradleException')
      expect(contents).toContain('gradlew clean assembleRelease')
    })

    test('is idempotent: patching an already-patched file changes nothing', () => {
      const once = patchAppBuildGradle(TEMPLATE_EXCERPT).contents
      const twice = patchAppBuildGradle(once).contents
      expect(twice).toBe(once)
      expect(twice.split('versionNameSuffix "-debug"').length - 1).toBe(1)
      expect((twice.match(/verifyStandaloneApk/g) || []).length).toBe(
        (once.match(/verifyStandaloneApk/g) || []).length
      )
    })
  })

  describe('upstream template drift (self-disabling guards)', () => {
    test('a pre-existing versionNameSuffix is never duplicated', () => {
      const modified = TEMPLATE_EXCERPT.replace(
        'debug {\n            signingConfig',
        'debug {\n            versionNameSuffix "-custom"\n            signingConfig'
      )
      const { contents } = patchAppBuildGradle(modified)
      expect(contents).toContain('versionNameSuffix "-custom"')
      expect(contents).not.toContain('versionNameSuffix "-debug"')
      // the verify block is still appended
      expect(contents).toContain('tasks.register("verifyStandaloneApk")')
    })

    test('a template without a debug block still gets the verify task, no crash', () => {
      const noDebug = TEMPLATE_EXCERPT.replace(
        /    buildTypes \{\n        debug \{\n            signingConfig signingConfigs\.debug\n        \}\n/,
        ''
      )
      const { contents } = patchAppBuildGradle(noDebug)
      expect(contents).not.toContain('versionNameSuffix')
      expect(contents).toContain('tasks.register("verifyStandaloneApk")')
    })
  })

  describe('composeVerifyBlock', () => {
    test('is marker-delimited so prebuild re-runs are no-ops', () => {
      const block = composeVerifyBlock()
      expect(block).toContain(TAG)
      expect(block.trimEnd().endsWith('// <<< with-standalone-release')).toBe(true)
      expect(block.startsWith('\n// >>> with-standalone-release')).toBe(true)
    })

    test('prints a success banner with the exact adb install command', () => {
      const block = composeVerifyBlock()
      expect(block).toContain('STANDALONE APK VERIFIED')
      expect(block).toContain('adb install -r')
      expect(block).toContain('standaloneApkFile.absolutePath')
    })
  })
})
