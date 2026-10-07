import { logFailure, logNote } from '../../../utils/diagnostics'
import { isDemoReminderWindow, isRealReminderWindow, planReminders, REMINDERS_PREFIX, reminderPrefix, weekReminderPrefix, type ReminderOptions, type ReminderWindow } from './planner'
import { clearReminderPrefix, ensureReminderChannels, scheduleReminderPlan, type ReminderNotifications } from './scheduler'
import { readReminderPreferences, writeReminderPreferences, type ReminderStorage } from './storage'

export type CreateReminderInput = Omit<ReminderOptions, 'nowSeconds'> & {
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
  let blockedInSession = false
  const run = <T>(action: () => Promise<T>): Promise<T | undefined> => {
    const result = queue.then(action).catch((error: unknown) => { logFailure('reminders', error); return undefined })
    queue = result.then(() => undefined)
    return result
  }
  const schedule = async (input: CreateReminderInput, restoring: boolean): Promise<boolean> => {
      const preferences = await readReminderPreferences(deps.storage)
      const eligible = input.schedule.slice(0, 16).some((window) => isRealReminderWindow(window) || isDemoReminderWindow(window))
      const previous = preferences.rituals[input.ritualAddress]
      // A stale chain read must not re-enable a ritual removed or switched off meanwhile.
      if (restoring && !previous?.enabled) return true
      const preference = { enabled: eligible && input.enabled,
        stampedWeeks: [...new Set([...(previous?.stampedWeeks ?? []), ...(input.stampedWeeks ?? [])])] }
      preferences.rituals[input.ritualAddress] = preference
      await writeReminderPreferences(deps.storage, preferences)
      // A new opt-out or invalid schedule never loads the SDK or requests permission.
      if (!preference.enabled) {
        if (previous?.enabled) await clearReminderPrefix(await deps.loadNotifications(), reminderPrefix(input.ritualAddress))
        return true
      }
      // Retain per-ritual choices while globally paused; no SDK load or prompt.
      if (!preferences.masterEnabled || blockedInSession) return true
      const notifications = await deps.loadNotifications()
      // Android 13 needs a channel before the permission dialog.
      await ensureReminderChannels(notifications)
      let permission = await notifications.getPermissionsAsync()
      if (blockedInSession) return true
      if (!restoring && !permission.granted && !preferences.permissionAsked && permission.canAskAgain) {
        preferences.permissionAsked = true
        await writeReminderPreferences(deps.storage, preferences)
        permission = { ...permission, ...await notifications.requestPermissionsAsync() }
      }
      if (!permission.granted) { logNote('reminders', 'Permission not granted; no reminders scheduled.'); return true }
      if (blockedInSession) return true
      const prefix = reminderPrefix(input.ritualAddress)
      await clearReminderPrefix(notifications, prefix)
      const plan = planReminders(input.schedule, { ...input, nowSeconds: deps.nowSeconds(), stampedWeeks: preference.stampedWeeks })
      try {
        const count = await scheduleReminderPlan(notifications, plan, deps.nowSeconds, () => !blockedInSession)
        logNote('reminders', `Scheduled ${count} local reminders.`)
      } catch (error) {
        // Roll back a partial native set rather than imply all weeks are covered.
        await clearReminderPrefix(notifications, prefix).catch((cleanup: unknown) => logFailure('reminders rollback', cleanup))
        throw error
      }
      return true
  }
  return {
    prepare: (): Promise<void> => run(async () => { await ensureReminderChannels(await deps.loadNotifications()) }),
    getPreferences: () => run(async () => {
      const preferences = await readReminderPreferences(deps.storage)
      return { ...preferences, masterEnabled: preferences.masterEnabled && !blockedInSession }
    }),
    getPermissionState: () => run(async (): Promise<'on' | 'off'> => {
      const notifications = await deps.loadNotifications()
      await ensureReminderChannels(notifications)
      return (await notifications.getPermissionsAsync()).granted ? 'on' : 'off'
    }),
    setMasterEnabled: (enabled: boolean): Promise<boolean | undefined> => {
      // Even a failed disk write must stop further scheduling in this process.
      if (!enabled) blockedInSession = true
      return run(async () => {
        try {
          const preferences = await readReminderPreferences(deps.storage)
          preferences.masterEnabled = enabled
          await writeReminderPreferences(deps.storage, preferences)
          if (enabled) blockedInSession = false
        } finally {
          if (!enabled) await clearReminderPrefix(await deps.loadNotifications(), REMINDERS_PREFIX)
        }
        return true
      })
    },
    // Chain reads happen outside the serialized queue so offline Settings never
    // hold up stamp/removal cleanup. Recheck consent here after every read.
    restore: (input: CreateReminderInput) => run(() => schedule(input, true)),
    setRitualEnabled: (input: CreateReminderInput) => run(() => schedule(input, false)),
    afterCreate: (input: CreateReminderInput): Promise<void> => run(async () => { await schedule(input, false) }),
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
