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

const address = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
const record: PendingActionRecord = { version: 1, actionKind: 'claim', ritualAddress: address, messageDigest: 'a'.repeat(64), actor: address, eventIndex: 0, blockhash: address, lastValidBlockHeight: 100, createdAt: 1 }
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
const cleanup = () => { for (const cell of harness.cells) cell?.cleanup?.() }
beforeEach(() => { harness.cells = []; harness.cursor = 0; harness.effects = []; vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

for (const kind of ['claim', 'create'] as const) describe(`${kind} hook recovery`, () => {
  function setup(reconcile: () => Promise<PendingActionResolution | null>, declined = false) {
    const deps = {
      prepare: vi.fn(async () => ({ kind, messageDigest: record.messageDigest, ritualAddress: address })),
      submit: vi.fn(async () => { throw Object.assign(new Error(declined ? 'wallet request was rejected' : 'wallet submission outcome is unknown'), { submitted: !declined }) }),
      confirm: vi.fn(),
      reconcile: vi.fn(reconcile),
    }
    const render = () => {
      harness.cursor = 0
      const result = kind === 'claim' ? useRitualAction(() => deps as never) : useCreateRitual(() => deps as never)
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
    const { deps, render } = setup(async () => null, true)
    render().start()
    await flush()
    expect(render().state).toMatchObject({ status: 'error', category: 'wallet-rejected', submitted: false, retryable: true })
    expect(deps.reconcile).not.toHaveBeenCalled()
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
