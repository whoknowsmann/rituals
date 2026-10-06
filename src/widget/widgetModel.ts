import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { tileStatus } from '../features/rituals/home/tileStatus'

export type WidgetKnown = Readonly<{ address: string; title: string }>
export const widgetStatuses = ['waiting', 'open', 'stamped', 'missed', 'skipped', 'closing', 'awaiting-witness', 'finished-stamped', 'finished-missed', 'finished-skipped'] as const
export type WidgetStatus = typeof widgetStatuses[number]
/** Plain JSON only. No wallet, key, note, balance, or RPC client crosses this boundary. */
export type WidgetSnapshot = Readonly<{
  address: string
  title: string
  weekIndex: number
  weekCount: number
  kept: number
  missed: number
  status: WidgetStatus
  opens: number
  deadline: number
  tint: string
}>
export type WidgetOutcome = Omit<WidgetSnapshot, 'title' | 'tint'>
export type WidgetModel = Readonly<{ title: string; weekLine: string; countLine: string; statusLine: string; tint: string }>

export function selectWidgetSnapshot(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[]): WidgetSnapshot | null {
  const candidates = [...known].reverse().flatMap((item) => {
    const outcome = outcomes.find((entry) => entry.address === item.address)
    return outcome ? [{ ...outcome, title: item.title, tint: ritualTintAmong(item.address, known) }] : []
  })
  // Keep the latest finished ritual visible only if no active solo ritual remains.
  return candidates.find((item) => !item.status.startsWith('finished-')) ?? candidates[0] ?? null
}

export function widgetModel(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[], nowSeconds: number): WidgetModel {
  return widgetModelFromSnapshot(selectWidgetSnapshot(known, outcomes), nowSeconds)
}

export function widgetModelFromSnapshot(snapshot: WidgetSnapshot | null, nowSeconds: number): WidgetModel {
  if (!snapshot) return { title: 'Start a ritual?', weekLine: '', countLine: '', statusLine: '', tint: ritualTintAmong('', [{ address: '' }]) }
  return {
    title: snapshot.title,
    weekLine: `Week ${Math.min(snapshot.weekIndex + 1, snapshot.weekCount)} of ${snapshot.weekCount}`,
    countLine: `${snapshot.kept} kept · ${snapshot.missed} missed`,
    statusLine: statusLine(snapshot, nowSeconds),
    tint: snapshot.tint,
  }
}

function statusLine(snapshot: WidgetSnapshot, now: number): string {
  const { status, opens, deadline } = snapshot
  if (status === 'finished-missed') return "That's a week, not a verdict."
  if (status === 'finished-skipped') return 'Skipped last week'
  if (status === 'stamped' || status === 'finished-stamped') return 'Stamped'
  if (status === 'awaiting-witness') return 'Waiting on witness'
  // A miss/skip belongs to the previous week; this week's opening takes precedence.
  if (now < opens) {
    if (status === 'missed') return "That's a week, not a verdict."
    if (status === 'skipped') return 'Skipped last week'
    const seconds = Math.max(0, Math.ceil(opens - now))
    const label = seconds < 3600
      ? `in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : new Date(opens * 1000).toLocaleDateString('en-US', { weekday: 'short' })
    return tileStatus({ state: 'waiting', showedUp: false, nextOpensLabel: label }).text
  }
  // Never infer a miss, a settlement, or a new week from the phone's clock.
  return tileStatus({ state: now <= deadline && status !== 'closing' ? 'claimable' : 'closing', showedUp: false, nextOpensLabel: null }).text
}
