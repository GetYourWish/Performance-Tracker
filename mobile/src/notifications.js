// notifications.js — Android local notifications for due deadlines (v1.3.0).
//
// User request (2026-11-18): "it should send a notification on the android
// app letting the user know when a due task is added into the working on
// tasks." Two cooperating pieces:
//
//  1. notifyWorkingOnAdds() — an IMMEDIATE notification whenever the daily
//     automation (applyDueDeadlines) pushes due tasks into workingOn.
//  2. syncDeadlineReminders() — day-of reminders SCHEDULED IN ADVANCE at
//     09:00 local on each upcoming deadline. Scheduled triggers fire even
//     when the app is backgrounded or killed, which is what makes the
//     notifications actually useful — the app is rarely open the moment a
//     deadline lands. Deterministic identifiers make the sync idempotent:
//     schedule the missing, cancel the stale.
//
// The module degrades to a no-op everywhere: a missing/broken native module
// (old build, test environment) must never take the app down.

const CHANNEL_ID = 'deadlines'
const SCHEDULED_ID_PREFIX = 'deadline:'
// Day-of reminder time (local clock) — a morning heads-up.
const REMINDER_HOUR = 9
const REMINDER_MINUTE = 0
// Android caps scheduled alarms; keep the nearest N future deadlines.
const MAX_SCHEDULED = 40

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Lazy + guarded: never require the package at module load.
let cachedModule
function getNotifications() {
  if (cachedModule !== undefined) return cachedModule
  try {
    cachedModule = require('expo-notifications')
  } catch (e) {
    console.warn(
      '[notifications] expo-notifications unavailable — deadline notifications disabled:',
      e?.message || e
    )
    cachedModule = null
  }
  return cachedModule
}

// Call once at boot: with no handler, Android drops notifications while the
// app is FOREGROUNDED; the handler makes them show as heads-up banners. The
// 'deadlines' channel gets a stable, user-visible configuration (importance
// HIGH = heads-up + lockscreen, vibration, no sound by default — the user
// can enable sound in the system channel settings).
let configured = false
export async function configureNotifications() {
  const Notifications = getNotifications()
  if (!Notifications || configured) return
  configured = true
  try {
    if (typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false
        })
      })
    }
    if (typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Deadlines',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250]
      })
    }
  } catch (e) {
    console.warn('[notifications] configure failed:', e?.message || e)
  }
}

// POST_NOTIFICATIONS (Android 13+) is a runtime permission. Asked once per
// session the first time the app reaches ready state; the answer is cached
// so data changes never re-prompt.
let permissionPromise = null
export function ensureNotificationPermission() {
  const Notifications = getNotifications()
  if (!Notifications) return Promise.resolve(false)
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        let status = await Notifications.getPermissionsAsync()
        if (!status.granted && status.canAskAgain) {
          status = await Notifications.requestPermissionsAsync()
        }
        return !!status.granted
      } catch (e) {
        console.warn('[notifications] permission check failed:', e?.message || e)
        permissionPromise = null // transient failure → retry next session
        return false
      }
    })()
  }
  return permissionPromise
}

// 1) Immediate "added to Working On" notification. `tasks` = the task
// objects that just auto-joined workingOn (from applyDueDeadlines' `added`).
export async function notifyWorkingOnAdds(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return false
  const Notifications = getNotifications()
  if (!Notifications) return false
  try {
    await ensureNotificationPermission()
    const names = tasks.map(t => `“${String(t.text || 'Task')}”`)
    let body
    if (tasks.length === 1) {
      body = `${names[0]} is due — it was added to Working On.`
    } else {
      const shown = names.slice(0, 3).join(', ')
      const more = tasks.length > 3 ? ` and ${tasks.length - 3} more` : ''
      body = `${tasks.length} tasks are due and were added to Working On: ${shown}${more}.`
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Deadline reached',
        body,
        data: { type: 'deadline-auto-add' }
      },
      trigger: { channelId: CHANNEL_ID }
    })
    return true
  } catch (e) {
    console.warn('[notifications] notify failed:', e?.message || e)
    return false
  }
}

function scheduledIdFor(task) {
  return `${SCHEDULED_ID_PREFIX}${task.id}:${task.deadline}`
}

// Local date for the 09:00 reminder on the deadline's day. Null when that
// moment is already in the past (an immediate notify covers it instead).
function reminderDate(deadlineIso) {
  const [y, m, d] = deadlineIso.split('-').map(Number)
  const when = new Date(y, m - 1, d, REMINDER_HOUR, REMINDER_MINUTE, 0, 0)
  return when.getTime() > Date.now() ? when : null
}

// 2) Re-sync scheduled day-of reminders for upcoming deadlines. Call on
// every data change: new deadlines get scheduled, completed/deleted/changed
// ones get cancelled (deterministic ids make it a diff, not a rebuild).
export async function syncDeadlineReminders(tasks, today) {
  const Notifications = getNotifications()
  if (!Notifications) return
  try {
    const upcoming = []
    for (const t of tasks || []) {
      if (!t || t.completion) continue
      if (typeof t.deadline !== 'string' || !ISO_DATE_RE.test(t.deadline)) continue
      if (typeof today === 'string' && t.deadline <= today) continue
      upcoming.push(t)
    }
    upcoming.sort((a, b) => (a.deadline < b.deadline ? -1 : 1))

    const wanted = new Map()
    for (const t of upcoming.slice(0, MAX_SCHEDULED)) {
      wanted.set(scheduledIdFor(t), t)
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    const scheduledIds = new Set()
    for (const entry of scheduled || []) {
      const id = entry?.request?.identifier ?? entry?.identifier
      if (typeof id === 'string') scheduledIds.add(id)
    }

    // cancel ours that are no longer wanted
    for (const id of scheduledIds) {
      if (id.startsWith(SCHEDULED_ID_PREFIX) && !wanted.has(id)) {
        await Notifications.cancelScheduledNotificationAsync(id)
      }
    }

    // schedule the missing ones
    for (const [id, t] of wanted) {
      if (scheduledIds.has(id)) continue
      const when = reminderDate(t.deadline)
      if (!when) continue
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: 'Task due today',
          body: `“${String(t.text || 'Task')}” is due today — it will be added to Working On.`,
          data: { type: 'deadline-reminder' }
        },
        trigger: { type: 'date', date: when, channelId: CHANNEL_ID }
      })
    }
  } catch (e) {
    console.warn('[notifications] reminder sync failed:', e?.message || e)
  }
}
