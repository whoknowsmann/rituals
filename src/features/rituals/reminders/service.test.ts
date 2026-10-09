import { beforeEach, describe, expect, it, vi } from 'vitest'

// Native modules are never evaluated; only the injected SDK-shaped port is used.
vi.mock('expo-notifications', () => ({
  setNotificationChannelGroupAsync: vi.fn(), setNotificationChannelAsync: vi.fn(), getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(), getAllScheduledNotificationsAsync: vi.fn(), cancelScheduledNotificationAsync: vi.fn(),
  getPresentedNotificationsAsync: vi.fn(), dismissNotificationAsync: vi.fn(),
}))
vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn(), logNote: vi.fn() }))
import * as Notifications from 'expo-notifications'
import { logFailure } from '../../../utils/diagnostics'
import { createReminderService, type CreateReminderInput } from './service'
import { REMINDER_CHANNELS, type ReminderNotifications, type ReminderRequest } from './scheduler'
import { readReminderPreferences, REMINDERS_STORAGE_KEY } from './storage'
import { reminderPrefix, weekReminderPrefix } from './planner'

const api = vi.mocked(Notifications as unknown as ReminderNotifications)
const start = 1_800_000_000
const input: CreateReminderInput = {
  ritualAddress: 'A', ritualTitle: 'Read', stakeLabel: '5 tSKR', causeLabel: 'the food bank', enabled: true,
  schedule: Array.from({ length: 2 }, (_, index) => ({ opens: start + 90 + index * 604800, deadline: start + 90 + index * 604800 + 518400, resolution: start + 90 + index * 604800 + 601200 })),
}
const pending = new Map<string, ReminderRequest>()
const presented = new Set<string>()
const demoInput: CreateReminderInput = { ...input, schedule: Array.from({ length: 2 }, (_, index) => ({
  opens: start + 60 + index * 60, deadline: start + 105 + index * 60, resolution: start + 115 + index * 60,
})) }
function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: vi.fn(async (key: string) => values.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }) }
  const loadNotifications = vi.fn(async () => api)
  const clock = { now: start }
  const deps = { storage, loadNotifications, nowSeconds: () => clock.now }
  return { ...deps, values, clock, service: createReminderService(deps) }
}

beforeEach(() => {
  vi.resetAllMocks()
  pending.clear()
  presented.clear()
  api.setNotificationChannelAsync.mockResolvedValue(null)
  api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
  api.requestPermissionsAsync.mockImplementation(async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    return { granted: true }
  })
  api.getAllScheduledNotificationsAsync.mockImplementation(async () => [...pending.keys()].map((identifier) => ({ identifier })))
  api.cancelScheduledNotificationAsync.mockImplementation(async (identifier) => { pending.delete(identifier) })
  api.getPresentedNotificationsAsync.mockImplementation(async () => [...presented].map((identifier) => ({ request: { identifier } })))
  api.dismissNotificationAsync.mockImplementation(async (identifier) => { presented.delete(identifier) })
  api.scheduleNotificationAsync.mockImplementation(async (request) => { pending.set(request.identifier, request); return request.identifier })
})

describe('local reminder scheduling service', () => {
  it('stops restore scheduling when the wallet changes during native permission lookup', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    api.scheduleNotificationAsync.mockClear()
    let active = true
    api.getPermissionsAsync.mockImplementationOnce(async () => { active = false; return { granted: true, canAskAgain: false } })
    await f.service.restore(input, () => active)
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
  it('prepares foreground display without reading preferences or asking permission', async () => {
    const f = fixture()
    await f.service.prepare()
    expect(f.loadNotifications).toHaveBeenCalledTimes(1)
    expect(f.storage.getItem).not.toHaveBeenCalled()
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled()
    f.loadNotifications.mockRejectedValueOnce(new Error('missing native module'))
    await expect(f.service.prepare()).resolves.toBeUndefined()
    expect(logFailure).toHaveBeenCalled()
  })
  it('can disable an existing set without another permission request', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    await f.service.afterCreate({ ...input, enabled: false })
    expect(pending.size).toBe(0)
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect((await readReminderPreferences(f.storage)).rituals.A.enabled).toBe(false)
  })
  it('creates channels before one permission request and maps exact date triggers', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    expect(api.setNotificationChannelAsync).toHaveBeenCalledWith(REMINDER_CHANNELS.open.id, { name: 'Week opens', importance: 'default', groupId: 'rituals', sound: 'default' })
    expect(api.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(api.requestPermissionsAsync.mock.invocationCallOrder[0])
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(pending.size).toBe(6)
    expect(pending.get(`${weekReminderPrefix('A', 0)}open`)).toEqual({
      identifier: `${weekReminderPrefix('A', 0)}open`, content: { title: 'Read', body: expect.any(String), sound: 'default', data: { ritualReminder: 'real' } },
      trigger: { type: 'date', date: new Date(Number(input.schedule[0].opens) * 1000), channelId: REMINDER_CHANNELS.open.id },
    })
    expect((await readReminderPreferences(f.storage)).rituals.A.enabled).toBe(true)
  })
  it('uses Android permission already granted without another prompt', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    await fixture().service.afterCreate(input)
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(pending.size).toBe(6)
  })
  it('denial does not reject, schedule, or prompt again after a service restart', async () => {
    const f = fixture()
    api.requestPermissionsAsync.mockResolvedValue({ granted: false })
    await expect(f.service.afterCreate(input)).resolves.toBeUndefined()
    await createReminderService(f).afterCreate({ ...input, ritualAddress: 'B' })
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(pending.size).toBe(0)
    expect((await readReminderPreferences(f.storage)).permissionAsked).toBe(true)
  })
  it('does not ask when the OS says it cannot ask again', async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false })
    await fixture().service.afterCreate(input)
    expect(api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(pending.size).toBe(0)
  })
  it('never loads native code or prompts for an opt-out', async () => {
    const f = fixture()
    await f.service.afterCreate({ ...input, enabled: false })
    expect(f.loadNotifications).not.toHaveBeenCalled()
    expect((await readReminderPreferences(f.storage)).rituals).toEqual({ A: { enabled: false, stampedWeeks: [] } })
  })
  it('missing native module and SDK errors never reject into create', async () => {
    const f = fixture()
    f.loadNotifications.mockRejectedValueOnce(new Error('Cannot find native module'))
    await expect(f.service.afterCreate(input)).resolves.toBeUndefined()
    expect(logFailure).toHaveBeenCalledWith('reminders', expect.any(Error))
    api.requestPermissionsAsync.mockRejectedValueOnce(new Error('native request failed'))
    await expect(f.service.afterCreate(input)).resolves.toBeUndefined()
    expect(pending.size).toBe(0)
    await f.service.afterCreate(input)
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  })
  it('rechecks time after a slow permission dialog instead of delivering a past opening', async () => {
    const f = fixture()
    api.requestPermissionsAsync.mockImplementationOnce(async () => { f.clock.now = Number(input.schedule[0].opens); return { granted: true } })
    await f.service.afterCreate(input)
    expect(pending.size).toBe(5)
    expect(pending.has(`${weekReminderPrefix('A', 0)}open`)).toBe(false)
  })
  it('rechecks time between native schedule calls', async () => {
    const f = fixture()
    api.scheduleNotificationAsync.mockImplementationOnce(async (request) => {
      pending.set(request.identifier, request)
      f.clock.now = Number(input.schedule[1].resolution)
      return request.identifier
    })
    await f.service.afterCreate(input)
    expect(pending.size).toBe(1)
  })
  it('rescheduling is idempotent and stamped weeks stay cancelled after restart', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    await f.service.afterCreate(input)
    expect(pending.size).toBe(6)
    await f.service.afterStamp('A', 0)
    await createReminderService(f).afterCreate(input)
    expect(pending.size).toBe(3)
    expect([...pending.keys()].every((id) => id.startsWith(weekReminderPrefix('A', 1)))).toBe(true)
  })
  it('a stamp cancels only that exact week, not week 10 or another ritual', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    pending.set(`${weekReminderPrefix('A', 10)}open`, {} as ReminderRequest)
    pending.set(`${weekReminderPrefix('A-extra', 0)}open`, {} as ReminderRequest)
    await f.service.afterStamp('A', 0)
    expect(pending.size).toBe(5)
    expect(api.cancelScheduledNotificationAsync.mock.calls.map(([id]) => id)).toEqual(['open', 'day', 'hour'].map((kind) => `${weekReminderPrefix('A', 0)}${kind}`))
  })
  it('forget clears the full prefix and preference, preserving other rituals and prompt history', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    await f.service.afterCreate({ ...input, ritualAddress: 'A-extra' })
    await f.service.forget('A')
    expect(pending.size).toBe(6)
    expect([...pending.keys()].every((id) => id.startsWith(reminderPrefix('A-extra')))).toBe(true)
    const preferences = await readReminderPreferences(f.storage)
    expect(preferences.rituals.A).toBeUndefined()
    expect(preferences.permissionAsked).toBe(true)
  })
  it('serializes two creates and a stamp/removal queued behind scheduling', async () => {
    const f = fixture()
    await Promise.all([f.service.afterCreate(input), f.service.afterCreate({ ...input, ritualAddress: 'B' }), f.service.afterStamp('A', 0), f.service.forget('B')])
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect([...pending.keys()].every((id) => id.startsWith(weekReminderPrefix('A', 1)))).toBe(true)
    expect(pending.size).toBe(3)
    expect((await readReminderPreferences(f.storage)).rituals).toEqual({ A: { enabled: true, stampedWeeks: [0] } })
  })
  it('rolls back partial scheduling on native failure', async () => {
    const f = fixture()
    api.scheduleNotificationAsync.mockImplementationOnce(async (request) => { pending.set(request.identifier, request); return request.identifier })
      .mockRejectedValueOnce(new Error('alarm failed'))
    await expect(f.service.afterCreate(input)).resolves.toBeUndefined()
    expect(pending.size).toBe(0)
    expect(logFailure).toHaveBeenCalledWith('reminders', expect.any(Error))
  })
  it('attempts all cancellations when one fails and logs the failure', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    api.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'))
    await expect(f.service.afterStamp('A', 0)).resolves.toBeUndefined()
    expect(api.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3)
    expect(logFailure).toHaveBeenCalledWith('reminders', expect.any(Error))
  })
  it.each(['stamp', 'forget'])('still cancels on %s when preference storage fails', async (action) => {
    const f = fixture()
    await f.service.afterCreate(input)
    f.storage.setItem.mockRejectedValueOnce(new Error('storage failed'))
    if (action === 'stamp') await f.service.afterStamp('A', 0)
    else await f.service.forget('A')
    expect(pending.size).toBe(action === 'stamp' ? 3 : 0)
    expect(logFailure).toHaveBeenCalled()
  })
  it('corrupt preference storage fails closed without requesting or scheduling', async () => {
    const f = fixture()
    f.values.set(REMINDERS_STORAGE_KEY, '{')
    await f.service.afterCreate(input)
    expect(f.loadNotifications).not.toHaveBeenCalled()
    expect(logFailure).toHaveBeenCalled()
  })
  it('ignores invalid event indices without touching unrelated reminders', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    for (const week of [-1, 16, NaN, 0.5]) await f.service.afterStamp('A', week)
    expect(pending.size).toBe(6)
  })
  it('clears the demo open id on stamp, including an already delivered alert, not the next week or ritual', async () => {
    const f = fixture()
    await f.service.afterCreate(demoInput)
    await f.service.afterCreate({ ...demoInput, ritualAddress: 'A-extra' })
    const id = `${weekReminderPrefix('A', 0)}open`
    presented.add(id)
    presented.add(`${weekReminderPrefix('A-extra', 0)}open`)
    await f.service.afterStamp('A', 0)
    expect(pending.has(id)).toBe(false)
    expect(pending.has(`${weekReminderPrefix('A', 1)}open`)).toBe(true)
    expect(pending.size).toBe(3)
    expect([...presented]).toEqual([`${weekReminderPrefix('A-extra', 0)}open`])
    await createReminderService(f).afterCreate(demoInput)
    expect(pending.has(id)).toBe(false)
    expect(pending.size).toBe(3)
  })
  it('marks only demo alarms for foreground suppression, without changing Real-weeks content', async () => {
    const f = fixture()
    await f.service.afterCreate(demoInput)
    expect([...pending.values()]).toHaveLength(2)
    expect([...pending.values()].every((request) => request.content.data.ritualReminder === 'demo')).toBe(true)
    await f.service.afterCreate({ ...input, ritualAddress: 'B' })
    expect([...pending.values()].filter((request) => request.content.data.ritualReminder === 'real')).toHaveLength(6)
  })
  it('forget dismisses delivered alerts even after they leave the scheduled queue', async () => {
    const f = fixture()
    await f.service.afterCreate(demoInput)
    for (const id of pending.keys()) presented.add(id)
    pending.clear()
    presented.add(`${weekReminderPrefix('B', 0)}open`)
    await f.service.forget('A')
    expect([...presented]).toEqual([`${weekReminderPrefix('B', 0)}open`])
    expect((await readReminderPreferences(f.storage)).rituals.A).toBeUndefined()
  })
  it('inspects the tray after cancellation, including an alert delivered while cancellation was pending', async () => {
    const f = fixture()
    await f.service.afterCreate(demoInput)
    api.cancelScheduledNotificationAsync.mockImplementationOnce(async (identifier) => {
      presented.add(identifier)
      pending.delete(identifier)
    })
    await f.service.afterStamp('A', 0)
    expect(presented.size).toBe(0)
    expect(pending.size).toBe(1)
  })
  it.each(['schedule-list', 'tray-list', 'dismiss'] as const)('keeps cleanup best effort when %s fails', async (failure) => {
    const f = fixture()
    await f.service.afterCreate(input)
    const ids = ['open', 'day', 'hour'].map((kind) => `${weekReminderPrefix('A', 0)}${kind}`)
    ids.forEach((id) => presented.add(id))
    if (failure === 'schedule-list') api.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error('unavailable'))
    if (failure === 'tray-list') api.getPresentedNotificationsAsync.mockRejectedValueOnce(new Error('unavailable'))
    if (failure === 'dismiss') api.dismissNotificationAsync.mockRejectedValueOnce(new Error('unavailable'))
    await expect(f.service.afterStamp('A', 0)).resolves.toBeUndefined()
    if (failure !== 'schedule-list') expect(ids.every((id) => !pending.has(id))).toBe(true)
    if (failure !== 'tray-list') expect(api.dismissNotificationAsync).toHaveBeenCalledTimes(3)
    expect(logFailure).toHaveBeenCalled()
  })
  it.each([60, 61, 105, 115, 120, 175])('drops demo openings passed during permission at +%s seconds; never delays them', async (elapsed) => {
    const f = fixture()
    api.requestPermissionsAsync.mockImplementationOnce(async () => { f.clock.now = start + elapsed; return { granted: true } })
    await f.service.afterCreate(demoInput)
    expect([...pending.keys()]).toEqual(elapsed < 120 ? [`${weekReminderPrefix('A', 1)}open`] : [])
    expect([...pending.values()].every((request) => request.trigger.date.getTime() > f.clock.now * 1000)).toBe(true)
  })
  it.each(['stamp', 'forget'] as const)('a missing native module never rejects into %s', async (action) => {
    const f = fixture()
    f.loadNotifications.mockRejectedValueOnce(new Error('missing native module'))
    await expect(action === 'stamp' ? f.service.afterStamp('A', 0) : f.service.forget('A')).resolves.toBeUndefined()
    expect(logFailure).toHaveBeenCalled()
  })
})
