import { describe, expect, it, vi } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import { autoSettleWeek } from './autoSettle'
import { formatSol, settlerBudgetLamports, settlerCanPay } from './settlerBudget'
import { DEMO_CLOCK_WARNING, settlementVisibleEnough } from './settlementVisibility'

const missed = { demoSpeedNotice: 'Demo speed', showedUp: false, weekSkipped: false }
describe('demo settlement visibility', () => {
  it('allows a miss on foreground Home or detail, but not another route or background', () => {
    for (const state of ['background', 'inactive', null]) {
      expect(settlementVisibleEnough(missed, true, state)).toBe(false)
      expect(settlementVisibleEnough(missed, false, state, true)).toBe(false)
    }
    expect(settlementVisibleEnough(missed, false, 'active')).toBe(false)
    expect(settlementVisibleEnough(missed, true, 'active')).toBe(true)
    expect(settlementVisibleEnough(missed, false, 'active', true)).toBe(true)
  })
  it('preserves refund/real-week semantics and the exact warning', () => {
    expect(settlementVisibleEnough({ ...missed, showedUp: true }, false, 'background')).toBe(true)
    expect(settlementVisibleEnough({ ...missed, weekSkipped: true }, false, 'background')).toBe(true)
    expect(settlementVisibleEnough({ ...missed, demoSpeedNotice: null }, false, 'background')).toBe(true)
    expect(DEMO_CLOCK_WARNING).toBe('Demo weeks keep running while you’re away. Unstamped weeks are missed.')
  })
})

describe('settle key budget', () => {
  it('covers opening + settling every week, above the account floor, under the preparer cap', () => {
    expect(settlerBudgetLamports(4)).toBe(9_000_000n)
    expect(settlerBudgetLamports(16)).toBeLessThanOrEqual(50_000_000n)
    expect(settlerCanPay(1_000_000, false)).toBe(false)
    expect(settlerCanPay(1_020_000, false)).toBe(true)
    expect(settlerCanPay(2_999_999, true)).toBe(false)
    expect(formatSol(9_000_000n)).toBe('0.009 SOL')
  })
})

describe('autoSettleWeek', () => {
  const base = { client: {} as never, ritualAddress: new PublicKey(new Uint8Array(32).fill(3)), settler: Keypair.generate().publicKey, eventIndex: 1, destinationTokenAccounts: [] }
  const ok = { ok: true as const, result: { signature: 's', messageDigest: 'd' } }
  it('does not start when mayContinue is false', async () => {
    const run = vi.fn(async () => ok)
    expect(await autoSettleWeek({ ...base, needsEventInit: true, mayContinue: () => false }, run)).toMatchObject({ ok: false, category: 'not-visible' })
    expect(run).not.toHaveBeenCalled()
  })
  it.each([true, false])('uses one lifecycle action with needsEventInit=%s', async (needsEventInit) => {
    const prepared = { messageDigest: 'd', ritualAddress: 'r' }
    const client = { readRitual: vi.fn(async () => ({ address: base.ritualAddress, account: {} })), programId: base.ritualAddress,
      getEventBundle: vi.fn(async () => ({ event: { address: base.ritualAddress, account: {} }, claims: [] })),
      prepareInitializeAndFinalize: vi.fn(async () => prepared), prepareFinalize: vi.fn(async () => prepared) }
    const run = vi.fn(async (deps) => { await deps.prepare(); return ok })
    expect(await autoSettleWeek({ ...base, client: client as never, needsEventInit }, run)).toEqual({ ok: true, signatures: ['s'] })
    expect(run).toHaveBeenCalledOnce()
    expect(client.prepareInitializeAndFinalize).toHaveBeenCalledTimes(needsEventInit ? 1 : 0)
    expect(client.prepareFinalize).toHaveBeenCalledTimes(needsEventInit ? 0 : 1)
  })
  it('leaves retries to the capped runner', async () => {
    const run = vi.fn(async () => ({ ok: false as const, category: 'preparation' as const, retryable: true }))
    expect(await autoSettleWeek({ ...base, needsEventInit: false }, run as never)).toMatchObject({ ok: false, step: 'finalize', category: 'preparation' })
    expect(run).toHaveBeenCalledOnce()
  })
})
