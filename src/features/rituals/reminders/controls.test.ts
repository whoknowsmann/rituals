import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReminderService, type CreateReminderInput } from './service'
import { REMINDER_CHANNELS, type ReminderNotifications, type ReminderRequest } from './scheduler'
import { readReminderPreferences } from './storage'
import { reminderPrefix, weekReminderPrefix } from './planner'

vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn(), logNote: vi.fn() }))
const start = 1_800_000_000
const input: CreateReminderInput = {
  ritualAddress: 'A', ritualTitle: 'Read', stakeLabel: '5 tSKR', causeLabel: 'the food bank', enabled: true,
  schedule: Array.from({ length: 2 }, (_, index) => ({ opens: start + 90 + index * 604800,
    deadline: start + 90 + index * 604800 + 518400, resolution: start + 90 + index * 604800 + 601200 })),
}
const demoInput = { ...input, schedule: [{ opens: start + 60, deadline: start + 105, resolution: start + 115 }] }
function fixture() {
  const values = new Map<string, string>()
  const pending = new Map<string, ReminderRequest>()
  const presented = new Set<string>()
  const storage = { getItem: vi.fn(async (key: string) => values.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }) }
  const api = {
    setNotificationChannelGroupAsync: vi.fn(), setNotificationChannelAsync: vi.fn(),
    getPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: false })),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    getAllScheduledNotificationsAsync: vi.fn(async () => [...pending.keys()].map((identifier) => ({ identifier }))),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => { pending.delete(id) }),
    getPresentedNotificationsAsync: vi.fn(async () => [...presented].map((identifier) => ({ request: { identifier } }))),
    dismissNotificationAsync: vi.fn(async (id: string) => { presented.delete(id) }),
    scheduleNotificationAsync: vi.fn(async (request: ReminderRequest) => { pending.set(request.identifier, request); return request.identifier }),
  } satisfies ReminderNotifications
  const deps = { storage, loadNotifications: vi.fn(async () => api), nowSeconds: () => start }
  return { ...deps, api, pending, presented, values, service: createReminderService(deps) }
}
beforeEach(() => vi.clearAllMocks())

describe('Android channels and reminder controls (injected native port)', () => {
  it('creates the Rituals group and all four channels before permission or enqueue', async () => {
    const { api, service } = fixture()
    api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    await service.afterCreate(input)
    expect(api.setNotificationChannelGroupAsync).toHaveBeenCalledExactlyOnceWith('rituals', { name: 'Rituals' })
    expect(api.setNotificationChannelAsync.mock.calls).toEqual(Object.values(REMINDER_CHANNELS).map(({ id, ...channel }) =>
      [id, { ...channel, groupId: 'rituals', sound: 'default' }]))
    expect(api.setNotificationChannelGroupAsync.mock.invocationCallOrder[0]).toBeLessThan(api.setNotificationChannelAsync.mock.invocationCallOrder[0])
    for (const order of api.setNotificationChannelAsync.mock.invocationCallOrder) {
      expect(order).toBeLessThan(api.requestPermissionsAsync.mock.invocationCallOrder[0])
      expect(order).toBeLessThan(api.scheduleNotificationAsync.mock.invocationCallOrder[0])
    }
  })
  it('routes every Real kind and the Demo opening to matching stable channels', async () => {
    const { service, pending } = fixture()
    await service.afterCreate(input)
    await service.afterCreate({ ...demoInput, ritualAddress: 'B' })
    for (const week of [0, 1]) for (const kind of ['open', 'day', 'hour'] as const) {
      expect(pending.get(`${weekReminderPrefix('A', week)}${kind}`)?.trigger.channelId).toBe(REMINDER_CHANNELS[kind].id)
    }
    expect(pending.get(`${weekReminderPrefix('B', 0)}open`)?.trigger.channelId).toBe('rituals-demo-weeks')
    expect(pending.size).toBe(7)
  })
  it('master off cancels all Rituals queue/tray ids, including legacy/orphan sets, not unrelated alerts', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    await f.service.afterCreate({ ...demoInput, ritualAddress: 'B' })
    f.pending.set(`${weekReminderPrefix('old-no-preference', 0)}open`, { trigger: { channelId: 'rituals-reminders' } } as ReminderRequest)
    f.pending.set('unrelated', {} as ReminderRequest)
    for (const id of f.pending.keys()) f.presented.add(id)
    expect(await f.service.setMasterEnabled(false)).toBe(true)
    expect([...f.pending.keys()]).toEqual(['unrelated'])
    expect([...f.presented]).toEqual(['unrelated'])
    expect(await readReminderPreferences(f.storage)).toMatchObject({ masterEnabled: false, rituals: { A: { enabled: true }, B: { enabled: true } } })
  })
  it('persisted master off blocks new creates, per-ritual enable and restores after restart without prompting', async () => {
    const f = fixture()
    await f.service.setMasterEnabled(false)
    f.loadNotifications.mockClear()
    const restarted = createReminderService(f)
    await restarted.afterCreate(input)
    await restarted.setRitualEnabled(demoInput)
    await restarted.restore(input)
    expect(f.pending.size).toBe(0)
    expect(f.loadNotifications).not.toHaveBeenCalled()
    expect(f.api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect((await readReminderPreferences(f.storage)).rituals.A.enabled).toBe(true)
  })
  it('master off interrupts an in-flight enqueue then cancels the one already handed to native', async () => {
    const f = fixture()
    let off: Promise<boolean | undefined> | undefined
    f.api.scheduleNotificationAsync.mockImplementationOnce(async (request) => {
      f.pending.set(request.identifier, request)
      off = f.service.setMasterEnabled(false)
      return request.identifier
    })
    await f.service.afterCreate(input)
    await off
    expect(f.api.scheduleNotificationAsync).toHaveBeenCalledTimes(1)
    expect(f.pending.size).toBe(0)
  })
  it('master off during the permission dialog schedules nothing on grant', async () => {
    const f = fixture()
    let off: Promise<boolean | undefined> | undefined
    f.api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    f.api.requestPermissionsAsync.mockImplementationOnce(async () => { off = f.service.setMasterEnabled(false); return { granted: true } })
    await f.service.afterCreate(input)
    await off
    expect(f.api.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect((await readReminderPreferences(f.storage)).masterEnabled).toBe(false)
  })
  it('does not start a permission prompt if master off arrives during channel preparation', async () => {
    const f = fixture()
    let off: Promise<boolean | undefined> | undefined
    f.api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    f.api.setNotificationChannelAsync.mockImplementationOnce(async () => { off = f.service.setMasterEnabled(false) })
    await f.service.afterCreate(input)
    await off
    expect(f.api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(f.api.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
  it.each(['read', 'write'] as const)('master off attempts cancellation and blocks this process on storage %s failure', async (failure) => {
    const f = fixture()
    await f.service.afterCreate(input)
    if (failure === 'read') f.storage.getItem.mockRejectedValueOnce(new Error('storage read failed'))
    else f.storage.setItem.mockRejectedValueOnce(new Error('storage write failed'))
    await expect(f.service.setMasterEnabled(false)).resolves.toBeUndefined()
    expect(f.pending.size).toBe(0)
    f.api.scheduleNotificationAsync.mockClear()
    await f.service.afterCreate({ ...input, ritualAddress: 'B' })
    expect(f.api.scheduleNotificationAsync).not.toHaveBeenCalled()
    expect((await f.service.getPreferences())?.masterEnabled).toBe(false)
  })
  it('master off attempts every cancellation after native failure and keeps scheduling blocked', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    f.api.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('cancel failed'))
    await expect(f.service.setMasterEnabled(false)).resolves.toBeUndefined()
    expect(f.api.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(6)
    expect((await readReminderPreferences(f.storage)).masterEnabled).toBe(false)
    f.api.scheduleNotificationAsync.mockClear()
    await f.service.afterCreate({ ...input, ritualAddress: 'B' })
    expect(f.api.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
  it('master state survives an unavailable native module without rejecting', async () => {
    const f = fixture()
    f.loadNotifications.mockRejectedValue(new Error('missing native module'))
    await expect(f.service.setMasterEnabled(false)).resolves.toBeUndefined()
    expect((await readReminderPreferences(f.storage)).masterEnabled).toBe(false)
    await expect(f.service.getPermissionState()).resolves.toBeUndefined()
    await expect(f.service.afterCreate(input)).resolves.toBeUndefined()
  })
  it('on restores fresh chain dates and keeps persisted and newly observed exclusions', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    await f.service.afterStamp('A', 0)
    await f.service.setMasterEnabled(false)
    await f.service.setMasterEnabled(true)
    const updated = { ...input, stampedWeeks: [0], schedule: input.schedule.map((window) => ({
      opens: Number(window.opens) + 300, deadline: Number(window.deadline) + 300, resolution: Number(window.resolution) + 300,
    })) }
    await f.service.restore(updated)
    expect(f.pending.size).toBe(3)
    expect(f.pending.get(`${weekReminderPrefix('A', 1)}open`)?.trigger.date.getTime()).toBe(updated.schedule[1].opens * 1000)
    expect([...f.pending.keys()].every((id) => id.startsWith(weekReminderPrefix('A', 1)))).toBe(true)
    await f.service.restore({ ...updated, stampedWeeks: [1] })
    expect(f.pending.size).toBe(0)
    expect((await readReminderPreferences(f.storage)).rituals.A.stampedWeeks).toEqual([0, 1])
    expect(f.api.requestPermissionsAsync).not.toHaveBeenCalled()
  })
  it('restores never prompt, even if create happened while the master was off', async () => {
    const f = fixture()
    f.api.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    await f.service.setMasterEnabled(false)
    await f.service.afterCreate(input)
    await f.service.setMasterEnabled(true)
    await f.service.restore(input)
    expect(f.api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(f.pending.size).toBe(0)
    f.api.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false })
    await f.service.restore(input)
    expect(f.pending.size).toBe(6)
  })
  it('a stale restore cannot override per-ritual off, removal or master off', async () => {
    const f = fixture()
    await f.service.restore(input)
    expect((await readReminderPreferences(f.storage)).rituals.A).toBeUndefined()
    await f.service.afterCreate(input)
    await f.service.setRitualEnabled({ ...input, enabled: false })
    await f.service.restore(input)
    expect(f.pending.size).toBe(0)
    await f.service.forget('A')
    await f.service.restore(input)
    expect((await readReminderPreferences(f.storage)).rituals.A).toBeUndefined()
    await f.service.afterCreate(input)
    await f.service.setMasterEnabled(false)
    await f.service.restore(input)
    expect(f.pending.size).toBe(0)
  })
  it('per-ritual off/on keeps other rituals and stamped weeks untouched', async () => {
    const f = fixture()
    await f.service.afterCreate(input)
    await f.service.afterCreate({ ...demoInput, ritualAddress: 'B' })
    await f.service.afterStamp('A', 0)
    for (const id of f.pending.keys()) f.presented.add(id)
    expect(await f.service.setRitualEnabled({ ...input, enabled: false })).toBe(true)
    expect([...f.pending.keys()]).toEqual([`${weekReminderPrefix('B', 0)}open`])
    expect([...f.presented]).toEqual([`${weekReminderPrefix('B', 0)}open`])
    expect(await f.service.setRitualEnabled(input)).toBe(true)
    expect(f.pending.size).toBe(4)
    expect(f.pending.has(`${weekReminderPrefix('A', 0)}open`)).toBe(false)
  })
  it('reads permission afresh without prompting or scheduling, including after revocation', async () => {
    const f = fixture()
    expect(await f.service.getPermissionState()).toBe('on')
    f.api.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false })
    expect(await f.service.getPermissionState()).toBe('off')
    expect(f.api.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(f.api.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
})
