import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { readSkrBalance, quoteDiscountedActivationFee, SKR_IS_STANDIN } from './skrBalance'
import { SKR_DECIMALS, SKR_DISCOUNT_TIERS } from '../../../domain/rituals/skrDiscount'

const OWNER = new PublicKey(new Uint8Array(32).fill(1))
const MINT = new PublicKey(new Uint8Array(32).fill(2))
const skr = (n: number) => (BigInt(n) * 10n ** BigInt(SKR_DECIMALS)).toString()

const reader = (amounts: string[]) => ({
  getTokenAccountsByOwner: vi.fn(async () => ({
    value: amounts.map((amount) => ({ account: { data: { parsed: { info: { tokenAmount: { amount } } } } } })),
  })),
}) as never

describe('readSkrBalance', () => {
  it('returns zero when no stand-in mint is configured', async () => {
    expect(await readSkrBalance(reader([skr(100)]), OWNER, null)).toBe(0n)
  })

  it('reads a single token account balance', async () => {
    expect(await readSkrBalance(reader([skr(100)]), OWNER, MINT)).toBe(BigInt(skr(100)))
  })

  it('sums multiple token accounts for the same mint', async () => {
    expect(await readSkrBalance(reader([skr(60), skr(40)]), OWNER, MINT)).toBe(BigInt(skr(100)))
  })

  it('returns zero when the owner holds nothing', async () => {
    expect(await readSkrBalance(reader([]), OWNER, MINT)).toBe(0n)
  })

  it('fails open to zero when the RPC throws', async () => {
    const broken = { getTokenAccountsByOwner: vi.fn(async () => { throw new Error('rpc down') }) } as never
    expect(await readSkrBalance(broken, OWNER, MINT)).toBe(0n)
  })

  it('ignores malformed amounts rather than throwing', async () => {
    const weird = {
      getTokenAccountsByOwner: vi.fn(async () => ({
        value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: 'not-a-number' } } } } } }, { account: {} }],
      })),
    } as never
    expect(await readSkrBalance(weird, OWNER, MINT)).toBe(0n)
  })

  it('rejects a non-PublicKey owner without throwing', async () => {
    // @ts-expect-error deliberate hostile input
    expect(await readSkrBalance(reader([skr(100)]), 'nope', MINT)).toBe(0n)
  })
})

describe('quoteDiscountedActivationFee', () => {
  it('charges the full fee with no balance', async () => {
    const quote = await quoteDiscountedActivationFee(reader([]), OWNER, 1_000_000n, MINT)
    expect(quote.payableFee).toBe(1_000_000n)
  })

  it('applies a tier discount for a qualifying balance', async () => {
    const tier = SKR_DISCOUNT_TIERS[1]
    const balance = (tier.minimumBalance).toString()
    const quote = await quoteDiscountedActivationFee(reader([balance]), OWNER, 1_000_000n, MINT)
    expect(quote.discountBasisPoints).toBe(tier.discountBasisPoints)
    expect(quote.payableFee).toBeLessThan(1_000_000n)
  })

  it('never lets a broken RPC block creation', async () => {
    const broken = { getTokenAccountsByOwner: vi.fn(async () => { throw new Error('down') }) } as never
    const quote = await quoteDiscountedActivationFee(broken, OWNER, 1_000_000n, MINT)
    expect(quote.payableFee).toBe(1_000_000n)
  })

  it('declares itself a devnet stand-in so the UI can disclose it', () => {
    expect(SKR_IS_STANDIN).toBe(true)
  })
})
