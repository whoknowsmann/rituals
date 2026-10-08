import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import { RitualSubmissionError } from '../../../data/rituals/ritualSubmission'
import { buildRitualActionDeps } from '../buildRitualActionDeps'
import { runLifecycleAction } from '../runLifecycleAction'
import { lifecycleCanSubmit, lifecycleInitialState, lifecycleReducer, lifecycleStatusCopy } from '../lifecycleMachine'
import { createMachineInitialState, createMachineReducer, createStatusCopy, canSubmitCreate } from '../create/createMachine'
import { resolvePendingAction, type PendingActionRecord, type PendingActionResolution } from './pendingAction'
import { watchActionReconciliation } from './reconcilePendingAction'

const actor = new PublicKey(new Uint8Array(32).fill(7))
const address = new PublicKey(new Uint8Array(32).fill(8))
const prepared = { kind: 'initialize-event-and-claim' as const, ritualAddress: address.toBase58(), messageDigest: 'a'.repeat(64), blockhash: actor.toBase58(), lastValidBlockHeight: 100 }
const record: PendingActionRecord = { version: 1, actionKind: prepared.kind, ...prepared, actor: actor.toBase58(), eventIndex: 0, createdAt: 1 }
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
afterEach(() => { vi.useRealTimers() })

function setup() {
  let height = 90
  let stamped = false
  let offline = false
  const records = new Map<string, PendingActionRecord>()
  const store = { list: async () => [...records.values()], upsert: async (value: PendingActionRecord) => { records.set(value.messageDigest, value) }, remove: vi.fn(async (value: PendingActionRecord) => { records.delete(value.messageDigest) }) }
  const client = {
    programId: actor,
    readRitual: vi.fn(async () => {
      if (offline) throw new Error('RPC unavailable')
      return { slot: 120, address, account: { kind: 'Solo', creator: actor, currentEventIndex: 1 } }
    }),
    getEventBundle: vi.fn(async () => ({ slot: 120, event: stamped ? { account: { eventIndex: 0, status: 'Settled' } } : null, claims: stamped ? [{ member: actor, account: { status: 'Confirmed' } }] : [] })),
    prepareInitializeAndClaim: vi.fn(async () => prepared),
    submitPrepared: vi.fn(async () => { throw new RitualSubmissionError('wallet', 'wallet submission outcome is unknown', true) }),
    confirmSubmitted: vi.fn(),
  }
  const deps = buildRitualActionDeps({ client: client as unknown as RitualClient, actor, ritualAddress: address, kind: 'claim', eventIndex: 0, pendingActionStore: store, getBlockHeight: async () => height })
  return { deps, client, store, records, setHeight: (value: number) => { height = value }, stamp: () => { stamped = true }, offline: () => { offline = true } }
}

describe('lost signing response reconciliation', () => {
  it('immediately recovers the exact settled stamp without a signature, a second send, or an error', async () => {
    vi.useFakeTimers()
    const test = setup()
    let state = lifecycleInitialState()
    await runLifecycleAction(test.deps, (event) => { state = lifecycleReducer(state, event) })
    expect(state).toMatchObject({ status: 'error', category: 'confirmation', submitted: true, retryable: false })
    expect(test.records.size).toBe(1)
    expect([...test.records.values()][0]).toMatchObject({ actor: actor.toBase58(), eventIndex: 0 })
    expect([...test.records.values()][0].transactionSignature).toBeUndefined()
    test.stamp()
    const stop = watchActionReconciliation(test.deps.reconcile!, (event) => { state = lifecycleReducer(state, event) })
    await flush()
    expect(state).toMatchObject({ status: 'recovered', ritualAddress: address.toBase58() })
    expect(lifecycleCanSubmit(state)).toBe(false)
    expect(lifecycleStatusCopy(state)).toMatchObject({ title: 'Done', tone: 'success' })
    expect(test.client.getEventBundle).toHaveBeenLastCalledWith(address, 0)
    expect(test.client.submitPrepared).toHaveBeenCalledOnce()
    expect(test.client.confirmSubmitted).not.toHaveBeenCalled()
    expect(test.records.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it('keeps checking beyond the old three-read limit, then allows retry only after absent readback and expiry', async () => {
    vi.useFakeTimers()
    const test = setup()
    let state = lifecycleInitialState()
    await runLifecycleAction(test.deps, (event) => { state = lifecycleReducer(state, event) })
    const stop = watchActionReconciliation(test.deps.reconcile!, (event) => { state = lifecycleReducer(state, event) })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(test.client.getEventBundle.mock.calls.length).toBeGreaterThan(4)
    expect(lifecycleCanSubmit(state)).toBe(false)
    expect(lifecycleStatusCopy(state).body).not.toContain('Nothing was sent')
    test.setHeight(100)
    await vi.advanceTimersByTimeAsync(3000)
    expect(lifecycleCanSubmit(state)).toBe(false)
    test.setHeight(101)
    await vi.advanceTimersByTimeAsync(3000)
    expect(state).toMatchObject({ status: 'error', category: 'blockhash-expired', submitted: false, retryable: true })
    expect(lifecycleStatusCopy(state).body).toContain('Nothing was sent')
    expect(test.client.submitPrepared).toHaveBeenCalledOnce()
    expect(test.records.size).toBe(0)
    stop()
  })

  it('retains uncertainty and the journal when readback is unavailable even long after expiry', async () => {
    const test = setup()
    await runLifecycleAction(test.deps, () => {})
    test.setHeight(1000)
    test.offline()
    expect(await test.deps.reconcile!()).toMatchObject({ status: 'still-unknown' })
    expect(test.records.size).toBe(1)
  })

  it('does not mistake a signature-status outage for an absent transaction', async () => {
    const result = await resolvePendingAction({ ...record, transactionSignature: '1'.repeat(64) }, {
      getBlockHeight: async () => 1000,
      getSignatureStatus: async () => { throw new Error('RPC unavailable') },
      readRitual: async () => ({ slot: 120, actionObserved: false }),
    })
    expect(result.status).toBe('still-unknown')
  })

  it('stops polling on cleanup and ignores a read finishing after unmount', async () => {
    vi.useFakeTimers()
    let finish!: (value: PendingActionResolution) => void
    const reconcile = vi.fn(() => new Promise<PendingActionResolution>((resolve) => { finish = resolve }))
    const dispatch = vi.fn()
    const stop = watchActionReconciliation(reconcile, dispatch)
    expect(reconcile).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(reconcile).toHaveBeenCalledOnce()
    stop()
    finish({ status: 'confirmed', record, slot: 120 })
    await flush()
    expect(dispatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('only changes a matching uncertain create on chain-proven expiry, never a recovered create', () => {
    const awaiting = createMachineReducer(createMachineReducer(createMachineInitialState(), { type: 'PREPARE' }), { type: 'PREPARED', prepared: { kind: 'create', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress } })
    const unknown = createMachineReducer(awaiting, { type: 'FAILED', category: 'confirmation', message: 'unknown' })
    expect(canSubmitCreate(unknown)).toBe(false)
    expect(createStatusCopy(unknown).body).not.toContain('Nothing was sent')
    expect(createMachineReducer(unknown, { type: 'EXPIRY_OBSERVED', ritualAddress: 'other' })).toBe(unknown)
    const expired = createMachineReducer(unknown, { type: 'EXPIRY_OBSERVED', ritualAddress: prepared.ritualAddress })
    expect(canSubmitCreate(expired)).toBe(true)
    expect(createStatusCopy(expired).body).toContain('Nothing was sent')
    const recovered = createMachineReducer(unknown, { type: 'READBACK_OBSERVED', ritualAddress: prepared.ritualAddress })
    expect(createMachineReducer(recovered, { type: 'EXPIRY_OBSERVED', ritualAddress: prepared.ritualAddress })).toBe(recovered)
    expect(canSubmitCreate(recovered)).toBe(false)
  })
})
