// Foreground adapter only. The task handler must never import this module.
import { formatAtomic } from '../features/rituals/displayFormat'
import { eventOutcome, soloHomeCells } from '../features/rituals/home/soloHistory'
import { soloRitualModel, type SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import type { WidgetOutcome } from './widgetModel'

export type WidgetBundle = Readonly<{ address: string; bundle: SoloRitualBundle }>
export type WidgetWeekOutcomes = ReadonlyMap<string, ReadonlyMap<number, 'done' | 'missed'>>

/** Use exactly Home's cells and lifecycle status, including neutral unread weeks. */
export function widgetOutcomeFromBundle({ address, bundle }: WidgetBundle, now: number, homeOutcomes?: ReadonlyMap<number, 'done' | 'missed'>): WidgetOutcome | null {
  const account = bundle.ritual.account
  if (account.kind !== 'Solo' || (account.status !== 'Active' && account.status !== 'Completed') || !account.schedule.length) return null
  const index = Math.min(account.currentEventIndex, account.schedule.length - 1)
  // Home provides readSoloWeekOutcomes. The detail screen already has event
  // history: apply the very same eventOutcome convention without extra RPC.
  const outcomes = new Map(homeOutcomes)
  if (homeOutcomes === undefined) {
    for (const read of [...(bundle.history ?? []), bundle]) {
      if (!read.event) continue
      const result = eventOutcome(read.event.account)
      if (result) outcomes.set(read.event.account.eventIndex, result)
    }
  }
  const model = soloRitualModel(bundle, now, account.members[0] ?? null)
  const window = account.schedule[index]
  const current = bundle.event?.account
  return {
    address,
    stakeLabel: `${formatAtomic(account.perEventAllocation, account.stakeDecimals)} / WK`,
    cells: soloHomeCells(account, outcomes),
    active: account.status === 'Active',
    state: model.state,
    showedUp: model.showedUp,
    terminalCurrent: current?.eventIndex === account.currentEventIndex && (current.status === 'Settled' || current.status === 'Voided'),
    opens: Number(window.opens), deadline: Number(window.deadline),
  }
}
