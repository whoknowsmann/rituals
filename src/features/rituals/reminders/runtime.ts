import AsyncStorage from '@react-native-async-storage/async-storage'
import { createReminderService } from './service'
import type { ReminderNotifications } from './scheduler'

let notifications: ReminderNotifications | undefined

export const reminders = createReminderService({
  storage: AsyncStorage,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  loadNotifications: async () => {
    // Metro's literal require stays lazy; this repo targets ES2015 modules.
    if (!notifications) {
      const native = require('./native') as typeof import('./native')
      notifications = native.nativeReminderNotifications()
    }
    return notifications
  },
})

export const clearRitualReminders = reminders.forget
