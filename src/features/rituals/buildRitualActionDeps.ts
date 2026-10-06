import { PublicKey } from '@solana/web3.js'
import { RitualRpcError } from '../../data/rituals/ritualsRpc'
import type { RitualClient } from '../../data/rituals/ritualClient'
import type { PreparedRitualAction } from '../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../data/rituals/ritualSubmission'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionStore } from './recovery/pendingAction'
import { canBundleFundAndActivate } from './fundActivationSelection'
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
  /** Chain clock used to avoid bundling after the first event window opens. */
  getUnixTimestamp?: () => Promise<number>
  /** Token-account raw amount reader used to check activation vault preconditions. */
  getTokenAccountAmount?: (address: PublicKey) => Promise<bigint>
}>

const sameActor = (expected: PublicKey, actual: PublicKey | null): boolean => actual !== null && actual.equals(expected)
const preSubmissionError = (message: string, blockhashExpired = false): Error & { blockhashExpired?: boolean } => Object.assign(new Error(message), blockhashExpired ? { blockhashExpired: true } : {})

export function buildRitualActionDeps(params: RitualActionDepsParams): LifecycleActionDeps {
  const { client, ritualAddress, actor, kind, memberSource, eventIndex = 0, claimant = actor, destinationTokenAccounts = [], pendingActionStore, now = () => Date.now(), authorizedActor, getBlockHeight, getUnixTimestamp, getTokenAccountAmount } = params
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let record: ReturnType<typeof makePendingActionRecord> | null = null
  const shouldBundleFunding = async (read: Awaited<ReturnType<RitualClient['readRitual']>>): Promise<boolean> => {
    if (!getUnixTimestamp || !getTokenAccountAmount) return false
    try {
      if (!canBundleFundAndActivate(read.account, actor, await getUnixTimestamp())) return false
      const index = read.account.members.findIndex((member) => member.equals(actor))
      if (index < 0) return false
      const feeShare = read.account.feePayerMode === 'Host'
        ? (actor.equals(read.account.creator) ? read.account.lockedActivationFee : 0n)
        : read.account.lockedActivationFee / BigInt(read.account.members.length) + (BigInt(index) < read.account.lockedActivationFee % BigInt(read.account.members.length) ? 1n : 0n)
      const [stakeVaultAmount, feeVaultAmount] = await Promise.all([
        getTokenAccountAmount(read.account.stakeVault),
        getTokenAccountAmount(read.account.feeVault),
      ])
      return stakeVaultAmount >= read.account.fundedStakeTotal && feeVaultAmount >= read.account.lockedActivationFee - feeShare
    } catch { return false }
  }
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
          prepared = await (await shouldBundleFunding(read)
            ? client.prepareFundAndActivate({ programId: client.programId, ritual: { address: read.address, account: read.account }, member: actor, memberSource })
            : client.prepareFund({ programId: client.programId, ritual: { address: read.address, account: read.account }, member: actor, memberSource }))
        } else {
          prepared = await client.prepareActivate({ programId: client.programId, ritual: { address: read.address, account: read.account }, feePayer: actor })
        }
      } else {
        if (kind === 'initialize-event') {
          prepared = await client.prepareInitializeEvent({ programId: client.programId, ritual: { address: read.address, account: read.account }, eventIndex, payer: actor })
        } else {
          // The reader throws 'not-found' for a week nobody has opened yet. Only a
          // claim may open it (initialize + claim in one approval); every other
          // action still fails closed below.
          const bundle = await client.getEventBundle(ritualAddress, eventIndex).catch((error: unknown) => {
            if (kind === 'claim' && error instanceof RitualRpcError && error.category === 'not-found') return { event: null, claims: [] }
            throw error
          })
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
        record = { ...makePendingActionRecord(prepared, now()), actor: actor.toBase58(), eventIndex }
        await pendingActionStore.upsert(record)
      }
      assertAuthorized()
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
