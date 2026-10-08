import type { RitualAccountView } from '../../../data/rituals/accounts'
import { formatAtomic } from '../displayFormat'
import { closedWeekCount, type SoloWeekOutcome } from './soloHistory'

type MoneyTotals = Readonly<{ total: bigint; back: bigint; sent: bigint }>

/** Only settled outcomes count. Ended returns the unspent allocation too. */
export function settledMoneyTotals(account: RitualAccountView, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined): MoneyTotals | null {
  if (account.kind !== 'Solo' || !outcomes || account.status === 'Cancelled') return null
  const closed = closedWeekCount(account)
  let returnedWeeks = account.status === 'Ended' ? account.schedule.length - closed : 0
  let missedWeeks = 0
  for (let index = 0; index < closed; index += 1) {
    const outcome = outcomes.get(index)
    if (outcome === undefined) return null
    if (outcome === 'done' || outcome === 'skipped') returnedWeeks += 1
    else missedWeeks += 1
  }
  return { total: account.perEventAllocation * BigInt(account.schedule.length),
    back: account.perEventAllocation * BigInt(returnedWeeks), sent: account.perEventAllocation * BigInt(missedWeeks) }
}

const backLine = (totals: MoneyTotals, decimals: number): string =>
  `${formatAtomic(totals.back, decimals, '').trimEnd()} of ${formatAtomic(totals.total, decimals)} back`

export function tileMoneyLine(account: RitualAccountView, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined): string {
  const totals = settledMoneyTotals(account, outcomes)
  return totals ? backLine(totals, account.stakeDecimals) : formatAtomic(account.perEventAllocation * BigInt(account.schedule.length), account.stakeDecimals)
}

/** Completion copy never uses the schedule's projected outcomes as transfer evidence. */
export function completedMoneyLine(account: RitualAccountView, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined, destination: string): string | null {
  if (account.status !== 'Completed') return null
  const totals = settledMoneyTotals(account, outcomes)
  if (!totals) return null
  return backLine(totals, account.stakeDecimals) + (totals.sent === 0n ? '' : ` · ${formatAtomic(totals.sent, account.stakeDecimals)} to ${destination}`)
}
