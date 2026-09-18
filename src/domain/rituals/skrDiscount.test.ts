import { describe, expect, it } from 'vitest'
import {
  SKR_DISCOUNT_TIERS,
  SKR_DECIMALS,
  resolveSkrTier,
  applySkrDiscount,
  describeSkrTier,
} from './skrDiscount'

const SKR = (whole: number) => BigInt(whole) * 10n ** BigInt(SKR_DECIMALS)

describe('SKR tiers', () => {
  it('defines tiers in ascending threshold order', () => {
    for (let i = 1; i < SKR_DISCOUNT_TIERS.length; i += 1) {
      expect(SKR_DISCOUNT_TIERS[i].minimumBalance).toBeGreaterThan(SKR_DISCOUNT_TIERS[i - 1].minimumBalance)
    }
  })

  it('never grants a discount at or above 100 percent', () => {
    for (const tier of SKR_DISCOUNT_TIERS) {
      expect(tier.discountBasisPoints).toBeLessThan(10_000)
      expect(tier.discountBasisPoints).toBeGreaterThanOrEqual(0)
    }
  })

  it('starts with a zero-balance, zero-discount tier', () => {
    expect(SKR_DISCOUNT_TIERS[0].minimumBalance).toBe(0n)
    expect(SKR_DISCOUNT_TIERS[0].discountBasisPoints).toBe(0)
  })
})

describe('resolveSkrTier', () => {
  it('returns the base tier for a zero balance', () => {
    expect(resolveSkrTier(0n).discountBasisPoints).toBe(0)
  })

  it('returns the base tier just below the first threshold', () => {
    const first = SKR_DISCOUNT_TIERS[1]
    expect(resolveSkrTier(first.minimumBalance - 1n).discountBasisPoints).toBe(0)
  })

  it('applies a tier exactly at its threshold', () => {
    const first = SKR_DISCOUNT_TIERS[1]
    expect(resolveSkrTier(first.minimumBalance)).toEqual(first)
  })

  it('selects the highest qualifying tier', () => {
    const top = SKR_DISCOUNT_TIERS[SKR_DISCOUNT_TIERS.length - 1]
    expect(resolveSkrTier(top.minimumBalance * 1000n)).toEqual(top)
  })

  it('rejects a negative balance', () => {
    expect(() => resolveSkrTier(-1n)).toThrow()
  })

  it('rejects a non-bigint balance', () => {
    // @ts-expect-error deliberate hostile input
    expect(() => resolveSkrTier(100)).toThrow()
  })
})

describe('applySkrDiscount', () => {
  it('returns the full fee for a zero balance', () => {
    const result = applySkrDiscount(1_000_000n, 0n)
    expect(result.payableFee).toBe(1_000_000n)
    expect(result.discountAmount).toBe(0n)
    expect(result.discountBasisPoints).toBe(0)
  })

  it('reduces the fee by the tier percentage', () => {
    const tier = SKR_DISCOUNT_TIERS[1]
    const result = applySkrDiscount(1_000_000n, tier.minimumBalance)
    const expected = (1_000_000n * BigInt(tier.discountBasisPoints)) / 10_000n
    expect(result.discountAmount).toBe(expected)
    expect(result.payableFee).toBe(1_000_000n - expected)
  })

  it('never produces a negative or zero-floor violation', () => {
    for (const tier of SKR_DISCOUNT_TIERS) {
      const result = applySkrDiscount(1n, tier.minimumBalance)
      expect(result.payableFee).toBeGreaterThanOrEqual(0n)
      expect(result.payableFee).toBeLessThanOrEqual(1n)
    }
  })

  it('conserves value: payable plus discount equals the original fee', () => {
    for (const tier of SKR_DISCOUNT_TIERS) {
      const result = applySkrDiscount(987_654n, tier.minimumBalance)
      expect(result.payableFee + result.discountAmount).toBe(987_654n)
    }
  })

  it('rounds the discount down so the fee is never over-reduced', () => {
    // 1 unit fee with any partial discount must floor to zero discount.
    const tier = SKR_DISCOUNT_TIERS[1]
    const result = applySkrDiscount(1n, tier.minimumBalance)
    expect(result.discountAmount).toBe(0n)
  })

  it('handles a zero fee without error', () => {
    const result = applySkrDiscount(0n, SKR(10_000))
    expect(result.payableFee).toBe(0n)
    expect(result.discountAmount).toBe(0n)
  })

  it('rejects a negative fee', () => {
    expect(() => applySkrDiscount(-1n, 0n)).toThrow()
  })

  it('returns a frozen result', () => {
    expect(Object.isFrozen(applySkrDiscount(100n, 0n))).toBe(true)
  })
})

describe('describeSkrTier', () => {
  it('describes the base tier without promising a discount', () => {
    expect(describeSkrTier(0n).toLowerCase()).not.toContain('off')
  })

  it('states the discount for a qualifying tier', () => {
    const tier = SKR_DISCOUNT_TIERS[1]
    expect(describeSkrTier(tier.minimumBalance)).toContain('%')
  })
})
