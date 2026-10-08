import type { RitualAccountView } from '../../../data/rituals/accounts'
import { formatAtomic } from '../displayFormat'
import { closedWeekCount, type SoloWeekOutcome } from './soloHistory'

/** Only settled outcomes count. Ended returns the unspent allocation too. */
export function tileMoneyLine(account: RitualAccountView, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined): string {
  const total = account.perEventAllocation * BigInt(account.schedule.length)
  const totalLabel = formatAtomic(total, account.stakeDecimals)
  if (account.kind !== 'Solo' || !outcomes || account.status === 'Cancelled') return totalLabel
  const closed = closedWeekCount(account)
  let returnedWeeks = account.status === 'Ended' ? account.schedule.length - closed : 0
  for (let index = 0; index < closed; index += 1) {
    const outcome = outcomes.get(index)
    if (outcome === undefined) return totalLabel
    if (outcome === 'done' || outcome === 'skipped') returnedWeeks += 1
  }
  const back = account.perEventAllocation * BigInt(returnedWeeks)
  return `${formatAtomic(back, account.stakeDecimals, '').trimEnd()} of ${totalLabel} back`
}
