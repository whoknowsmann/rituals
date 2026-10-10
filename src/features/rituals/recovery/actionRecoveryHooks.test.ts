import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { useRitualAction } from '../useRitualAction'
import { useCreateRitual } from '../create/useCreateRitual'
import type { PendingActionRecord, PendingActionResolution } from './pendingAction'

const harness = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = harness.cursor++
    const previous = harness.cells[index]
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) harness.cells[index] = { deps, callback }
    return harness.cells[index].callback
  },
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
    let currentDeps: unknown = deps
    const render = () => {
      harness.cursor = 0
      const makeDeps = () => (typeof currentDeps === 'function' ? currentDeps() : currentDeps) as never
      const result = kind === 'create' ? useCreateRitual(makeDeps) : useRitualAction(makeDeps)
      for (const effect of harness.effects.splice(0)) effect()
      return result
    }
    return { deps, render, setDeps: (next: unknown) => { currentDeps = next } }
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

  it.each(['factory', 'prepare', 'pre-wallet-submit'] as const)('keeps the earlier chain check after a %s RPC failure on retry', async (phase) => {
    let resolution: PendingActionResolution = { status: 'still-unknown', record }
    const { deps, render, setDeps } = setup(async () => resolution, 'cancelled')
    render().start(); await flush(); render(); await flush()
    const retry = { ...deps, prepare: phase === 'prepare' ? vi.fn(async () => { throw new Error('rpc') }) : deps.prepare,
      submit: vi.fn(async () => { throw new Error('blockheight RPC unavailable before signing') }), reconcile: vi.fn(async () => null) }
    setDeps(phase === 'factory' ? () => { throw new Error('rpc') } : retry)
    render().start(); await flush()
    expect(render().state).toMatchObject({ status: 'error', retryable: true, unresolved: true, ritualAddress: address })
    if (phase !== 'pre-wallet-submit') expect(retry.submit).not.toHaveBeenCalled()
    resolution = { status: 'confirmed', record, slot: 120 }
    await vi.advanceTimersByTimeAsync(3000)
    expect(render()).toMatchObject({ state: { status: 'recovered' }, copy: { tone: 'success' }, canSubmit: false })
    expect(deps.submit).toHaveBeenCalledOnce()
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('proves the earlier attempt expired after a failed pre-wallet retry and stops polling', async () => {
    let expired = false
    const { deps, render, setDeps } = setup(async () => ({ status: expired ? 'expired' : 'still-unknown', record }), 'cancelled')
    render().start(); await flush(); render(); await flush()
    setDeps({ ...deps, prepare: vi.fn(async () => { throw new Error('rpc') }), reconcile: vi.fn(async () => null) })
    render().start(); await flush(); render()
    expired = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state).toMatchObject({ status: 'error', retryable: true, ritualAddress: address })
    expect(render().state).not.toHaveProperty('unresolved')
    expect(render().copy.body).toContain('Nothing was sent')
    const reads = deps.reconcile.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(deps.reconcile).toHaveBeenCalledTimes(reads)
    expect(deps.submit).toHaveBeenCalledOnce()
  })

  it('keeps checking during retry preparation and does not open the wallet if the earlier attempt lands', async () => {
    let landed = false
    let finish!: (value: unknown) => void
    const { deps, render, setDeps } = setup(async () => landed ? { status: 'confirmed', record, slot: 120 } : { status: 'still-unknown', record }, 'cancelled')
    render().start(); await flush(); render(); await flush()
    const retry = { ...deps, prepare: vi.fn(() => new Promise((resolve) => { finish = resolve })), submit: vi.fn(), reconcile: vi.fn(async () => null) }
    setDeps(retry)
    render().start(); render(); await vi.advanceTimersByTimeAsync(6000)
    expect(deps.reconcile.mock.calls.length).toBeGreaterThan(2)
    landed = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state.status).toBe('recovered')
    finish({ kind, messageDigest: record.messageDigest, ritualAddress: address }); await flush()
    expect(retry.submit).not.toHaveBeenCalled()
    expect(render().state.status).toBe('recovered')
  })

  it.each(['still-unknown', 'rpc-error'] as const)('does not declare expiry while a newer signed retry is %s', async (status) => {
    let expired = false; let landed = false
    const { deps, render, setDeps } = setup(async () => ({ status: expired ? 'expired' : 'still-unknown', record }), 'cancelled')
    render().start(); await flush(); render(); await flush()
    const later = { ...record, messageDigest: 'b'.repeat(64), lastValidBlockHeight: 200 }
    setDeps({ ...deps, reconcile: vi.fn(async () => {
      if (landed) return { status: 'confirmed', record: later, slot: 150 }
      if (status === 'rpc-error') throw new Error('rpc')
      return { status: 'still-unknown', record: later }
    }) })
    render().start(); await flush(); render()
    expired = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state).toMatchObject({ status: 'error', unresolved: true })
    landed = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(render().state.status).toBe('recovered')
  })

  it.each(['expired', 'failed'] as const)('clears only the earlier uncertainty when it is %s during retry preparation', async (status) => {
    let resolution: PendingActionResolution = { status: 'still-unknown', record }
    let finish!: (value: unknown) => void
    const { deps, render, setDeps } = setup(async () => resolution, 'cancelled')
    render().start(); await flush(); render(); await flush()
    const retry = { ...deps, prepare: vi.fn(() => new Promise((resolve) => { finish = resolve })), submit: vi.fn(async () => { throw new Error('pre-wallet rpc') }), reconcile: vi.fn(async () => null) }
    setDeps(retry)
    render().start(); render()
    resolution = { status, record }
    await vi.advanceTimersByTimeAsync(3000)
    expect(deps.reconcile).toHaveBeenCalledTimes(2)
    expect(render().state.status).toBe('preparing')
    expect(render().state).not.toHaveProperty('unresolved')
    finish({ kind, messageDigest: record.messageDigest, ritualAddress: address }); await flush()
    expect(render().state).toMatchObject({ status: 'error', retryable: true })
    expect(render().state).not.toHaveProperty('unresolved')
    expect(retry.submit).toHaveBeenCalledOnce()
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

describe('wallet-scoped create state', () => {
  const render = (wallet: string | null, makeDeps: () => unknown) => {
    harness.cursor = 0
    const result = useCreateRitual(makeDeps as never, wallet)
    for (const effect of harness.effects.splice(0)) effect()
    return result
  }
  it.each(['preparation', 'declined', 'uncertain'] as const)('clears A’s %s error on wallet change without reviving it or accepting a stale tap', async (failure) => {
    const ref = { kind: 'create' as const, messageDigest: record.messageDigest, ritualAddress: address }
    const first = {
      prepare: vi.fn(async () => { if (failure === 'preparation') throw new Error('rpc'); return ref }),
      submit: vi.fn(async () => { throw Object.assign(new Error('wallet request was rejected'), failure === 'uncertain' ? { cancelled: true } : {}) }),
      confirm: vi.fn(), reconcile: vi.fn(async () => ({ status: 'still-unknown', record })),
    }
    const second = { prepare: vi.fn(async () => ref), submit: vi.fn(async () => ({ id: 'h' })), confirm: vi.fn(async () => ({ signature: 'sig', messageDigest: ref.messageDigest })) }
    const makeDeps = vi.fn().mockReturnValueOnce(first).mockReturnValue(second)
    render('A', makeDeps).start(); await flush()
    const old = render('A', makeDeps)
    expect(old.state.status).toBe('error')
    if (failure === 'uncertain') expect(old.copy.body).toBe('Try again.')
    for (const wallet of ['B', null, 'A', 'B']) expect(render(wallet, makeDeps)).toMatchObject({ state: { status: 'idle' }, canSubmit: true })
    old.start(); await flush()
    expect(makeDeps).toHaveBeenCalledOnce()
    render('B', makeDeps).start(); await flush()
    expect(render('B', makeDeps).state.status).toBe('confirmed')
    expect(second.submit).toHaveBeenCalledOnce()
  })
  it('ignores an A preparation failure that arrives after switching to B', async () => {
    let fail!: (error: Error) => void
    const submit = vi.fn()
    const makeDeps = () => ({ prepare: () => new Promise((_, reject) => { fail = reject }), submit, confirm: vi.fn() })
    render('A', makeDeps).start(); await flush()
    expect(render('B', makeDeps).state.status).toBe('idle')
    fail(new Error('rpc')); await flush()
    expect(render('B', makeDeps)).toMatchObject({ state: { status: 'idle' }, canSubmit: true })
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('create Try again after a cancelled sheet', () => {
  // Seed Vault answers every decline as a cancelled sheet, so this is also "decline, change the stake, lock it in".
  const cancelled = async (): Promise<never> => { throw Object.assign(new Error('wallet request was rejected'), { cancelled: true }) }
  const render = (makeDeps: () => unknown) => {
    harness.cursor = 0
    const result = useCreateRitual(makeDeps as never)
    for (const effect of harness.effects.splice(0)) effect()
    return result
  }
  it('prepares the retry from the terms now on screen, at the same ritual address', async () => {
    const reconcile = vi.fn(async (): Promise<PendingActionResolution> => ({ status: 'still-unknown', record }))
    const declined = { prepare: vi.fn(async () => ({ kind: 'create' as const, messageDigest: 'a'.repeat(64), ritualAddress: address })), submit: vi.fn(cancelled), confirm: vi.fn(), reconcile }
    const editedRef = { kind: 'create' as const, messageDigest: 'b'.repeat(64), ritualAddress: address }
    const edited = { prepare: vi.fn(async () => editedRef), submit: vi.fn(async () => ({ id: editedRef.messageDigest })),
      confirm: vi.fn(async () => ({ signature: 'sig', messageDigest: editedRef.messageDigest })), reconcile }
    const makeDeps = vi.fn().mockReturnValueOnce(declined).mockReturnValue(edited)
    render(makeDeps).start(); await flush()
    const unknown = render(makeDeps)
    expect(unknown.copy.body).toBe('Try again.')
    unknown.reset()
    expect(render(makeDeps).state).toMatchObject({ status: 'error', unresolved: true, ritualAddress: address })
    unknown.start(); unknown.start(); await flush()
    expect(makeDeps).toHaveBeenCalledTimes(2)
    expect(declined.submit).toHaveBeenCalledOnce()
    expect(edited.submit.mock.calls).toEqual([[editedRef]])
    expect(render(makeDeps).state).toMatchObject({ status: 'confirmed', ritualAddress: address })
  })
  it('opens the wallet again once the first prepared blockhash has lapsed, rather than failing until expiry is proven', async () => {
    const reconcile = vi.fn(async (): Promise<PendingActionResolution> => ({ status: 'still-unknown', record }))
    const ref = { kind: 'create' as const, messageDigest: record.messageDigest, ritualAddress: address }
    const lapsed = Object.assign(new Error('prepared transaction expired before signing'), { blockhashExpired: true })
    const first = { prepare: vi.fn(async () => ref), submit: vi.fn().mockImplementationOnce(cancelled).mockRejectedValue(lapsed), confirm: vi.fn(), reconcile }
    const fresh = { prepare: vi.fn(async () => ref), submit: vi.fn(async () => ({ id: ref.messageDigest })), confirm: vi.fn(async () => ({ signature: 'sig', messageDigest: ref.messageDigest })), reconcile }
    const makeDeps = vi.fn().mockReturnValueOnce(first).mockReturnValue(fresh)
    render(makeDeps).start(); await flush()
    render(makeDeps).start(); await flush()
    expect(first.submit).toHaveBeenCalledOnce()
    expect(fresh.prepare).toHaveBeenCalledOnce()
    expect(render(makeDeps).state).toMatchObject({ status: 'confirmed', ritualAddress: address })
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
