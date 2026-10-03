import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import { autoSettleWeek } from './autoSettle'
import { formatSol, settlerBudgetLamports, settlerCanPay } from './settlerBudget'

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
