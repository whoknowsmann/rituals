import type { Reminder } from './planner'

// Leave the legacy rituals-reminders channel intact for already queued alerts.
export const REMINDERS_CHANNEL_GROUP = 'rituals'
export const REMINDER_CHANNELS = {
  open: { id: 'rituals-week-opens', name: 'Week opens', importance: 'default' },
  day: { id: 'rituals-one-day-left', name: 'One day left', importance: 'default' },
  hour: { id: 'rituals-last-hour', name: 'Last hour', importance: 'default' },
  demo: { id: 'rituals-demo-weeks', name: 'Demo weeks', importance: 'low' },
} as const
export type ReminderRequest = {
  identifier: string
  content: { title: string; body: string; sound: 'default'; data: { ritualReminder: 'demo' | 'real' } }
  trigger: { type: 'date'; date: Date; channelId: string }
}
/** Native-free port: the only SDK translation lives in native.ts. */
export interface ReminderNotifications {
  setNotificationChannelGroupAsync(id: string, group: { name: string }): Promise<unknown>
  setNotificationChannelAsync(id: string, channel: { name: string; importance: 'default' | 'low'; groupId: string; sound: 'default' }): Promise<unknown>
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>
  requestPermissionsAsync(): Promise<{ granted: boolean }>
  scheduleNotificationAsync(request: ReminderRequest): Promise<string>
  getAllScheduledNotificationsAsync(): Promise<readonly { identifier: string }[]>
  cancelScheduledNotificationAsync(identifier: string): Promise<void>
  getPresentedNotificationsAsync(): Promise<readonly { request: { identifier: string } }[]>
  dismissNotificationAsync(identifier: string): Promise<void>
}

export async function ensureReminderChannels(notifications: ReminderNotifications): Promise<void> {
  await notifications.setNotificationChannelGroupAsync(REMINDERS_CHANNEL_GROUP, { name: 'Rituals' })
  for (const { id, ...channel } of Object.values(REMINDER_CHANNELS)) {
    // Android retains the user's settings when an existing channel is created again.
    await notifications.setNotificationChannelAsync(id, { ...channel, groupId: REMINDERS_CHANNEL_GROUP, sound: 'default' })
  }
}

async function clearMatching(ids: readonly string[], prefix: string, clear: (id: string) => Promise<void>): Promise<void> {
  const results = await Promise.allSettled(ids.filter((id) => id.startsWith(prefix)).map(async (id) => clear(id)))
  // Try every matching cancellation even if one fails.
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

export async function clearReminderPrefix(notifications: ReminderNotifications, prefix: string): Promise<void> {
  try {
    await clearMatching((await notifications.getAllScheduledNotificationsAsync()).map((item) => item.identifier),
      prefix, (id) => notifications.cancelScheduledNotificationAsync(id))
  } finally {
    // Cancel alarms first, then inspect the tray to catch an alert delivered
    // during cancellation. A failed queue read must not prevent tray cleanup.
    await clearMatching((await notifications.getPresentedNotificationsAsync()).map((item) => item.request.identifier),
      prefix, (id) => notifications.dismissNotificationAsync(id))
  }
}

export async function scheduleReminderPlan(notifications: ReminderNotifications, plan: readonly Reminder[], nowSeconds: () => number, maySchedule: () => boolean = () => true): Promise<number> {
  let count = 0
  for (const reminder of plan) {
    if (!maySchedule()) break
    // Permission dialogs can outlast week one's opening. Never turn a past
    // date into an immediate notification after the dialog closes.
    if (reminder.at <= nowSeconds()) continue
    await notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body, sound: 'default', data: { ritualReminder: reminder.demo ? 'demo' : 'real' } },
      trigger: { type: 'date', date: new Date(reminder.at * 1000), channelId: REMINDER_CHANNELS[reminder.demo ? 'demo' : reminder.kind].id },
    })
    count += 1
  }
  return count
}
