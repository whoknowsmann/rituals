import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import { autoSettleWeek } from './autoSettle'
import { formatSol, settlerBudgetLamports, settlerCanPay } from './settlerBudget'
import { DEMO_CLOCK_WARNING, settlementVisibleEnough } from './settlementVisibility'

describe('demo misses need a visible ritual, not just a mounted screen', () => {
  const missed = { demoSpeedNotice: 'Demo speed', showedUp: false }
  it('blocks a missed demo in background, inactive, unknown, or behind another route', () => {
    for (const state of ['background', 'inactive', null]) expect(settlementVisibleEnough(missed, true, state)).toBe(false)
    expect(settlementVisibleEnough(missed, false, 'active')).toBe(false)
    expect(settlementVisibleEnough(missed, true, 'active')).toBe(true)
  })
  it('keeps refunds and real-week settlement independent of demo visibility', () => {
    expect(settlementVisibleEnough({ ...missed, showedUp: true }, false, 'background')).toBe(true)
    expect(settlementVisibleEnough({ ...missed, demoSpeedNotice: null }, false, 'background')).toBe(true)
    expect(DEMO_CLOCK_WARNING).toContain('keep running while you’re away')
    expect(DEMO_CLOCK_WARNING).toContain('Unstamped weeks are missed')
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
  const ok = (signature: string) => ({ ok: true as const, result: { signature, messageDigest: 'd' } })

  it('does not start off screen, and rechecks visibility between opening and settling', async () => {
    let visible = false
    let calls = 0
    const run = async () => { calls++; visible = false; return ok('opened') }
    const input = { ...base, needsEventInit: true, mayContinue: () => visible }
    expect(await autoSettleWeek(input, run as never)).toMatchObject({ ok: false, category: 'not-visible' })
    expect(calls).toBe(0)
    visible = true
    expect(await autoSettleWeek(input, run as never)).toMatchObject({ ok: false, step: 'finalize', category: 'not-visible' })
    expect(calls).toBe(1)
  })

  it('opens a week nobody checked in to, then settles it, with no wallet involved', async () => {
    const calls: string[] = []
    const run = async (deps: { prepare: () => unknown }) => { calls.push(String((deps as any).kind ?? calls.length)); return ok(`s${calls.length}`) }
    const result = await autoSettleWeek({ ...base, needsEventInit: true }, run as never, async () => undefined)
    expect(result).toEqual({ ok: true, signatures: ['s1', 's2'] })
    expect(calls).toHaveLength(2)
  })

  it('only settles when the week is already open', async () => {
    let count = 0
    const result = await autoSettleWeek({ ...base, needsEventInit: false }, (async () => { count += 1; return ok('f') }) as never, async () => undefined)
    expect(result).toEqual({ ok: true, signatures: ['f'] })
    expect(count).toBe(1)
  })

  it('retries settle preparation (lagging read right after opening), then reports the step that failed', async () => {
    let count = 0
    const result = await autoSettleWeek({ ...base, needsEventInit: false }, (async () => { count += 1; return { ok: false, category: 'preparation' } }) as never, async () => undefined)
    expect(result).toEqual({ ok: false, step: 'finalize', category: 'preparation' })
    expect(count).toBe(4)
  })

  it('stops if opening the week fails', async () => {
    const result = await autoSettleWeek({ ...base, needsEventInit: true }, (async () => ({ ok: false, category: 'submission' })) as never, async () => undefined)
    expect(result).toEqual({ ok: false, step: 'initialize-event', category: 'submission' })
  })
})
