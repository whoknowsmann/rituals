import { demoReminderLine, reminderLine, type ReminderKind } from './lines'

/** Structural match for RitualAccountView.schedule; no native or chain SDK. */
export type ReminderWindow = Readonly<{ opens: number | bigint; deadline: number | bigint; resolution: number | bigint }>
export type ReminderOptions = Readonly<{
  ritualAddress: string
  ritualTitle: string
  stakeLabel: string
  causeLabel: string
  nowSeconds: number
  /** Zero-based on-chain event indices already stamped, skipped or closed. */
  stampedWeeks?: readonly number[]
}>
export type Reminder = Readonly<{ id: string; at: number; title: string; body: string; kind: ReminderKind; demo: boolean }>
export const MAX_REMINDER_WEEKS = 16
export const REMINDER_DAY_SECONDS = 86400
export const reminderPrefix = (address: string): string => `rituals:reminders:v1:${address}:`
export const weekReminderPrefix = (address: string, eventIndex: number): string => `${reminderPrefix(address)}${eventIndex}:`

export type ReminderObservation = {
  eventIndex: number | undefined
  stamped: boolean
  skippedEventIndex?: number
  schedule?: readonly ReminderWindow[]
  nowSeconds?: number
  completed?: boolean
}
/** A skipped result can describe the previous week while the model's current
 * index has already advanced. Only the account's skipEventIndex is safe. */
export function observedReminderWeeks(observed?: ReminderObservation): readonly number[] {
  const weeks = [observed?.stamped ? observed.eventIndex : undefined, observed?.skippedEventIndex]
  observed?.schedule?.slice(0, MAX_REMINDER_WEEKS).forEach((window, index) => {
    const advanced = observed.eventIndex !== undefined && Number.isInteger(observed.eventIndex)
      && observed.eventIndex <= MAX_REMINDER_WEEKS && index < observed.eventIndex
    const expired = observed.nowSeconds !== undefined && Number.isFinite(observed.nowSeconds)
      && (isDemoReminderWindow(window) || isRealReminderWindow(window)) && observed.nowSeconds > Number(window.deadline)
    if (observed.completed || advanced || expired) weeks.push(index)
  })
  return [...new Set(weeks)]
    .filter((index): index is number => index !== undefined && Number.isInteger(index) && index >= 0 && index < MAX_REMINDER_WEEKS)
}

export function isRealReminderWindow(window: ReminderWindow): boolean {
  const times = [window.opens, window.deadline, window.resolution].map(Number)
  return times.every((time) => Number.isSafeInteger(time) && time >= 0 && time <= 8_640_000_000_000)
    && times[1] - times[0] >= REMINDER_DAY_SECONDS && times[2] > times[1]
}

/** A demo-speed window: valid times, shorter than a day. */
export function isDemoReminderWindow(window: ReminderWindow): boolean {
  const times = [window.opens, window.deadline, window.resolution].map(Number)
  return times.every((time) => Number.isSafeInteger(time) && time >= 0 && time <= 8_640_000_000_000)
    && times[1] > times[0] && times[1] - times[0] < REMINDER_DAY_SECONDS && times[2] > times[1]
}

/** Future-only absolute chain times. Never infer cadence from the phone clock. */
export function planReminders(schedule: readonly ReminderWindow[], options: ReminderOptions): readonly Reminder[] {
  if (!Number.isFinite(options.nowSeconds)) return []
  const plan: Reminder[] = []
  const title = Array.from(options.ritualTitle.trim() || 'Your ritual').slice(0, 60).join('')
  schedule.slice(0, MAX_REMINDER_WEEKS).forEach((window, eventIndex) => {
    if (options.stampedWeeks?.includes(eventIndex)) return
    const demo = isDemoReminderWindow(window)
    if (!demo && !isRealReminderWindow(window)) return
    const opens = Number(window.opens)
    const deadline = Number(window.deadline)
    // Demo speed (1-minute weeks): one opening request, no day/hour nudges.
    const times: readonly [ReminderKind, number][] = demo
      ? [['open', opens]]
      : [['open', opens], ['day', deadline - REMINDER_DAY_SECONDS], ['hour', deadline - 3600]]
    const seen = new Set<number>()
    for (const [kind, at] of times) {
      // A precisely one-day window has coincident open/day reminders: one is enough.
      if (at <= options.nowSeconds || at < opens || at >= deadline || seen.has(at)) continue
      seen.add(at)
      plan.push({ id: `${weekReminderPrefix(options.ritualAddress, eventIndex)}${kind}`, at, title, kind, demo,
        body: demo ? demoReminderLine(eventIndex + 1, deadline)
          : reminderLine(kind, options.ritualAddress, eventIndex + 1, options.stakeLabel, options.causeLabel) })
    }
  })
  return plan.sort((left, right) => left.at - right.at)
}
