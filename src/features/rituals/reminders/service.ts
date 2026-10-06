import { logFailure, logNote } from '../../../utils/diagnostics'
import { isRealReminderWindow, planReminders, reminderPrefix, weekReminderPrefix, type ReminderOptions, type ReminderWindow } from './planner'
import { clearReminderPrefix, REMINDERS_CHANNEL, scheduleReminderPlan, type ReminderNotifications } from './scheduler'
import { readReminderPreferences, writeReminderPreferences, type ReminderStorage } from './storage'

export type CreateReminderInput = Omit<ReminderOptions, 'nowSeconds' | 'stampedWeeks'> & {
  schedule: readonly ReminderWindow[]
  enabled: boolean
}

/** One instance per app. Serializes permission, storage and native changes so
 * two creates cannot prompt twice, and a stamp/removal cannot race a schedule.
 * This is best-effort UI support: failures never reject into wallet actions. */
export function createReminderService(deps: {
  storage: ReminderStorage
  loadNotifications: () => Promise<ReminderNotifications>
  nowSeconds: () => number
}) {
  let queue = Promise.resolve()
  const run = (action: () => Promise<void>): Promise<void> => {
    queue = queue.then(action).catch((error: unknown) => logFailure('reminders', error))
    return queue
  }
  return {
    prepare: (): Promise<void> => run(async () => { await deps.loadNotifications() }),
    afterCreate: (input: CreateReminderInput): Promise<void> => run(async () => {
      const preferences = await readReminderPreferences(deps.storage)
      const real = input.schedule.slice(0, 16).some(isRealReminderWindow)
      const previous = preferences.rituals[input.ritualAddress]
      const preference = { enabled: real && input.enabled, stampedWeeks: previous?.stampedWeeks ?? [] }
      preferences.rituals[input.ritualAddress] = preference
      await writeReminderPreferences(deps.storage, preferences)
      // A new Demo/off create never loads the SDK or requests permission.
      if (!preference.enabled) {
        if (previous?.enabled) await clearReminderPrefix(await deps.loadNotifications(), reminderPrefix(input.ritualAddress))
        return
      }
      const notifications = await deps.loadNotifications()
      // Android 13 needs a channel before the permission dialog.
      await notifications.setNotificationChannelAsync(REMINDERS_CHANNEL, { name: 'Rituals', importance: 3 })
      let permission = await notifications.getPermissionsAsync()
      if (!permission.granted && !preferences.permissionAsked && permission.canAskAgain) {
        preferences.permissionAsked = true
        await writeReminderPreferences(deps.storage, preferences)
        permission = { ...permission, ...await notifications.requestPermissionsAsync() }
      }
      if (!permission.granted) { logNote('reminders', 'Permission not granted; no reminders scheduled.'); return }
      const prefix = reminderPrefix(input.ritualAddress)
      await clearReminderPrefix(notifications, prefix)
      const plan = planReminders(input.schedule, { ...input, nowSeconds: deps.nowSeconds(), stampedWeeks: preference.stampedWeeks })
      try {
        const count = await scheduleReminderPlan(notifications, plan, deps.nowSeconds)
        logNote('reminders', `Scheduled ${count} local reminders.`)
      } catch (error) {
        // Roll back a partial native set rather than imply all weeks are covered.
        await clearReminderPrefix(notifications, prefix).catch((cleanup: unknown) => logFailure('reminders rollback', cleanup))
        throw error
      }
    }),
    afterStamp: (address: string, eventIndex: number): Promise<void> => run(async () => {
      if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex >= 16) return
      try {
        const preferences = await readReminderPreferences(deps.storage)
        const preference = preferences.rituals[address]
        // Retain the stamp even if create scheduling is retried later.
        preferences.rituals[address] = { enabled: preference?.enabled ?? false,
          stampedWeeks: [...new Set([...(preference?.stampedWeeks ?? []), eventIndex])] }
        await writeReminderPreferences(deps.storage, preferences)
      } finally {
        await clearReminderPrefix(await deps.loadNotifications(), weekReminderPrefix(address, eventIndex))
        logNote('reminders', `Cleared week ${eventIndex + 1}.`)
      }
    }),
    forget: (address: string): Promise<void> => run(async () => {
      try {
        const preferences = await readReminderPreferences(deps.storage)
        delete preferences.rituals[address]
        await writeReminderPreferences(deps.storage, preferences)
      } finally {
        await clearReminderPrefix(await deps.loadNotifications(), reminderPrefix(address))
        logNote('reminders', 'Cleared ritual reminders.')
      }
    }),
  }
}
