import type { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import type { RitualAccountContext } from '../../../../data/rituals/instructionsLifecycle'
import type { PreparedRitualAction } from '../../../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../../../data/rituals/ritualSubmission'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionStore } from '../../recovery/pendingAction'
import { reconcilePendingAction } from '../../recovery/reconcilePendingAction'
import type { PendingActionTransport } from '../../recovery/pendingAction'
import type { LifecycleActionDeps } from '../../runLifecycleAction'
import type { LifecyclePreparedRef, LifecycleSubmittedRef, LifecycleConfirmedRef } from '../../lifecycleMachine'

export type SoloSkipDepsParams = Readonly<{
  client: RitualClient
  ritualAddress: PublicKey
  actor: PublicKey
  eventIndex: number
  authorizedActor?: () => PublicKey | null
  pendingActionStore?: PendingActionStore
  now?: () => number
  getBlockHeight?: () => Promise<number>
  getSignatureStatus?: PendingActionTransport['getSignatureStatus']
}>

/** Declare-skip is the one solo write not covered by the shared action-kind union. */
export function buildSoloSkipDeps(params: SoloSkipDepsParams): LifecycleActionDeps {
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let record: ReturnType<typeof makePendingActionRecord> | null = null
  const assertActor = () => {
    if (params.authorizedActor && !params.authorizedActor()?.equals(params.actor)) throw new Error('authorized wallet account changed before signing')
  }
  return {
    async prepare(): Promise<LifecyclePreparedRef> {
      assertActor()
      const read = await params.client.readRitual(params.ritualAddress)
      prepared = await params.client.prepareDeclareSkip({
        programId: params.client.programId,
        ritual: { address: read.address, account: read.account } as RitualAccountContext,
        member: params.actor,
        eventIndex: params.eventIndex,
      })
      return { kind: 'activate', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }
    },
    async submit(_ref: LifecyclePreparedRef): Promise<LifecycleSubmittedRef> {
      assertActor()
      if (!prepared) throw new Error('cannot submit before preparing')
      if (params.getBlockHeight) {
        const height = await params.getBlockHeight()
        if (height > prepared.lastValidBlockHeight) throw Object.assign(new Error('prepared blockhash expired before signing'), { blockhashExpired: true })
      }
      record = { ...makePendingActionRecord(prepared, params.now?.() ?? Date.now()), actor: params.actor.toBase58(), eventIndex: params.eventIndex }
      if (params.pendingActionStore) await params.pendingActionStore.upsert(record)
      try { handle = await params.client.submitPrepared(prepared) } catch (error) {
        const submitted = error as { submitted?: unknown; signature?: unknown } | null
        if (submitted?.submitted === true && typeof submitted.signature === 'string' && record) {
          record = withPendingActionSignature(record, submitted.signature)
          try { await params.pendingActionStore?.upsert(record) } catch { /* keep the uncertain result */ }
        }
        throw error
      }
      if (record) {
        record = withPendingActionSignature(record, handle.signature)
        try { await params.pendingActionStore?.upsert(record) } catch { throw Object.assign(new Error('transaction submitted but recovery could not be saved'), { submitted: true }) }
      }
      return { id: prepared.messageDigest }
    },
    async confirm(_ref: LifecycleSubmittedRef): Promise<LifecycleConfirmedRef> {
      if (!handle) throw new Error('cannot confirm before submitting')
      const result = await params.client.confirmSubmitted(handle)
      if (params.pendingActionStore && record) await params.pendingActionStore.remove(record)
      return { signature: result.signature, messageDigest: result.messageDigest }
    },
    reconcile: () => reconcilePendingAction(params.client, record, params.pendingActionStore, params.getBlockHeight, params.getSignatureStatus),
  }
}

// Claim, approve, and finalize use buildRitualActionDeps so they retain the
// shared pending-action and readback behavior.