import { parseTokenAmount } from '../../create/decimal'

/**
 * The create screen asks for ONE stake for the whole ritual (Jack, 2026-10-06:
 * "Stake" means the total, spread across the weeks). The program still locks a
 * per-week allocation, so the app splits the total: each week gets the total
 * divided by the weeks, rounded DOWN to 2 decimals, so every amount the app
 * ever shows (a week's stake, a receipt) is a short number. What actually
 * locks is that per-week amount times the weeks; when the total does not
 * split evenly (20 over 3 weeks) the screen says so ("locks 19.98").
 */
export const STAKE_DECIMALS = 6
const STEP = 10n ** BigInt(STAKE_DECIMALS - 2)

export type StakeSplit = Readonly<{ totalAtomic: bigint; perWeekAtomic: bigint; lockedAtomic: bigint; exact: boolean }>
export type StakeSplitResult = Readonly<{ ok: true; split: StakeSplit } | { ok: false; reason: 'invalid' | 'too-small' }>

export function splitTotalStake(totalText: string, weeks: number): StakeSplitResult {
  let total: bigint
  try { total = parseTokenAmount(totalText.trim(), STAKE_DECIMALS) } catch { return { ok: false, reason: 'invalid' } }
  if (total <= 0n || !Number.isInteger(weeks) || weeks < 1) return { ok: false, reason: 'invalid' }
  const perWeek = (total / BigInt(weeks) / STEP) * STEP
  if (perWeek <= 0n) return { ok: false, reason: 'too-small' }
  const locked = perWeek * BigInt(weeks)
  return { ok: true, split: Object.freeze({ totalAtomic: total, perWeekAtomic: perWeek, lockedAtomic: locked, exact: locked === total }) }
}

/** A plain decimal string for an atomic amount ("6.66", "5"), no symbol. */
export function atomicDecimalText(atomic: bigint, decimals = STAKE_DECIMALS): string {
  const base = 10n ** BigInt(decimals)
  const whole = atomic / base
  const fraction = (atomic % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
