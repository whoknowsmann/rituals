/**
 * Budget for the app's own settle key (devnet). It pays for the two
 * permissionless steps that used to need a wallet approval each: opening a
 * week nobody checked in to (event account rent + fee) and settling a week
 * (fee only). The creator pre-pays it inside the create approval.
 */

/** Rent for a 139-byte RitualEvent (~0.00186 SOL) plus open + settle fees, rounded up. */
export const SETTLER_LAMPORTS_PER_WEEK = 2_000_000n
/** A system account must keep ~0.00089 SOL to exist; keep a floor above it. */
export const SETTLER_FLOOR_LAMPORTS = 1_000_000n

export function settlerBudgetLamports(eventCount: number): bigint {
  if (!Number.isInteger(eventCount) || eventCount < 1 || eventCount > 16) throw new Error('eventCount must be 1..16')
  return SETTLER_FLOOR_LAMPORTS + SETTLER_LAMPORTS_PER_WEEK * BigInt(eventCount)
}

/** Whether the settle key can pay for the next step without dropping below its floor. */
export function settlerCanPay(balanceLamports: number | bigint, needsEventInit: boolean): boolean {
  const need = needsEventInit ? SETTLER_LAMPORTS_PER_WEEK : 20_000n
  return BigInt(balanceLamports) >= need + SETTLER_FLOOR_LAMPORTS
}

export function formatSol(lamports: bigint): string {
  const sol = Number(lamports) / 1_000_000_000
  return `${sol.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} SOL`
}

/**
 * What the create approval should transfer into the settle key: the budget
 * for this ritual minus what the key already holds. Leftovers from earlier
 * rituals (a kept week spends nothing) carry over, so a second ritual on the
 * same phone pre-pays little or nothing (Jack, 2026-10-11: a phone's key sat
 * on 0.037 SOL while every create still took the full budget). An unreadable
 * balance means the full budget: never under-fund the key.
 */
export function settlerTopUpLamports(eventCount: number, currentBalanceLamports: number | bigint | null): bigint {
  const budget = settlerBudgetLamports(eventCount)
  if (currentBalanceLamports === null) return budget
  const have = BigInt(currentBalanceLamports)
  return have >= budget ? 0n : budget - have
}

/** Rent for the ritual account (1,010 bytes) and its two vault token accounts (165 bytes each), devnet rent schedule. */
export const CREATE_RENT_LAMPORTS = 5_781_040n + 2n * 1_488_440n
/** Network fee for the one-approval create with its compute-budget instructions. */
export const CREATE_FEE_LAMPORTS = 25_000n

/** SOL the wallet must hold for the create to pass the wallet's simulation. */
export function createSolNeededLamports(eventCount: number, settlerTopUp: bigint): bigint {
  if (!Number.isInteger(eventCount) || eventCount < 1 || eventCount > 16) throw new Error('eventCount must be 1..16')
  return CREATE_RENT_LAMPORTS + CREATE_FEE_LAMPORTS + settlerTopUp
}
