import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { ReminderNotifications } from './scheduler'

/** Loaded only inside the service's try/catch. Old binaries without the
 * native module can still create, stamp and remove rituals. No push tokens. */
export function nativeReminderNotifications(): ReminderNotifications {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Demo windows are shorter than Android's delivery tolerance. Never
      // interrupt the foreground app with them; Real-weeks behavior is unchanged.
      const show = notification.request.content.data?.ritualReminder !== 'demo'
      return { shouldShowAlert: show, shouldPlaySound: show, shouldSetBadge: false }
    },
  })
  return {
    setNotificationChannelGroupAsync: async (id, group) => Platform.OS === 'android'
      ? Notifications.setNotificationChannelGroupAsync(id, group) : null,
    setNotificationChannelAsync: async (id, channel) => Platform.OS === 'android'
      ? Notifications.setNotificationChannelAsync(id, { ...channel, importance: channel.importance === 'low'
        ? Notifications.AndroidImportance.LOW : Notifications.AndroidImportance.DEFAULT }) : null,
    getPermissionsAsync: () => Notifications.getPermissionsAsync(),
    requestPermissionsAsync: () => Notifications.requestPermissionsAsync(),
    getAllScheduledNotificationsAsync: () => Notifications.getAllScheduledNotificationsAsync(),
    cancelScheduledNotificationAsync: (id) => Notifications.cancelScheduledNotificationAsync(id),
    getPresentedNotificationsAsync: () => Notifications.getPresentedNotificationsAsync(),
    dismissNotificationAsync: (id) => Notifications.dismissNotificationAsync(id),
    scheduleNotificationAsync: (request) => Notifications.scheduleNotificationAsync({ ...request,
      trigger: { ...request.trigger, type: Notifications.SchedulableTriggerInputTypes.DATE },
    }),
  }
}
