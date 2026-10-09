import { parseTokenAmount } from '../../create/decimal'

/**
 * The create screen asks for ONE stake for the whole ritual (Jack, 2026-10-06:
 * "Stake" means the total, spread across the weeks). The program still locks a
 * per-week allocation, so the app splits the total at the mint's full
 * precision (Jack, 2026-10-09): each week gets the total divided by the weeks,
 * rounded down to the atomic unit, so what locks is never more than the total
 * chosen and short of it by less than one atomic unit a week (20 over 6 weeks:
 * 3.333333 a week, locks 19.999998). Screens round amounts to 2 decimals
 * (formatAtomic), so that shows as the 20 chosen.
 */
export const STAKE_DECIMALS = 6

export type StakeSplit = Readonly<{ totalAtomic: bigint; perWeekAtomic: bigint; lockedAtomic: bigint }>
export type StakeSplitResult = Readonly<{ ok: true; split: StakeSplit } | { ok: false; reason: 'invalid' | 'too-small' }>

export function splitTotalStake(totalText: string, weeks: number): StakeSplitResult {
  let total: bigint
  try { total = parseTokenAmount(totalText.trim(), STAKE_DECIMALS) } catch { return { ok: false, reason: 'invalid' } }
  if (total <= 0n || !Number.isInteger(weeks) || weeks < 1) return { ok: false, reason: 'invalid' }
  const perWeek = total / BigInt(weeks)
  if (perWeek <= 0n) return { ok: false, reason: 'too-small' }
  return { ok: true, split: Object.freeze({ totalAtomic: total, perWeekAtomic: perWeek, lockedAtomic: perWeek * BigInt(weeks) }) }
}

/** The exact decimal string for an atomic amount ("3.333333", "5"), no symbol. Not for display: use formatAtomic. */
export function atomicDecimalText(atomic: bigint, decimals = STAKE_DECIMALS): string {
  const base = 10n ** BigInt(decimals)
  const whole = atomic / base
  const fraction = (atomic % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
