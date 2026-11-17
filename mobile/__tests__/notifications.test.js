// notifications.js — v1.3.0 Android deadline notifications.
//
// expo-notifications is fully mocked (the native module only exists on a
// device). The mock keeps its state in the shared mockState object, so the
// sync algorithm is tested as a diff: what got scheduled, what got
// cancelled, with which identifiers.
//
// notifications.js caches the loaded module and its flags (configured /
// permissionPromise), so tests that exercise those paths take a FRESH
// module via jest.resetModules(). After a reset the mock factory re-runs,
// so the mocked package must be re-required too — fresh fns, same shared
// mockState.
//
// Degradation contract: with the native module unavailable every function
// must be a silent no-op — a notification problem can never break the app.

import { getCurrentDate } from '@performance-tracker/core'

const mockState = {
  handler: null,
  channels: [],
  scheduledById: new Map(),
  requests: [],
  immediateCount: 0,
  permissions: { granted: true, canAskAgain: true },
  // degradation test: make the factory itself throw, as a broken/missing
  // native install would during require
  loadThrows: false
}

jest.mock('expo-notifications', () => {
  if (mockState.loadThrows) {
    throw new Error('native module missing')
  }
  return {
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler: jest.fn(handler => {
      mockState.handler = handler
    }),
    setNotificationChannelAsync: jest.fn(async (id, channel) => {
      mockState.channels.push({ id, channel })
      return { id }
    }),
    getPermissionsAsync: jest.fn(async () => mockState.permissions),
    // the runtime permission prompt: the user accepts by default
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
    scheduleNotificationAsync: jest.fn(async request => {
      mockState.requests.push(request)
      const id = request.identifier ?? `immediate-${++mockState.immediateCount}`
      mockState.scheduledById.set(id, request)
      return id
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      Array.from(mockState.scheduledById.entries()).map(([identifier, request]) => ({ request }))
    ),
    cancelScheduledNotificationAsync: jest.fn(async id => {
      mockState.scheduledById.delete(id)
    })
  }
})

// Fresh notifications module + matching fresh mock reference.
function fresh() {
  jest.resetModules()
  return {
    notifications: require('../src/notifications'),
    Notifications: require('expo-notifications')
  }
}

beforeEach(() => {
  mockState.handler = null
  mockState.channels = []
  mockState.scheduledById = new Map()
  mockState.requests = []
  mockState.immediateCount = 0
  mockState.permissions = { granted: true, canAskAgain: true }
  mockState.loadThrows = false
})

describe('configureNotifications', () => {
  it('installs a foreground handler that shows alerts and creates the deadlines channel', async () => {
    const { notifications } = fresh()
    await notifications.configureNotifications()

    expect(mockState.handler).toBeTruthy()
    const behavior = await mockState.handler.handleNotification()
    expect(behavior.shouldShowAlert).toBe(true)
    expect(behavior.shouldSetBadge).toBe(false)

    expect(mockState.channels.length).toBe(1)
    expect(mockState.channels[0].id).toBe('deadlines')
    expect(mockState.channels[0].channel.importance).toBe(4) // AndroidImportance.HIGH
  })
})

describe('ensureNotificationPermission', () => {
  it('does not re-ask when already granted', async () => {
    const { notifications, Notifications } = fresh()
    const granted = await notifications.ensureNotificationPermission()
    expect(granted).toBe(true)
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('asks once when not granted and canAskAgain', async () => {
    const { notifications, Notifications } = fresh()
    mockState.permissions = { granted: false, canAskAgain: true }
    const granted = await notifications.ensureNotificationPermission()
    expect(granted).toBe(true)
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('returns false when denied and cannot ask again', async () => {
    const { notifications, Notifications } = fresh()
    mockState.permissions = { granted: false, canAskAgain: false }
    const granted = await notifications.ensureNotificationPermission()
    expect(granted).toBe(false)
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })
})

describe('notifyWorkingOnAdds', () => {
  it('sends one immediate notification for a single task', async () => {
    const { notifications } = fresh()
    const ok = await notifications.notifyWorkingOnAdds([{ id: 't1', text: 'Write the report' }])
    expect(ok).toBe(true)
    expect(mockState.requests.length).toBe(1)
    const request = mockState.requests[0]
    expect(request.content.title).toBe('Deadline reached')
    expect(request.content.body).toContain('Write the report')
    expect(request.content.body).toContain('added to Working On')
    // immediate delivery through the deadlines channel
    expect(request.trigger).toEqual({ channelId: 'deadlines' })
  })

  it('summarizes multiple tasks in one notification', async () => {
    const { notifications } = fresh()
    const ok = await notifications.notifyWorkingOnAdds([
      { id: 't1', text: 'Alpha' },
      { id: 't2', text: 'Beta' },
      { id: 't3', text: 'Gamma' },
      { id: 't4', text: 'Delta' },
      { id: 't5', text: 'Epsilon' }
    ])
    expect(ok).toBe(true)
    expect(mockState.requests.length).toBe(1)
    const body = mockState.requests[0].content.body
    expect(body).toContain('5 tasks are due')
    expect(body).toContain('Alpha')
    expect(body).toContain('Gamma')
    expect(body).toContain('and 2 more')
    expect(body).not.toContain('Epsilon')
  })

  it('is a no-op for an empty list', async () => {
    const { notifications } = fresh()
    const ok = await notifications.notifyWorkingOnAdds([])
    expect(ok).toBe(false)
    expect(mockState.requests.length).toBe(0)
  })
})

describe('syncDeadlineReminders', () => {
  const today = getCurrentDate()
  const futureA = '2027-06-01'
  const futureB = '2027-07-04'

  it('schedules 09:00 day-of reminders for future deadlines with stable ids', async () => {
    const { notifications } = fresh()
    await notifications.syncDeadlineReminders(
      [
        { id: 'tA', text: 'Future task', deadline: futureA },
        { id: 'tB', text: 'Later task', deadline: futureB }
      ],
      today
    )
    expect(mockState.requests.length).toBe(2)

    const a = mockState.requests.find(r => r.identifier === `deadline:tA:${futureA}`)
    expect(a).toBeTruthy()
    expect(a.content.title).toBe('Task due today')
    expect(a.content.body).toContain('Future task')
    expect(a.trigger.type).toBe('date')
    expect(a.trigger.channelId).toBe('deadlines')
    // 09:00 local on the deadline day
    const when = new Date(a.trigger.date)
    expect(when.getFullYear()).toBe(2027)
    expect(when.getMonth()).toBe(5) // June (0-based)
    expect(when.getDate()).toBe(1)
    expect(when.getHours()).toBe(9)
    expect(when.getMinutes()).toBe(0)

    expect(mockState.requests.find(r => r.identifier === `deadline:tB:${futureB}`)).toBeTruthy()
  })

  it('ignores completed tasks, deadline-less tasks and past/today deadlines', async () => {
    const { notifications } = fresh()
    await notifications.syncDeadlineReminders(
      [
        { id: 'tDone', text: 'Done', deadline: futureA, completion: { completedDate: today } },
        { id: 'tNone', text: 'No deadline' },
        { id: 'tPast', text: 'Past', deadline: '2020-01-01' },
        { id: 'tToday', text: 'Today', deadline: today }
      ],
      today
    )
    expect(mockState.requests.length).toBe(0)
  })

  it('cancels stale reminders and keeps current ones (idempotent diff)', async () => {
    const { notifications, Notifications } = fresh()
    // seed: tA already scheduled, plus a stale reminder for a removed task
    mockState.scheduledById.set(`deadline:tA:${futureA}`, { identifier: `deadline:tA:${futureA}` })
    mockState.scheduledById.set('deadline:tGONE:2027-01-01', { identifier: 'deadline:tGONE:2027-01-01' })

    await notifications.syncDeadlineReminders(
      [{ id: 'tA', text: 'Future task', deadline: futureA }],
      today
    )

    // stale one cancelled, wanted one kept, nothing re-scheduled
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('deadline:tGONE:2027-01-01')
    expect(mockState.scheduledById.has(`deadline:tA:${futureA}`)).toBe(true)
    expect(mockState.scheduledById.has('deadline:tGONE:2027-01-01')).toBe(false)
    expect(mockState.requests.filter(r => r.identifier).length).toBe(0)
  })

  it('never touches notifications it does not own', async () => {
    const { notifications, Notifications } = fresh()
    mockState.scheduledById.set('some-other-app-reminder', { identifier: 'some-other-app-reminder' })
    await notifications.syncDeadlineReminders([], today)
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled()
    expect(mockState.scheduledById.has('some-other-app-reminder')).toBe(true)
  })

  it('caps the number of scheduled reminders at 40', async () => {
    const { notifications } = fresh()
    const many = []
    for (let i = 0; i < 50; i++) {
      // spread across August (31 days) and September (19 days) of 2027
      const deadline = i < 31
        ? `2027-08-${String(i + 1).padStart(2, '0')}`
        : `2027-09-${String(i - 30).padStart(2, '0')}`
      many.push({ id: `t${i}`, text: `Task ${i}`, deadline })
    }
    await notifications.syncDeadlineReminders(many, today)
    expect(mockState.requests.length).toBe(40)
  })
})

describe('degradation without the native module', () => {
  it('every function silently no-ops when expo-notifications cannot load', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockState.loadThrows = true
    jest.resetModules()
    const freshNotifications = require('../src/notifications')
    const results = await Promise.all([
      freshNotifications.configureNotifications(),
      freshNotifications.ensureNotificationPermission(),
      freshNotifications.notifyWorkingOnAdds([{ id: 't1', text: 'X' }]),
      freshNotifications.syncDeadlineReminders(
        [{ id: 'tA', text: 'Y', deadline: '2027-06-01' }],
        getCurrentDate()
      )
    ])
    // configure + sync resolve silently; permission + notify report false
    expect(results[1]).toBe(false)
    expect(results[2]).toBe(false)
    expect(mockState.requests.length).toBe(0)
    mockState.loadThrows = false
    warnSpy.mockRestore()
  })
})
