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
export type WidgetModel = Readonly<{
  title: string; state: WidgetState; face: StampFace; streak: number
  hero: Readonly<{ value: string; label: 'week streak' | 'weeks kept' }>
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

// Same FNV-1a address/week/state convention as reminders/lines.ts. No random render draws.
function pick(lines: readonly string[], address: string, week: number, state: WidgetState): string {
  let hash = 2166136261
  const key = `${address}:${week}:${state}`
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  return lines[(hash >>> 0) % lines.length]
}
const fits = (line: string) => Array.from(line).length <= 30
function openingLine(week: number, opens: number, now: number): string {
  const seconds = opens - now
  const time = seconds < 60 ? '<1m' : seconds < 3600 ? `${Math.ceil(seconds / 60)}m` : seconds < 86400 ? `${Math.ceil(seconds / 3600)}h` : `${Math.ceil(seconds / 86400)}d`
  return `Week ${week} opens in ${time}`
}

export function widgetModel(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[], now: number): WidgetModel {
  return widgetModelFromSnapshot(buildWidgetSnapshot(known, outcomes), now)
}

export function widgetModelFromSnapshot(snapshot: WidgetSnapshot | null, now: number): WidgetModel {
  const ritual = selectWidgetSnapshot(snapshot, now)
  if (!ritual) return { title: '', state: 'empty', face: 'expectant', streak: 0, hero: { value: '0', label: 'week streak' }, line: 'Start a ritual?', tint: color.bg, ink: color.fg, seal: WIDGET_LIME }
  const { weeks, address, stakeLabel, causeLabel } = ritual
  const streak = widgetStreak(weeks, now)
  const base = { title: ritual.title, streak, hero: { value: String(streak), label: 'week streak' as const }, tint: ritual.tint, ink: color.fg, seal: WIDGET_LIME }
  const kept = weeks.filter((week) => week.outcome === 'kept').length
  if (!ritual.active) return { ...base, state: 'finished', face: kept > weeks.length / 2 ? 'content' : 'neutral', hero: { value: `${kept}/${weeks.length}`, label: 'weeks kept' }, line: 'Ritual finished.', ink: kept > weeks.length / 2 ? color.stampInk : color.fg, seal: color.card }
  const current = weeks.findIndex((week, index) => now >= week.opens && (index === weeks.length - 1 || now < weeks[index + 1].opens))
  const week = weeks[current]
  if (week?.outcome === 'kept' && (now <= week.deadline || current === weeks.length - 1)) return { ...base, state: 'stamped', face: 'joyful', line: pick(['You showed up.', 'Future you says thanks.'], address, current + 1, 'stamped'), ink: color.stampInk, seal: color.card }
  if (week?.outcome === 'pending' && now <= week.deadline) {
    const state = openWidgetState(week, now)
    const stakeLine = `Your ${stakeLabel} has opinions.`
    // Proportional urgency on real weeks can begin before the literal last hour.
    const literalHour = week.deadline - now <= WIDGET_THRESHOLDS.hourSeconds && week.deadline - week.opens >= WIDGET_THRESHOLDS.realWindowSeconds
    const line = state === 'open' ? pick([`Week ${current + 1} is open.`, 'Future you is checking.'], address, current + 1, state)
      : state === 'concerned' ? pick([fits(stakeLine) ? stakeLine : 'Your stake is on the clock.', 'Make room for a stamp.'], address, current + 1, state)
        : literalHour ? 'Last hour. Stamp it.' : 'Nearly closed. Stamp it.'
    return { ...base, state, face: state === 'open' ? 'calm' : state === 'concerned' ? 'side-eye' : 'alarmed', line }
  }
  if (week?.outcome === 'missed') {
    const receipt = `${stakeLabel} went to ${causeLabel}.`
    // Never clip an amount or rename a destination to squeeze it into the widget.
    const amountOnly = `${stakeLabel} went to your cause.`
    return { ...base, state: 'missed', face: 'sad', line: fits(receipt) ? receipt : fits(amountOnly) ? amountOnly : 'Stake went to your cause.', ink: color.stampQuiet, seal: color.paperMuted }
  }
  if (week && (week.outcome === 'pending' || week.outcome === 'unknown')) return { ...base, state: 'closing', face: 'neutral', line: 'Week closed. Open Rituals.', ink: color.fg, seal: color.card }
  const next = weeks.findIndex((entry) => entry.opens > now)
  return { ...base, state: 'resting', face: 'resting', line: next >= 0 ? openingLine(next + 1, weeks[next].opens, now) : 'Take a breath. Open Rituals.', ink: color.fg, seal: color.card }
}
