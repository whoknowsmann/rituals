/**
 * SKR holder discount on the Ritual activation fee.
 *
 * SKR is the Solana Mobile ecosystem token. Holding it reduces the one-time
 * activation fee a ritual pays, which is a real benefit that costs the protocol
 * nothing at rest: the fee is the only place Rituals ever takes value, and it
 * takes no share of member stakes or forfeitures.
 *
 * Pure arithmetic. Balance reads and fee charging happen elsewhere; this module
 * only decides what a given balance is worth.
 *
 * DEVNET NOTE: real SKR does not exist on devnet, so the P0 build gates on a
 * clearly labeled devnet stand-in mint. The tier maths are identical either
 * way; only the mint address differs.
 */

export const SKR_DECIMALS = 9 as const

export type SkrTier = Readonly<{
  name: string
  minimumBalance: bigint
  discountBasisPoints: number
}>

const skr = (whole: number): bigint => BigInt(whole) * 10n ** BigInt(SKR_DECIMALS)

/**
 * Tiers are intentionally modest. A discount large enough to matter to a
 * whale would make the fee meaningless; these reward holding without
 * distorting the product.
 */
export const SKR_DISCOUNT_TIERS: readonly SkrTier[] = Object.freeze([
  Object.freeze({ name: 'Standard', minimumBalance: 0n, discountBasisPoints: 0 }),
  Object.freeze({ name: 'Holder', minimumBalance: skr(100), discountBasisPoints: 1_000 }),
  Object.freeze({ name: 'Supporter', minimumBalance: skr(1_000), discountBasisPoints: 2_500 }),
  Object.freeze({ name: 'Guardian', minimumBalance: skr(10_000), discountBasisPoints: 5_000 }),
])

export type SkrDiscountResult = Readonly<{
  tier: SkrTier
  discountBasisPoints: number
  discountAmount: bigint
  payableFee: bigint
}>

export class SkrDiscountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkrDiscountError'
  }
}

const requireU64 = (value: unknown, name: string): bigint => {
  if (typeof value !== 'bigint') throw new SkrDiscountError(`${name} must be a bigint`)
  if (value < 0n) throw new SkrDiscountError(`${name} must not be negative`)
  return value
}

/** The highest tier the balance qualifies for. Never throws for large values. */
export function resolveSkrTier(balance: bigint): SkrTier {
  const amount = requireU64(balance, 'balance')
  let match = SKR_DISCOUNT_TIERS[0]
  for (const tier of SKR_DISCOUNT_TIERS) {
    if (amount >= tier.minimumBalance) match = tier
  }
  return match
}

/**
 * Apply the tier discount to an activation fee.
 *
 * Integer division floors the discount, so rounding always favours the
 * protocol rather than silently over-reducing the fee. Payable plus discount
 * always equals the original fee exactly.
 */
export function applySkrDiscount(activationFee: bigint, balance: bigint): SkrDiscountResult {
  const fee = requireU64(activationFee, 'activationFee')
  const tier = resolveSkrTier(balance)
  const discountAmount = (fee * BigInt(tier.discountBasisPoints)) / 10_000n
  return Object.freeze({
    tier,
    discountBasisPoints: tier.discountBasisPoints,
    discountAmount,
    payableFee: fee - discountAmount,
  })
}

/** Short user-facing description of what a balance earns. */
export function describeSkrTier(balance: bigint): string {
  const tier = resolveSkrTier(balance)
  if (tier.discountBasisPoints === 0) {
    return `${tier.name} · hold SKR to reduce your activation fee`
  }
  return `${tier.name} · ${tier.discountBasisPoints / 100}% off the activation fee`
}
