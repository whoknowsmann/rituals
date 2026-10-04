import { describe, expect, it } from 'vitest'
import {
  deriveGroupPool,
  derivePerEventAllocation,
  quoteActivationFee,
  splitAtomicUnits,
} from './money'
import { DEVNET_CLUSTER, type PublicKeyText } from './index'

const key = (value: string) => value as PublicKeyText
const MAX_U64 = 18_446_744_073_709_551_615n

describe('derivePerEventAllocation', () => {
  it('divides an exact total across events', () => {
    expect(derivePerEventAllocation(20n, 4)).toBe(5n)
  })

  it.each([
    [-1n, 1], [1n, 0], [1n, -1], [1n, 1.5], [1n, Number.NaN],
    [1n, Number.POSITIVE_INFINITY], [5n, 2], [MAX_U64 + 1n, 1],
  ] as const)('rejects invalid allocation input %s / %s', (total, count) => {
    expect(() => derivePerEventAllocation(total, count)).toThrow()
  })

  it('allows a zero total', () => {
    expect(derivePerEventAllocation(0n, 3)).toBe(0n)
  })
})

describe('deriveGroupPool', () => {
  it.each([[5n, 1, 5n], [7n, 2, 14n], [MAX_U64, 1, MAX_U64]] as const)(
    'multiplies stake by funded members', (stake, count, expected) => {
      expect(deriveGroupPool(stake, count)).toBe(expected)
    },
  )
  it.each([[-1n, 1], [1n, 0], [1n, 1.2], [MAX_U64, 2], [MAX_U64 + 1n, 1]] as const)(
    'rejects invalid pool input %s / %s', (stake, count) => {
      expect(() => deriveGroupPool(stake, count)).toThrow()
    },
  )
})

describe('quoteActivationFee', () => {
  const config = { basisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n, tokenDecimals: 6 }
  it.each([[40_000_000n, 800_000n], [80_000_000n, 1_600_000n], [200_000_000n, 4_000_000n], [1_000_000_000n, 5_000_000n]] as const)(
    'quotes configured fee for pool %s', (pool, expected) => expect(quoteActivationFee(pool, config)).toBe(expected),
  )
  it('floors atomic calculations and clamps minimum and maximum', () => {
    expect(quoteActivationFee(51n, { ...config, basisPoints: 333, minimumFee: 1n })).toBe(1n) // floor(51*333/10000)
    expect(quoteActivationFee(1n, config)).toBe(config.minimumFee)
    expect(quoteActivationFee(10_000_000_000n, config)).toBe(config.maximumFee)
    expect(quoteActivationFee(0n, config)).toBe(0n)
  })
  it('quotes nothing when the protocol is free (0 bps, 0 / 0 bounds)', () => {
    const free = { ...config, basisPoints: 0, minimumFee: 0n, maximumFee: 0n }
    expect(quoteActivationFee(40_000_000n, free)).toBe(0n)
    expect(quoteActivationFee(1n, free)).toBe(0n)
    // A zero rate with positive bounds still floors at the minimum; the chain does the same clamp.
    expect(quoteActivationFee(40_000_000n, { ...config, basisPoints: 0 })).toBe(config.minimumFee)
  })
  it.each([
    -1, 10_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
  ])('rejects basis points %s', (basisPoints) => expect(() => quoteActivationFee(0n, { ...config, basisPoints })).toThrow())
  it.each([
    { minimumFee: -1n }, { maximumFee: -1n },
    { minimumFee: 6n, maximumFee: 5n }, { minimumFee: MAX_U64 + 1n },
    { tokenDecimals: -1 }, { tokenDecimals: 256 }, { tokenDecimals: 1.5 },
    { tokenDecimals: Number.NaN }, { tokenDecimals: Number.POSITIVE_INFINITY },
  ])('rejects invalid fee config %#', (override) => expect(() => quoteActivationFee(0n, { ...config, ...override })).toThrow())
  it('rejects invalid pools even with otherwise valid config', () => {
    expect(() => quoteActivationFee(-1n, config)).toThrow()
    expect(() => quoteActivationFee(MAX_U64 + 1n, config)).toThrow()
  })
})

describe('splitAtomicUnits', () => {
  it('splits remainder to earliest members in input order', () => {
    const result = splitAtomicUnits(10n, [key('a'), key('b'), key('c')])
    expect([...result.entries()]).toEqual([[key('a'), 4n], [key('b'), 3n], [key('c'), 3n]])
  })
  it('splits exactly, including zero', () => {
    expect([...splitAtomicUnits(12n, [key('a'), key('b'), key('c')]).values()]).toEqual([4n, 4n, 4n])
    expect([...splitAtomicUnits(0n, [key('a'), key('b')]).values()]).toEqual([0n, 0n])
  })
  it('conserves total and does not mutate input', () => {
    const members = [key('a'), key('b'), key('c'), key('d')]
    const before = [...members]
    const result = splitAtomicUnits(19n, members)
    expect([...result.keys()]).toEqual(before)
    expect(members).toEqual(before)
    expect([...result.values()].reduce((sum, value) => sum + value, 0n)).toBe(19n)
  })
  it('rejects empty members', () => {
    expect(() => splitAtomicUnits(1n, [])).toThrow()
  })
  it('rejects duplicate members', () => {
    expect(() => splitAtomicUnits(1n, [key('a'), key('a')])).toThrow()
  })
  it('rejects invalid total', () => {
    expect(() => splitAtomicUnits(-1n, [key('a')])).toThrow()
    expect(() => splitAtomicUnits(MAX_U64 + 1n, [key('a')])).toThrow()
  })
})

describe('rituals barrel', () => {
  it('keeps existing and exports money APIs', () => {
    expect(DEVNET_CLUSTER).toBe('devnet')
    expect(derivePerEventAllocation(6n, 2)).toBe(3n)
  })
})
