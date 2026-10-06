import { beforeEach, describe, expect, it, vi } from 'vitest'

// Native modules are never evaluated; only the injected SDK-shaped port is used.
vi.mock('expo-notifications', () => ({
  setNotificationChannelAsync: vi.fn(), getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(), getAllScheduledNotificationsAsync: vi.fn(), cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn(), logNote: vi.fn() }))
import * as Notifications from 'expo-notifications'
import { logFailure } from '../../../utils/diagnostics'
import { createReminderService, type CreateReminderInput } from './service'
import { REMINDERS_CHANNEL, type ReminderNotifications, type ReminderRequest } from './scheduler'
import { readReminderPreferences, REMINDERS_STORAGE_KEY } from './storage'
import { reminderPrefix, weekReminderPrefix } from './planner'

const api = vi.mocked(Notifications as unknown as ReminderNotifications)
const start = 1_800_000_000
const input: CreateReminderInput = {
  ritualAddress: 'A', ritualTitle: 'Read', stakeLabel: '5 TEST', causeLabel: 'the food bank', enabled: true,
  schedule: Array.from({ length: 2 }, (_, index) => ({ opens: start + 90 + index * 604800, deadline: start + 90 + index * 604800 + 518400, resolution: start + 90 + index * 604800 + 601200 })),
}
const pending = new Map<string, ReminderRequest>()
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
  api.setNotificationChannelAsync.mockResolvedValue(null)
  api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
  api.requestPermissionsAsync.mockImplementation(async () => {
    api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    return { granted: true }
  })
  api.getAllScheduledNotificationsAsync.mockImplementation(async () => [...pending.keys()].map((identifier) => ({ identifier })))
  api.cancelScheduledNotificationAsync.mockImplementation(async (identifier) => { pending.delete(identifier) })
  api.scheduleNotificationAsync.mockImplementation(async (request) => { pending.set(request.identifier, request); return request.identifier })
})

describe('local reminder scheduling service', () => {
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
  it('creates the channel before one permission request and maps exact date triggers', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    expect(api.setNotificationChannelAsync).toHaveBeenCalledWith(REMINDERS_CHANNEL, { name: 'Rituals', importance: 3 })
    expect(api.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(api.requestPermissionsAsync.mock.invocationCallOrder[0])
    expect(api.requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(pending.size).toBe(6)
    expect(pending.get(`${weekReminderPrefix('A', 0)}open`)).toEqual({
      identifier: `${weekReminderPrefix('A', 0)}open`, content: { title: 'Read', body: expect.any(String), sound: 'default' },
      trigger: { type: 'date', date: new Date(Number(input.schedule[0].opens) * 1000), channelId: REMINDERS_CHANNEL },
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
  it('never loads native code or prompts for Demo speed or an opt-out', async () => {
    const f = fixture()
    await f.service.afterCreate({ ...input, enabled: false })
    await f.service.afterCreate({ ...input, ritualAddress: 'B', schedule: [{ opens: start + 90, deadline: start + 180, resolution: start + 200 }] })
    expect(f.loadNotifications).not.toHaveBeenCalled()
    expect((await readReminderPreferences(f.storage)).rituals).toEqual({ A: { enabled: false, stampedWeeks: [] }, B: { enabled: false, stampedWeeks: [] } })
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
})
