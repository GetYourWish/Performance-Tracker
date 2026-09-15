// Release-mode JS crash reporter.
//
// Why: a release APK has no red box — an unhandled JS error at startup kills
// the process instantly and the user has no console/logcat to check. This
// module records the last fatal JS error to the app-private storage and the
// app shows it on the next launch (screenshot-able, no adb needed).
//
// Design constraints:
//  - __DEV__ is a no-op (Metro/dev builds have real tooling).
//  - Every step is individually try/catch-wrapped: the reporter must never
//    be the reason the app crashes.
//  - The original global handler is still invoked (native crash pipeline,
//    e.g. the JS exception dialog, keeps its normal behavior).

import * as FileSystem from 'expo-file-system'

const CRASH_FILE = 'last-crash.json'
export const MAX_STACK_CHARS = 8000

let cachedReport // undefined = not read yet, null = checked & none

export function crashReportUri() {
  return FileSystem.documentDirectory + CRASH_FILE
}

export function installReleaseCrashReporter() {
  if (__DEV__) return false
  try {
    const errorUtils = global.ErrorUtils
    if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') return false
    const original = typeof errorUtils.getGlobalHandler === 'function' ? errorUtils.getGlobalHandler() : null
    errorUtils.setGlobalHandler((error, isFatal) => {
      try {
        const report = {
          name: error && error.name ? String(error.name) : 'Error',
          message: error && error.message ? String(error.message) : String(error),
          stack: error && error.stack ? String(error.stack).slice(0, MAX_STACK_CHARS) : null,
          isFatal: !!isFatal,
          at: new Date().toISOString()
        }
        FileSystem.writeAsStringAsync(crashReportUri(), JSON.stringify(report, null, 2)).catch(() => {})
      } catch (e) {
        // reporter must never throw
      }
      if (typeof original === 'function') original(error, isFatal)
    })
    return true
  } catch (e) {
    return false
  }
}

export async function readLastCrash() {
  if (cachedReport !== undefined) return cachedReport
  try {
    const info = await FileSystem.getInfoAsync(crashReportUri())
    if (!info.exists) {
      cachedReport = null
      return null
    }
    const raw = await FileSystem.readAsStringAsync(crashReportUri())
    cachedReport = JSON.parse(raw)
  } catch (e) {
    cachedReport = null
  }
  return cachedReport
}

export async function clearLastCrash() {
  cachedReport = null
  try {
    await FileSystem.deleteAsync(crashReportUri(), { idempotent: true })
  } catch (e) {
    // ignore — nothing we can do, and the screen will simply reappear
  }
}
