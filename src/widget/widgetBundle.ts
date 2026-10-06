// Foreground adapter only. The task handler must never import this module.
import { formatAtomic } from '../features/rituals/displayFormat'
import { labelSoloDestination, type SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import type { WeekOutcome, WidgetOutcome } from './widgetModel'

export type WidgetBundle = Readonly<{ address: string; bundle: SoloRitualBundle }>
export type WidgetWeekOutcomes = ReadonlyMap<string, ReadonlyMap<number, 'done' | 'missed'>>

/** Chain schedule + observed results only. No expiry-derived transfers or extra RPC. */
export function widgetOutcomeFromBundle({ address, bundle }: WidgetBundle, _now: number, homeOutcomes?: ReadonlyMap<number, 'done' | 'missed'>): WidgetOutcome | null {
  const account = bundle.ritual.account
  if (account.kind !== 'Solo' || (account.status !== 'Active' && account.status !== 'Completed') || !account.schedule.length) return null
  const closed = account.status === 'Completed' ? account.schedule.length : account.currentEventIndex
  const outcomes = new Map<number, WeekOutcome>()
  for (const [index, result] of homeOutcomes ?? []) outcomes.set(index, result === 'done' ? 'kept' : 'missed')
  // Detail already carries historical reads. Home's explicit batch remains the
  // history authority; the current bundle can always add a confirmed stamp.
  for (const read of [...(homeOutcomes === undefined ? bundle.history ?? [] : []), bundle]) {
    const event = read.event?.account
    if (!event) continue
    const confirmed = read.claims.some((claim) => claim.member.equals(account.members[0]) && claim.account?.status === 'Confirmed')
    if (event.status === 'Voided') outcomes.set(event.eventIndex, 'skipped')
    else if (event.status === 'Settled') outcomes.set(event.eventIndex, event.forfeitedTotal > 0n ? 'missed' : 'kept')
    else if (confirmed) outcomes.set(event.eventIndex, 'kept')
  }
  // Home's refunded 'done' cells must not turn a declared skip into a stamp.
  if (account.skipDeclared) outcomes.set(account.skipEventIndex, 'skipped')
  return {
    address,
    stakeLabel: formatAtomic(account.perEventAllocation, account.stakeDecimals),
    causeLabel: labelSoloDestination(account.forfeitDestination),
    active: account.status === 'Active',
    weeks: account.schedule.map((window, index) => ({
      opens: Number(window.opens), deadline: Number(window.deadline),
      outcome: outcomes.get(index) ?? (index < closed ? 'unknown' : 'pending'),
    })),
  }
}
