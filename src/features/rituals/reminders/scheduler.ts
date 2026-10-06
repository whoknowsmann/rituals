import type { Reminder } from './planner'

export const REMINDERS_CHANNEL = 'rituals-reminders'
export type ReminderRequest = {
  identifier: string
  content: { title: string; body: string; sound: 'default' }
  trigger: { type: 'date'; date: Date; channelId: string }
}
/** Native-free port: the only SDK translation lives in native.ts. */
export interface ReminderNotifications {
  setNotificationChannelAsync(id: string, channel: { name: string; importance: 3 }): Promise<unknown>
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>
  requestPermissionsAsync(): Promise<{ granted: boolean }>
  scheduleNotificationAsync(request: ReminderRequest): Promise<string>
  getAllScheduledNotificationsAsync(): Promise<readonly { identifier: string }[]>
  cancelScheduledNotificationAsync(identifier: string): Promise<void>
}

export async function clearReminderPrefix(notifications: ReminderNotifications, prefix: string): Promise<void> {
  const scheduled = await notifications.getAllScheduledNotificationsAsync()
  const results = await Promise.allSettled(scheduled.filter((item) => item.identifier.startsWith(prefix))
    .map((item) => notifications.cancelScheduledNotificationAsync(item.identifier)))
  // Try every matching cancellation even if one fails.
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

export async function scheduleReminderPlan(notifications: ReminderNotifications, plan: readonly Reminder[], nowSeconds: () => number): Promise<number> {
  let count = 0
  for (const reminder of plan) {
    // Permission dialogs can outlast week one's opening. Never turn a past
    // date into an immediate notification after the dialog closes.
    if (reminder.at <= nowSeconds()) continue
    await notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body, sound: 'default' },
      trigger: { type: 'date', date: new Date(reminder.at * 1000), channelId: REMINDERS_CHANNEL },
    })
    count += 1
  }
  return count
}
