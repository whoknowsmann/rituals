import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { nativeReminderNotifications } from './native'
import { clearReminderPrefix } from './scheduler'

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(), setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(), getAllScheduledNotificationsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(), getPresentedNotificationsAsync: vi.fn(), dismissNotificationAsync: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  Platform.OS = 'android'
  vi.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([])
  vi.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([])
})

describe('Expo 0.29 reminder adapter (mocked native modules)', () => {
  it('initialization only installs the foreground handler, without permission or scheduling', () => {
    nativeReminderNotifications()
    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1)
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled()
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
  it.each(['demo', 'real', undefined] as const)('foreground policy for %s preserves Real alerts but suppresses Demo alert and sound', async (speed) => {
    nativeReminderNotifications()
    const handler = vi.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!
    const notification = { request: { content: { data: speed ? { ritualReminder: speed } : {} } } } as Notifications.Notification
    expect(await handler.handleNotification(notification)).toEqual({
      shouldShowAlert: speed !== 'demo', shouldPlaySound: speed !== 'demo', shouldSetBadge: false,
    })
  })
  it('preserves demo metadata and absolute date/channel through the native adapter', async () => {
    const request = { identifier: 'rituals:reminders:v1:A:0:open',
      content: { title: 'Read', body: 'Demo week 1: stamp by 2026-10-07 18:30:45 UTC.', sound: 'default' as const,
        data: { ritualReminder: 'demo' as const } },
      trigger: { type: 'date' as const, date: new Date('2026-10-07T18:30:00Z'), channelId: 'rituals-reminders' } }
    await nativeReminderNotifications().scheduleNotificationAsync(request)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledExactlyOnceWith(request)
  })
  it('maps both pending cancellation and tray dismissal to Expo identifiers in that order', async () => {
    const id = 'rituals:reminders:v1:A:0:open'
    vi.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([{ identifier: id } as Notifications.NotificationRequest])
    vi.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([{ request: { identifier: id } } as Notifications.Notification])
    await clearReminderPrefix(nativeReminderNotifications(), 'rituals:reminders:v1:A:0:')
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(id)
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(id)
    expect(vi.mocked(Notifications.cancelScheduledNotificationAsync).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(Notifications.getPresentedNotificationsAsync).mock.invocationCallOrder[0])
  })
  it('keeps Android channel importance at default and skips channel creation on iOS', async () => {
    const adapter = nativeReminderNotifications()
    await adapter.setNotificationChannelAsync('rituals-reminders', { name: 'Rituals', importance: 3 })
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledExactlyOnceWith('rituals-reminders', { name: 'Rituals', importance: 3 })
    Platform.OS = 'ios'
    await adapter.setNotificationChannelAsync('rituals-reminders', { name: 'Rituals', importance: 3 })
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1)
  })
})
