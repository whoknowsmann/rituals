import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { useRitualAction } from '../useRitualAction'
import { useCreateRitual } from '../create/useCreateRitual'
import type { PendingActionRecord, PendingActionResolution } from './pendingAction'

const harness = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = { current: value }
    return harness.cells[index]
  },
  useReducer: (reducer: (state: unknown, event: unknown) => unknown, value: unknown, init: (value: unknown) => unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = init(value)
    return [harness.cells[index], (event: unknown) => { harness.cells[index] = reducer(harness.cells[index], event) }]
  },
  useEffect: (callback: () => void | (() => void), deps: unknown[]) => {
    const index = harness.cursor++
    const previous = harness.cells[index]
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
    harness.effects.push(() => {
      previous?.cleanup?.()
      harness.cells[index] = { deps, cleanup: callback() }
    })
  },
}))
vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn() }))
const verdict = vi.hoisted(() => ({ report: vi.fn() }))
vi.mock('../../../utils/chainVerdict', () => ({ reportChainVerdict: verdict.report }))

const address = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
const record: PendingActionRecord = { version: 1, actionKind: 'claim', ritualAddress: address, messageDigest: 'a'.repeat(64), actor: address, eventIndex: 0, blockhash: address, lastValidBlockHeight: 100, createdAt: 1 }
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
const cleanup = () => { for (const cell of harness.cells) cell?.cleanup?.() }
beforeEach(() => { harness.cells = []; harness.cursor = 0; harness.effects = []; verdict.report.mockReset(); vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

for (const kind of ['claim', 'skip', 'initialize-event', 'finalize', 'eject', 'create'] as const) describe(`${kind} hook recovery`, () => {
  function setup(reconcile: () => Promise<PendingActionResolution | null>, failure: 'lost' | 'declined' | 'cancelled' = 'lost') {
    const error = failure === 'lost' ? Object.assign(new Error('wallet submission outcome is unknown'), { submitted: true })
      : Object.assign(new Error('wallet request was rejected'), { submitted: false, ...(failure === 'cancelled' ? { cancelled: true } : {}) })
    const deps = {
      // buildSoloSkipDeps uses the shared machine's activate ref for skip.
      prepare: vi.fn(async () => ({ kind: kind === 'skip' ? 'activate' : kind, messageDigest: record.messageDigest, ritualAddress: address })),
      submit: vi.fn(async () => { throw error }),
      confirm: vi.fn(),
      reconcile: vi.fn(reconcile),
    }
    const render = () => {
      harness.cursor = 0
      const result = kind === 'create' ? useCreateRitual(() => deps as never) : useRitualAction(() => deps as never)
      for (const effect of harness.effects.splice(0)) effect()
      return result
    }
    return { deps, render }
  }

  it('starts recovery without another tap and reaches success without resubmitting', async () => {
    const { deps, render } = setup(async () => ({ status: 'confirmed', record, slot: 120 }))
    render().start()
    await flush()
    const unknown = render()
    expect(unknown.state).toMatchObject({ status: 'error', submitted: true, retryable: false })
    unknown.start()
    unknown.reset()
    expect(deps.reconcile).toHaveBeenCalledOnce()
    await flush()
    const recovered = render()
    expect(recovered.state.status).toBe('recovered')
    expect(recovered.copy.tone).toBe('success')
    expect(recovered.canSubmit).toBe(false)
    expect(recovered.isBusy).toBe(false)
    expect(deps.submit).toHaveBeenCalledOnce()
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('does not reconcile a decline, which stays retryable', async () => {
    const { deps, render } = setup(async () => null, 'declined')
    render().start()
    await flush()
    expect(render().state).toMatchObject({ status: 'error', category: 'wallet-rejected', submitted: false, retryable: true })
    expect(deps.reconcile).not.toHaveBeenCalled()
  })

  it('checks the chain right away after a sheet cancelled once signing began, and ends at Done if it landed', async () => {
    const { deps, render } = setup(async () => ({ status: 'confirmed', record, slot: 120 }), 'cancelled')
    render().start()
    await flush()
    const cancelled = render()
    expect(cancelled.state).toMatchObject({ status: 'error', category: 'wallet-rejected', submitted: false, retryable: true, unresolved: true })
    expect(deps.reconcile).toHaveBeenCalledOnce()
    await flush()
    const done = render()
    expect(done.state.status).toBe('recovered')
    expect(done.copy.tone).toBe('success')
    expect(done.canSubmit).toBe(false)
    expect(deps.submit).toHaveBeenCalledOnce()
    // The "Network mismatch?" hint waiting on this answer stays silent.
    expect(verdict.report).toHaveBeenCalledWith(true)
    expect(verdict.report).not.toHaveBeenCalledWith(false)
  })

  it('keeps Try again open while the chain has no answer, and stops checking once expiry is proven', async () => {
    let expired = false
    const { deps, render } = setup(async () => ({ status: expired ? 'expired' : 'still-unknown', record }), 'cancelled')
    render().start()
    await flush()
    render()
    await vi.advanceTimersByTimeAsync(6000)
    const waiting = render()
    expect(deps.reconcile.mock.calls.length).toBeGreaterThan(1)
    // Only the first answer feeds the "Network mismatch?" hint: nothing landed yet, so it may show.
    expect(verdict.report.mock.calls).toEqual([[false]])
    expect(waiting.canSubmit).toBe(true)
    // A duplicate stamp is rejected by the program; a Create retry reuses the same ritual address, but it never claims nothing was sent.
    expect(waiting.copy.body).toBe(kind === 'create' ? 'Try again.' : 'Nothing was sent. Try again.')
    expired = true
    await vi.advanceTimersByTimeAsync(3000)
    const settled = render()
    expect(settled.state).toMatchObject({ status: 'error', category: 'wallet-rejected', retryable: true })
    expect(settled.state).not.toHaveProperty('unresolved')
    expect(settled.copy.body).toBe('Nothing was sent. Try again.')
    const reads = deps.reconcile.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.reconcile).toHaveBeenCalledTimes(reads)
  })

  it('silences the hint when the screen\'s own read shows the action landed before the background check answers', async () => {
    const { render } = setup(() => new Promise<PendingActionResolution>(() => undefined), 'cancelled')
    render().start()
    await flush()
    render().observeReadback(address)
    expect(render().state.status).toBe('recovered')
    expect(verdict.report.mock.calls).toEqual([[true]])
  })

  it('waits for proven expiry and stops its read loop on unmount', async () => {
    let expired = false
    const { deps, render } = setup(async () => ({ status: expired ? 'expired' : 'still-unknown', record }))
    render().start()
    await flush()
    render()
    await flush()
    expect(render().canSubmit).toBe(false)
    expired = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state).toMatchObject({ status: 'error', category: 'blockhash-expired', submitted: false, retryable: true })
    cleanup()
    const reads = deps.reconcile.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.reconcile).toHaveBeenCalledTimes(reads)
  })
})

describe('pre-wallet action refresh', () => {
  it('re-reads after a preparation failure, once per attempt without another send', async () => {
    const refresh = vi.fn()
    const prepare = vi.fn(async () => { throw new Error('stale week') })
    const submit = vi.fn()
    const render = () => {
      harness.cursor = 0
      const result = useRitualAction(() => ({ prepare, submit, confirm: vi.fn() }), refresh)
      for (const effect of harness.effects.splice(0)) effect()
      return result
    }
    render().start(); await flush()
    expect(render().state).toMatchObject({ status: 'error', category: 'preparation', retryable: true })
    expect(refresh).toHaveBeenCalledOnce()
    render(); render()
    expect(refresh).toHaveBeenCalledOnce()
    render().reset(); render().start(); await flush(); render()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('create Try again after a cancelled sheet', () => {
  it('reuses the prepared create and its reconciler, even if the next draft or wallet differs', async () => {
    let landed = false
    const prepared = { kind: 'create' as const, messageDigest: record.messageDigest, ritualAddress: address }
    const first = {
      prepare: vi.fn(async () => prepared),
      submit: vi.fn(async () => { throw Object.assign(new Error('wallet request was rejected'), { cancelled: true }) }),
      confirm: vi.fn(),
      reconcile: vi.fn(async (): Promise<PendingActionResolution> => landed ? { status: 'confirmed', record, slot: 120 } : { status: 'still-unknown', record }),
    }
    const replacement = { ...first, prepare: vi.fn(async () => ({ ...prepared, ritualAddress: 'different-ritual' })), submit: vi.fn() }
    const makeDeps = vi.fn().mockReturnValueOnce(first).mockReturnValue(replacement)
    const render = () => {
      harness.cursor = 0
      const result = useCreateRitual(makeDeps)
      for (const effect of harness.effects.splice(0)) effect()
      return result
    }
    render().start(); await flush()
    const unknown = render()
    expect(unknown.copy.body).toBe('Try again.')
    unknown.start(); unknown.start(); await flush()
    expect(makeDeps).toHaveBeenCalledOnce()
    expect(first.prepare).toHaveBeenCalledOnce()
    expect(first.submit.mock.calls).toEqual([[prepared], [prepared]])
    expect(replacement.submit).not.toHaveBeenCalled()
    render().reset()
    expect(render().state).toMatchObject({ status: 'error', unresolved: true, ritualAddress: address })
    landed = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state).toMatchObject({ status: 'recovered', ritualAddress: address })
  })
  it('keeps checking the chain through a failed retry, so a first attempt that landed still ends at Done', async () => {
    let landed = false
    let attempts = 0
    const reconcile = vi.fn(async (): Promise<PendingActionResolution> => (landed ? { status: 'confirmed', record, slot: 120 } : { status: 'still-unknown', record }))
    const makeDeps = () => ({
      prepare: vi.fn(async () => ({ kind: 'create' as const, messageDigest: record.messageDigest, ritualAddress: address })),
      // First: Back on the sheet after a broadcast. Second: the wallet refuses the duplicate (same ritual address).
      submit: vi.fn(async () => { attempts += 1; throw attempts === 1 ? Object.assign(new Error('wallet request was rejected'), { cancelled: true }) : new Error('wallet submission failed') }),
      confirm: vi.fn(),
      reconcile,
    })
    const render = () => {
      harness.cursor = 0
      const result = useCreateRitual(makeDeps as never)
      for (const effect of harness.effects.splice(0)) effect()
      return result
    }
    render().start()
    await flush()
    const first = render()
    expect(first.canSubmit).toBe(true)
    first.start()
    await flush()
    const retried = render()
    expect(retried.state).toMatchObject({ status: 'error', category: 'submission', retryable: true, unresolved: true })
    expect(retried.copy.body).not.toContain('Nothing was sent')
    landed = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state.status).toBe('recovered')
    expect(attempts).toBe(2)
  })
})
