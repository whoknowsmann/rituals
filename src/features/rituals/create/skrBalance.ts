/**
 * SKR balance reads for the activation-fee discount.
 *
 * DEVNET HONESTY NOTE
 * -------------------
 * Real SKR does not exist on devnet. P0 therefore gates the discount on a
 * clearly labelled devnet stand-in mint, and the UI says so. The balance read
 * is genuine -- it is a real SPL token account read against the configured
 * mint -- only the mint differs from mainnet SKR. Swapping to the real mint on
 * mainnet is a one-line configuration change; no logic changes.
 *
 * Fails open to "no discount" rather than blocking creation: a balance read
 * failing must never prevent someone from making a ritual.
 */

import { PublicKey } from '@solana/web3.js'
import { applySkrDiscount, type SkrDiscountResult } from '../../../domain/rituals/skrDiscount'

/**
 * Devnet stand-in for SKR. Null until the stand-in mint is created, in which
 * case every wallet resolves to the base tier.
 */
export const SKR_DEVNET_STANDIN_MINT: PublicKey | null = null

export const SKR_IS_STANDIN = true

export type TokenBalanceReader = Readonly<{
  getTokenAccountsByOwner: (
    owner: PublicKey,
    filter: Readonly<{ mint: PublicKey }>,
  ) => Promise<Readonly<{ value: ReadonlyArray<{ account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }> }>>
}>

/**
 * Read an owner's SKR balance in atomic units.
 *
 * Returns 0n on any failure. A discount is a bonus, not an entitlement, so a
 * flaky RPC must degrade to "no discount" rather than an error.
 */
export async function readSkrBalance(
  reader: TokenBalanceReader,
  owner: PublicKey,
  mint: PublicKey | null = SKR_DEVNET_STANDIN_MINT,
): Promise<bigint> {
  if (mint === null) return 0n
  if (!(owner instanceof PublicKey)) return 0n
  try {
    const response = await reader.getTokenAccountsByOwner(owner, { mint })
    let total = 0n
    for (const entry of response.value) {
      const raw = entry?.account?.data?.parsed?.info?.tokenAmount?.amount
      if (typeof raw === 'string' && /^\d+$/.test(raw)) total += BigInt(raw)
    }
    return total
  } catch {
    return 0n
  }
}

/** Resolve the fee a wallet actually pays after any SKR discount. */
export async function quoteDiscountedActivationFee(
  reader: TokenBalanceReader,
  owner: PublicKey,
  activationFee: bigint,
  mint: PublicKey | null = SKR_DEVNET_STANDIN_MINT,
): Promise<SkrDiscountResult> {
  const balance = await readSkrBalance(reader, owner, mint)
  return applySkrDiscount(activationFee, balance)
}
