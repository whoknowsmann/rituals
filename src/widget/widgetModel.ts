import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { color } from '../theme/tokens'

export type WidgetKnown = Readonly<{ address: string; title: string }>
export type WeekOutcome = 'pending' | 'kept' | 'missed' | 'skipped' | 'unknown'
export type WidgetWeek = Readonly<{ opens: number; deadline: number; outcome: WeekOutcome }>
export type WidgetRitual = Readonly<{
  address: string; title: string; stakeLabel: string; causeLabel: string
  active: boolean; weeks: readonly WidgetWeek[]; tint: string
}>
export type WidgetOutcome = Omit<WidgetRitual, 'title' | 'tint'>
/** All candidates, in remembered (oldest-first) order, for clock-only selection. */
export type WidgetSnapshot = Readonly<{ rituals: readonly WidgetRitual[] }>
export type WidgetState = 'open' | 'concerned' | 'alarmed' | 'stamped' | 'missed' | 'resting' | 'finished' | 'empty' | 'closing'
export type StampFace = 'calm' | 'side-eye' | 'alarmed' | 'joyful' | 'sad' | 'resting' | 'content' | 'expectant' | 'neutral'
export type WidgetDot = 'kept' | 'missed' | 'upcoming' | 'current' | 'skipped' | 'unknown'
export type WidgetModel = Readonly<{
  title: string; state: WidgetState; face: StampFace; streak: number
  dots: readonly WidgetDot[]
  /** One action block, including timing and stake; at most three authored lines. */
  line: string; tint: string; ink: string; seal: string
}>

/** Seconds, inclusive deadline. Absolute urgency floors apply only to >= 1-day windows. */
export const WIDGET_THRESHOLDS = {
  concernedRemaining: 1 / 3,
  alarmedRemaining: 0.15,
  realWindowSeconds: 86400,
  daySeconds: 86400,
  hourSeconds: 3600,
} as const
export const WIDGET_LIME = '#C8F560'

function openWeek(ritual: WidgetRitual, now: number): WidgetWeek | undefined {
  return ritual.active ? ritual.weeks.find((week) => week.outcome === 'pending' && now >= week.opens && now <= week.deadline) : undefined
}

export function buildWidgetSnapshot(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[]): WidgetSnapshot | null {
  const rituals = known.flatMap((item) => {
    const outcome = outcomes.find((entry) => entry.address === item.address)
    return outcome ? [{ ...outcome, title: item.title, tint: ritualTintAmong(item.address, known) }] : []
  })
  return rituals.length ? { rituals } : null
}

export function selectWidgetSnapshot(snapshot: WidgetSnapshot | null, now: number): WidgetRitual | null {
  const newest = [...(snapshot?.rituals ?? [])].reverse()
  const urgent = newest.filter((ritual) => openWeek(ritual, now))
  // Stable sort keeps newest first on equal deadlines.
  urgent.sort((a, b) => openWeek(a, now)!.deadline - openWeek(b, now)!.deadline)
  return urgent[0] ?? newest.find((ritual) => ritual.active) ?? newest[0] ?? null
}

/**
 * Consecutive KEPT weeks backwards from the latest decided week. Confirmed
 * current stamps are stored as kept, even before settlement. An open unstamped
 * week (or a future week) is ignored. Miss/skip/unread closed history stops the
 * run; a skip is not a stamp. Expiry alone is NOT proof of a miss or transfer.
 */
export function widgetStreak(weeks: readonly WidgetWeek[], now: number): number {
  let streak = 0
  for (let index = weeks.length - 1; index >= 0; index--) {
    const week = weeks[index]
    if (week.opens > now) continue
    if (week.outcome === 'pending' && now <= week.deadline) continue
    if (week.outcome !== 'kept') break
    streak++
  }
  return streak
}

export function openWidgetState(week: WidgetWeek, now: number): 'open' | 'concerned' | 'alarmed' {
  const span = week.deadline - week.opens
  const remaining = week.deadline - now
  const real = span >= WIDGET_THRESHOLDS.realWindowSeconds
  if (remaining <= span * WIDGET_THRESHOLDS.alarmedRemaining || (real && remaining <= WIDGET_THRESHOLDS.hourSeconds)) return 'alarmed'
  if (remaining <= span * WIDGET_THRESHOLDS.concernedRemaining || (real && remaining <= WIDGET_THRESHOLDS.daySeconds)) return 'concerned'
  return 'open'
}

const fits = (line: string) => Array.from(line).length <= 30
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Device-local chain opening, not a countdown that would go stale between updates.
 * displayFormat.weekOpensLabel includes minute countdowns/date/AM-PM: too long here.
 */
export function widgetOpening(week: number, opens: number, withTime = false): string {
  const date = new Date(opens * 1000)
  const time = withTime ? ` ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}` : ''
  return `Week ${week} opens ${weekdays[date.getDay()]}${time}`
}

/** Floor coarse units: never promise more whole days/hours than remain. */
export function widgetTimeLeft(week: WidgetWeek, now: number): string {
  const { realWindowSeconds, daySeconds, hourSeconds } = WIDGET_THRESHOLDS
  if (week.deadline - week.opens < realWindowSeconds) return 'now'
  const seconds = Math.max(0, week.deadline - now)
  if (seconds <= hourSeconds) return 'last hour'
  if (seconds < daySeconds) return `${Math.floor(seconds / hourSeconds)}h left`
  const days = Math.floor(seconds / daySeconds)
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

/** Home's punch-card language, without treating expired/unread weeks as misses. */
export function widgetDots(ritual: WidgetRitual, now: number): WidgetDot[] {
  return ritual.weeks.map((week) => {
    if (week.outcome !== 'pending') return week.outcome
    if (week.opens > now) return 'upcoming'
    return ritual.active && now <= week.deadline ? 'current' : 'unknown'
  })
}

export function widgetModel(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[], now: number): WidgetModel {
  return widgetModelFromSnapshot(buildWidgetSnapshot(known, outcomes), now)
}

export function widgetModelFromSnapshot(snapshot: WidgetSnapshot | null, now: number): WidgetModel {
  const ritual = selectWidgetSnapshot(snapshot, now)
  if (!ritual) return { title: '', state: 'empty', face: 'expectant', streak: 0, dots: [], line: 'Start a ritual', tint: color.bg, ink: color.fg, seal: WIDGET_LIME }
  const { weeks, stakeLabel, causeLabel } = ritual
  const streak = widgetStreak(weeks, now)
  const base = { title: ritual.title, streak, dots: widgetDots(ritual, now), tint: ritual.tint, ink: color.fg, seal: WIDGET_LIME }
  // A pathological amount is replaced in full, never rounded or clipped into another amount.
  const stake = fits(`${stakeLabel} on the line`) ? stakeLabel : 'Your stake'
  const terms = fits(`${stakeLabel} / week`) ? `${stakeLabel} / week` : 'Stake per week · open app'
  const kept = weeks.filter((week) => week.outcome === 'kept').length
  if (!ritual.active) return { ...base, state: 'finished', face: kept > weeks.length / 2 ? 'content' : 'neutral', line: `Done · ${kept} of ${weeks.length} kept\n${terms}`, ink: kept > weeks.length / 2 ? color.stampInk : color.fg, seal: color.card }
  const current = weeks.findIndex((week, index) => now >= week.opens && (index === weeks.length - 1 || now < weeks[index + 1].opens))
  const week = weeks[current]
  const next = weeks.findIndex((entry) => entry.opens > now)
  if (week?.outcome === 'kept' && (now <= week.deadline || current === weeks.length - 1)) return { ...base, state: 'stamped', face: 'joyful', line: [`Week ${current + 1} stamped`, ...(next >= 0 ? [widgetOpening(next + 1, weeks[next].opens)] : []), terms].join('\n'), ink: color.stampInk, seal: color.card }
  if (week?.outcome === 'pending' && now <= week.deadline) {
    const state = openWidgetState(week, now)
    const line = `Stamp week ${current + 1} · ${widgetTimeLeft(week, now)}\n${stake} on the line`
    return { ...base, state, face: state === 'open' ? 'calm' : state === 'concerned' ? 'side-eye' : 'alarmed', line }
  }
  if (week?.outcome === 'missed') {
    // No guessed cause short names. Keep a short stored name, otherwise use the generic destination.
    const receipt = `${stakeLabel} to ${causeLabel}`
    const amountOnly = `${stakeLabel} to your cause`
    return { ...base, state: 'missed', face: 'sad', line: `Missed week ${current + 1}\n${fits(receipt) ? receipt : fits(amountOnly) ? amountOnly : 'Stake to your cause'}`, ink: color.stampQuiet, seal: color.paperMuted }
  }
  if (week && (week.outcome === 'pending' || week.outcome === 'unknown')) return { ...base, state: 'closing', face: 'neutral', line: `Week ${current + 1} closed · open app\n${terms}`, ink: color.fg, seal: color.card }
  return { ...base, state: 'resting', face: 'resting', line: `${next >= 0 ? widgetOpening(next + 1, weeks[next].opens, true) : 'Open app for your ritual'}\n${terms}`, ink: color.fg, seal: color.card }
}
