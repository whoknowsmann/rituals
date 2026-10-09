import type { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import { sameEjectMoney, type EjectAmounts, type EjectQuote } from '../../../data/rituals/ejectQuote'
import type { PreparedRitualAction } from '../../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../../data/rituals/ritualSubmission'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionRecord, type PendingActionStore, type PendingActionTransport } from '../recovery/pendingAction'
import { reconcilePendingAction } from '../recovery/reconcilePendingAction'
import type { LifecycleActionDeps } from '../runLifecycleAction'
import type { LifecycleConfirmedRef, LifecyclePreparedRef, LifecycleSubmittedRef } from '../lifecycleMachine'

export type EjectDepsParams = Readonly<{
  client: RitualClient
  ritualAddress: PublicKey
  actor: PublicKey
  /** The amounts on screen: nothing is signed unless a fresh chain read still says exactly this. */
  shown: EjectAmounts
  /** A fresh read differs (a deadline passed): the screen shows the new amounts instead of signing. */
  onAmountsChanged?: (quote: EjectQuote) => void
  authorizedActor?: () => PublicKey | null
  pendingActionStore?: PendingActionStore
  now?: () => number
  getBlockHeight?: () => Promise<number>
  getSignatureStatus?: PendingActionTransport['getSignatureStatus']
}>

export class EjectAmountsChangedError extends Error {
  constructor() { super('the amounts changed before signing'); this.name = 'EjectAmountsChangedError' }
}

/** End early through the shared prepare / sign / confirm path, journaled like every other action. */
export function buildEjectDeps(params: EjectDepsParams): LifecycleActionDeps {
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let record: PendingActionRecord | null = null
  let eventIndex = 0
  const assertActor = () => {
    if (params.authorizedActor && !params.authorizedActor()?.equals(params.actor)) throw new Error('authorized wallet account changed before signing')
  }
  return {
    async prepare(): Promise<LifecyclePreparedRef> {
      assertActor()
      const quote = await params.client.getEjectQuote(params.ritualAddress)
      if (!quote.ritual.account.creator.equals(params.actor)) throw new Error('only the creator can end this ritual')
      if (!sameEjectMoney(quote, params.shown)) {
        params.onAmountsChanged?.(quote)
        throw new EjectAmountsChangedError()
      }
      eventIndex = quote.ritual.account.currentEventIndex
      prepared = await params.client.prepareEject({
        programId: params.client.programId,
        ritual: { address: quote.ritual.address, account: quote.ritual.account },
        creator: params.actor,
        creatorDestination: quote.creatorDestination,
        expectedForfeit: quote.pendingForfeit,
        expectedRefund: quote.backToYou,
        creatorBalanceBefore: quote.creatorBalance,
        missingReceiptCount: quote.missingReceiptCount,
      })
      return { kind: 'eject', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }
    },
    async submit(_ref: LifecyclePreparedRef): Promise<LifecycleSubmittedRef> {
      assertActor()
      if (!prepared) throw new Error('cannot submit before preparing')
      if (params.getBlockHeight) {
        const height = await params.getBlockHeight()
        if (height > prepared.lastValidBlockHeight) throw Object.assign(new Error('prepared blockhash expired before signing'), { blockhashExpired: true })
      }
      record = { ...makePendingActionRecord(prepared, params.now?.() ?? Date.now()), actor: params.actor.toBase58(), eventIndex }
      if (params.pendingActionStore) await params.pendingActionStore.upsert(record)
      assertActor()
      try { handle = await params.client.submitPrepared(prepared) } catch (error) {
        const submitted = error as { submitted?: unknown; signature?: unknown } | null
        if (submitted?.submitted === true && typeof submitted.signature === 'string' && record) {
          record = withPendingActionSignature(record, submitted.signature)
          try { await params.pendingActionStore?.upsert(record) } catch { /* the unsigned record still resolves by readback */ }
        }
        throw error
      }
      if (params.pendingActionStore && record) {
        try { record = withPendingActionSignature(record, handle.signature); await params.pendingActionStore.upsert(record) } catch { throw Object.assign(new Error('transaction submitted but recovery could not be saved'), { submitted: true }) }
      }
      return { id: prepared.messageDigest }
    },
    async confirm(_ref: LifecycleSubmittedRef): Promise<LifecycleConfirmedRef> {
      if (!handle) throw new Error('cannot confirm before submitting')
      const result = await params.client.confirmSubmitted(handle)
      if (params.pendingActionStore && record) {
        try { await params.pendingActionStore.remove(record) } catch { /* recovery clears it later */ }
      }
      return { signature: result.signature, messageDigest: result.messageDigest }
    },
    // The chain decides a lost or cancelled reply: status Ended, made by this creator.
    reconcile: () => reconcilePendingAction(params.client, record, params.pendingActionStore, params.getBlockHeight, params.getSignatureStatus),
  }
}
