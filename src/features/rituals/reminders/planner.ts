import { reminderLine, type ReminderKind } from './lines'

/** Structural match for RitualAccountView.schedule; no native or chain SDK. */
export type ReminderWindow = Readonly<{ opens: number | bigint; deadline: number | bigint; resolution: number | bigint }>
export type ReminderOptions = Readonly<{
  ritualAddress: string
  ritualTitle: string
  stakeLabel: string
  causeLabel: string
  nowSeconds: number
  /** Zero-based on-chain event indices, including declared skips. */
  stampedWeeks?: readonly number[]
}>
export type Reminder = Readonly<{ id: string; at: number; title: string; body: string }>
export const MAX_REMINDER_WEEKS = 16
export const REMINDER_DAY_SECONDS = 86400
export const reminderPrefix = (address: string): string => `rituals:reminders:v1:${address}:`
export const weekReminderPrefix = (address: string, eventIndex: number): string => `${reminderPrefix(address)}${eventIndex}:`

export type ReminderObservation = { eventIndex: number | undefined; stamped: boolean; skippedEventIndex?: number }
/** A skipped result can describe the previous week while the model's current
 * index has already advanced. Only the account's skipEventIndex is safe. */
export function observedReminderWeeks(observed?: ReminderObservation): readonly number[] {
  return [...new Set([observed?.stamped ? observed.eventIndex : undefined, observed?.skippedEventIndex])]
    .filter((index): index is number => index !== undefined && Number.isInteger(index) && index >= 0 && index < MAX_REMINDER_WEEKS)
}

export function isRealReminderWindow(window: ReminderWindow): boolean {
  const times = [window.opens, window.deadline, window.resolution].map(Number)
  return times.every((time) => Number.isSafeInteger(time) && time >= 0 && time <= 8_640_000_000_000)
    && times[1] - times[0] >= REMINDER_DAY_SECONDS && times[2] > times[1]
}

/** Future-only absolute chain times. Never infer cadence from the phone clock. */
export function planReminders(schedule: readonly ReminderWindow[], options: ReminderOptions): readonly Reminder[] {
  if (!Number.isFinite(options.nowSeconds)) return []
  const plan: Reminder[] = []
  const title = Array.from(options.ritualTitle.trim() || 'Your ritual').slice(0, 60).join('')
  schedule.slice(0, MAX_REMINDER_WEEKS).forEach((window, eventIndex) => {
    if (!isRealReminderWindow(window) || options.stampedWeeks?.includes(eventIndex)) return
    const opens = Number(window.opens)
    const deadline = Number(window.deadline)
    const times: readonly [ReminderKind, number][] = [['open', opens], ['day', deadline - REMINDER_DAY_SECONDS], ['hour', deadline - 3600]]
    const seen = new Set<number>()
    for (const [kind, at] of times) {
      // A precisely one-day window has coincident open/day reminders: one is enough.
      if (at <= options.nowSeconds || at < opens || at >= deadline || seen.has(at)) continue
      seen.add(at)
      plan.push({ id: `${weekReminderPrefix(options.ritualAddress, eventIndex)}${kind}`, at, title,
        body: reminderLine(kind, options.ritualAddress, eventIndex + 1, options.stakeLabel, options.causeLabel) })
    }
  })
  return plan.sort((left, right) => left.at - right.at)
}
