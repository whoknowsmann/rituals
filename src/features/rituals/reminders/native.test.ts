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
