import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { ReminderNotifications } from './scheduler'

/** Loaded only inside the service's try/catch. Old binaries without the
 * native module can still create, stamp and remove rituals. No push tokens. */
export function nativeReminderNotifications(): ReminderNotifications {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
  return {
    setNotificationChannelAsync: async (id, channel) => Platform.OS === 'android'
      ? Notifications.setNotificationChannelAsync(id, { ...channel, importance: Notifications.AndroidImportance.DEFAULT }) : null,
    getPermissionsAsync: () => Notifications.getPermissionsAsync(),
    requestPermissionsAsync: () => Notifications.requestPermissionsAsync(),
    getAllScheduledNotificationsAsync: () => Notifications.getAllScheduledNotificationsAsync(),
    cancelScheduledNotificationAsync: (id) => Notifications.cancelScheduledNotificationAsync(id),
    scheduleNotificationAsync: (request) => Notifications.scheduleNotificationAsync({ ...request,
      trigger: { ...request.trigger, type: Notifications.SchedulableTriggerInputTypes.DATE },
    }),
  }
}
