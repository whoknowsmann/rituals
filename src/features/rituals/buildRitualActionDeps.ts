import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../data/rituals/ritualClient'
import type { PreparedRitualAction } from '../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../data/rituals/ritualSubmission'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionStore } from './recovery/pendingAction'
import type { LifecycleActionDeps } from './runLifecycleAction'
import type { LifecycleActionKind } from './lifecycleMachine'

export type RitualActionDepsParams = Readonly<{
  client: RitualClient
  ritualAddress: PublicKey
  actor: PublicKey
  kind: LifecycleActionKind
  memberSource?: PublicKey
  eventIndex?: number
  claimant?: PublicKey
  destinationTokenAccounts?: readonly PublicKey[]
  pendingActionStore?: PendingActionStore
  now?: () => number
  /** Re-read the currently authorized wallet before prepare and signing. */
  authorizedActor?: () => PublicKey | null
  /** Optional blockheight reader used to reject stale prepared messages before signing. */
  getBlockHeight?: () => Promise<number>
}>

const sameActor = (expected: PublicKey, actual: PublicKey | null): boolean => actual !== null && actual.equals(expected)
const preSubmissionError = (message: string, blockhashExpired = false): Error & { blockhashExpired?: boolean } => Object.assign(new Error(message), blockhashExpired ? { blockhashExpired: true } : {})

export function buildRitualActionDeps(params: RitualActionDepsParams): LifecycleActionDeps {
  const { client, ritualAddress, actor, kind, memberSource, eventIndex = 0, claimant = actor, destinationTokenAccounts = [], pendingActionStore, now = () => Date.now(), authorizedActor, getBlockHeight } = params
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let record: ReturnType<typeof makePendingActionRecord> | null = null
  const assertAuthorized = () => {
    if (authorizedActor && !sameActor(actor, authorizedActor())) throw preSubmissionError('authorized wallet account changed before signing')
  }
  return {
    async prepare() {
      assertAuthorized()
      const read = await client.readRitual(ritualAddress)
      if (kind === 'fund' || kind === 'activate') {
        if (kind === 'fund') {
          if (!(memberSource instanceof PublicKey)) throw new Error('member token account is unavailable')
          prepared = await client.prepareFund({ programId: client.programId, ritual: { address: read.address, account: read.account }, member: actor, memberSource })
        } else {
          prepared = await client.prepareActivate({ programId: client.programId, ritual: { address: read.address, account: read.account }, feePayer: actor })
        }
      } else {
        if (kind === 'initialize-event') {
          prepared = await client.prepareInitializeEvent({ programId: client.programId, ritual: { address: read.address, account: read.account }, eventIndex, payer: actor })
        } else {
          const bundle = await client.getEventBundle(ritualAddress, eventIndex)
          if (!bundle.event && kind !== 'claim') throw new Error('the current event is not initialized')
          const event = bundle.event ? { address: bundle.event.address, account: bundle.event.account } : null
          if (kind === 'claim') {
            prepared = event
              ? await client.prepareClaim({ programId: client.programId, ritual: { address: read.address, account: read.account }, event, claimant })
              : await client.prepareInitializeAndClaim({ programId: client.programId, ritual: { address: read.address, account: read.account }, eventIndex, payer: actor, claimant })
          } else {
            const claimEntry = bundle.claims.find((entry) => entry.member.equals(claimant) && entry.account !== null)
            if ((kind === 'approve' || kind === 'question') && (!claimEntry || !claimEntry.account)) throw new Error('the claim is not available')
            if (kind === 'approve') prepared = await client.prepareApprove({ programId: client.programId, ritual: { address: read.address, account: read.account }, event: event!, claim: { address: claimEntry!.address, account: claimEntry!.account! }, approver: actor })
            else if (kind === 'question') prepared = await client.prepareQuestion({ programId: client.programId, ritual: { address: read.address, account: read.account }, event: event!, claim: { address: claimEntry!.address, account: claimEntry!.account! }, questioner: actor })
            else prepared = await client.prepareFinalize({ programId: client.programId, ritual: { address: read.address, account: read.account }, event: event!, destinationTokenAccounts, feePayer: actor })
          }
        }
      }
      return { kind, messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }
    },
    async submit() {
      if (!prepared) throw new Error('cannot submit before preparing')
      assertAuthorized()
      if (getBlockHeight) {
        const current = await getBlockHeight()
        if (Number.isSafeInteger(current) && current > prepared.lastValidBlockHeight) throw preSubmissionError('prepared blockhash expired before signing', true)
      }
      if (pendingActionStore) {
        record = makePendingActionRecord(prepared, now())
        await pendingActionStore.upsert(record)
      }
      try { handle = await client.submitPrepared(prepared) } catch (error) {
        const e = error as { submitted?: unknown; signature?: unknown } | null
        if (e && typeof e === 'object' && e.submitted === true && typeof e.signature === 'string' && pendingActionStore && record) {
          try { await pendingActionStore.upsert(withPendingActionSignature(record, e.signature)) } catch { /* resolver still has the unsigned record */ }
        }
        throw error
      }
      if (pendingActionStore && record) {
        try {
          record = withPendingActionSignature(record, handle.signature)
          await pendingActionStore.upsert(record)
        } catch { throw Object.assign(new Error('transaction submitted but recovery could not be saved'), { submitted: true }) }
      }
      return { id: prepared.messageDigest }
    },
    async confirm() {
      if (!handle) throw new Error('cannot confirm before submitting')
      const result = await client.confirmSubmitted(handle)
      if (pendingActionStore && record) {
        try { await pendingActionStore.remove(record) } catch { /* recovery resolver can clear it later */ }
      }
      return { signature: result.signature, messageDigest: result.messageDigest }
    },
  }
}
