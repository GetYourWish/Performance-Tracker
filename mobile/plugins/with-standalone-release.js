/**
 * Local Expo config plugin: make the standalone-APK path foolproof.
 *
 * Problem it solves (observed twice on 2026-09-15): the user installs a DEBUG
 * APK (or can't tell debug from release on the device) and sees React Native's
 * red "Unable to load script. Make sure you're running Metro or that your
 * bundle 'index.android.bundle' is packaged correctly for release" screen.
 *
 * Why that screen appears — verified against react-native 0.87.1 sources:
 *   - expo-modules ExpoReactHostFactory.kt builds the JS bundle loader as
 *     JSBundleLoader.createAssetLoader("assets://index.android.bundle") for
 *     EVERY build (debug included). On cold start the app therefore always
 *     tries to read the bundle from its own APK first.
 *   - @react-native/gradle-plugin TaskConfiguration.kt only registers
 *     `createBundle<Variant>JsAndAssets` for variants NOT listed in
 *     `debuggableVariants` (default: debug only). A debug APK ships with NO
 *     JS at all; the red screen is the expected result with no Metro running.
 *   - The message mentions Metro/localhost:8081 because those are the only
 *     other source RN knows about — it is boilerplate from the loader, NOT
 *     the app trying to sync. The app's own code (Syncthing folder sync)
 *     never even started, because its JS never loaded.
 *
 * Two changes, both applied to android/app/build.gradle at prebuild time
 * (mobile/android is generated output; this is the sanctioned way to change it):
 *
 *   1. `versionNameSuffix "-debug"` on the debug buildType — debug and release
 *      builds become distinguishable in Android Settings ("1.0.0-debug" vs
 *      "1.0.0") and via `adb shell dumpsys package <pkg>`.
 *
 *   2. A `verifyStandaloneApk` task wired with `assembleRelease.finalizedBy`.
 *      It opens app-release.apk as a zip and asserts that
 *      assets/index.android.bundle is present and at least 1 MB (the real
 *      Hermes bundle is ~2.8 MB). Success prints a loud banner with the exact
 *      install command; failure fails the build with a clear explanation —
 *      instead of a red screen on the phone minutes later.
 *
 * Idempotent: both edits are marker/version-guarded; re-running prebuild is a
 * no-op. Self-disabling: if the Expo template stops matching the expected
 * patterns, the plugin logs a warning and leaves the file untouched rather
 * than corrupting it.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TAG = '[with-standalone-release]';
const MARKER_OPEN = '// >>> with-standalone-release (mobile/plugins/with-standalone-release.js)';
const MARKER_CLOSE = '// <<< with-standalone-release';

/**
 * Build the Gradle block for the verifyStandaloneApk task. Pure string
 * function so it can be unit-tested without Gradle.
 *
 * The APK path is resolved at CONFIGURATION time (config-cache safe); the
 * task body only touches files and prints.
 */
function composeVerifyBlock() {
  return `
${MARKER_OPEN}
// Debug builds deliberately ship WITHOUT a JS bundle (they load their code live
// from Metro); only assembleRelease embeds assets/index.android.bundle. This
// task fails a bundle-less release build here — with a clear reason — instead
// of letting it show React Native's "Unable to load script" red screen on the
// device after install.
def standaloneApkFile = new File(layout.buildDirectory.get().asFile, "outputs/apk/release/app-release.apk")
tasks.register("verifyStandaloneApk") {
    doLast {
        if (!standaloneApkFile.exists()) {
            println "${TAG} app-release.apk not found (did assembleRelease fail earlier?) - nothing to verify."
            return
        }
        def bundleMinBytes = 1000000L // real Hermes bundles for this app are ~2.8 MB
        def apk
        try {
            apk = new java.util.zip.ZipFile(standaloneApkFile)
        } catch (java.util.zip.ZipException e) {
            throw new GradleException(
                "${TAG} " + standaloneApkFile.name + " is not a readable APK/zip (" + e.getMessage() + "). " +
                "The packaging step likely produced a corrupt file - run: gradlew clean assembleRelease"
            )
        }
        try {
            def entry = apk.getEntry("assets/index.android.bundle")
            if (entry == null) {
                throw new GradleException(
                    "${TAG} app-release.apk does NOT contain assets/index.android.bundle - it would show " +
                    "'Unable to load script' on the device. The release JS bundling task " +
                    "(createBundleReleaseJsAndAssets) did not run or was not merged into the APK. " +
                    "Run: gradlew clean assembleRelease"
                )
            }
            if (entry.getSize() < bundleMinBytes) {
                throw new GradleException(
                    "${TAG} assets/index.android.bundle is only " + entry.getSize() + " bytes - too small to be " +
                    "the real Hermes bundle. Run: gradlew clean assembleRelease"
                )
            }
            def bundleMb = String.format('%.1f', entry.getSize() / (1024.0 * 1024.0))
            def apkMb = String.format('%.1f', standaloneApkFile.length() / (1024.0 * 1024.0))
            println ""
            println "${TAG} ================================================================"
            println "${TAG} STANDALONE APK VERIFIED - assets/index.android.bundle present (" + bundleMb + " MB)"
            println "${TAG} APK: " + standaloneApkFile.absolutePath + " (" + apkMb + " MB)"
            println "${TAG} Install it on the device with:"
            println "${TAG}     adb install -r \\"" + standaloneApkFile.absolutePath + "\\""
            println "${TAG} NOTE: assembleDebug / 'npm run android' / Android Studio Run install DEBUG builds that need Metro."
            println "${TAG} ================================================================"
        } finally {
            apk.close()
        }
    }
}
tasks.matching { it.name == "assembleRelease" }.configureEach { it.finalizedBy "verifyStandaloneApk" }
${MARKER_CLOSE}
`;
}

/**
 * Patch the generated android/app/build.gradle. Pure string function.
 * Returns { contents, injectedSuffix, injectedVerify, warnings } so callers
 * and tests can assert exactly what happened.
 */
function patchAppBuildGradle(contents) {
  const warnings = [];
  let result = contents;

  // --- 1. versionNameSuffix "-debug" on the debug buildType -----------------
  if (/versionNameSuffix/.test(result)) {
    console.log(
      `${TAG} versionNameSuffix already present in app/build.gradle - leaving it untouched`
    );
  } else {
    const debugBlockRe = /(buildTypes\s*\{\s*debug\s*\{\r?\n)/;
    if (debugBlockRe.test(result)) {
      result = result.replace(
        debugBlockRe,
        `$1            versionNameSuffix "-debug"\n`
      );
      console.log(
        `${TAG} injected versionNameSuffix "-debug" into the debug buildType (debug builds now show as "1.0.0-debug" in Android Settings)`
      );
    } else {
      warnings.push(
        'buildTypes { debug { not found in app/build.gradle - template layout changed upstream; versionNameSuffix NOT injected'
      );
    }
  }

  // --- 2. verifyStandaloneApk task (marker-guarded, appended once) ----------
  if (result.includes(MARKER_OPEN)) {
    console.log(
      `${TAG} verifyStandaloneApk block already present in app/build.gradle - skipping append`
    );
  } else {
    result = result.trimEnd() + '\n' + composeVerifyBlock();
    console.log(
      `${TAG} appended verifyStandaloneApk task (assembleRelease.finalizedBy) - a release APK without the embedded JS bundle now fails the build instead of red-screening on the device`
    );
  }

  return { contents: result, warnings };
}

function withStandaloneRelease(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const appGradleFile = path.join(
        config.modRequest.projectRoot,
        'android',
        'app',
        'build.gradle'
      );
      if (!fs.existsSync(appGradleFile)) {
        throw new Error(
          `${TAG} ${appGradleFile} not found after prebuild. The android template layout may have changed upstream.`
        );
      }
      const original = fs.readFileSync(appGradleFile, 'utf8');
      const { contents, warnings } = patchAppBuildGradle(original);
      for (const warning of warnings) {
        console.warn(`${TAG} WARNING: ${warning}`);
      }
      if (contents !== original) {
        fs.writeFileSync(appGradleFile, contents);
      }
      return config;
    },
  ]);
}

module.exports = withStandaloneRelease;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
module.exports.composeVerifyBlock = composeVerifyBlock;
module.exports.TAG = TAG;
