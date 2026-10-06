import AsyncStorage from '@react-native-async-storage/async-storage'
import { createReminderService } from './service'

export const reminders = createReminderService({
  storage: AsyncStorage,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  loadNotifications: async () => {
    // Metro's literal require stays lazy; this repo targets ES2015 modules.
    const native = require('./native') as typeof import('./native')
    return native.nativeReminderNotifications()
  },
})

export const clearRitualReminders = reminders.forget
