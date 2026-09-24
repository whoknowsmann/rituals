import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../data/rituals/ritualClient'
import type { PreparedRitualAction } from '../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../data/rituals/ritualSubmission'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionStore } from './recovery/pendingAction'
import type { LifecycleActionDeps } from './runLifecycleAction'

export type RitualActionDepsParams = Readonly<{
  client: RitualClient
  ritualAddress: PublicKey
  actor: PublicKey
  kind: 'fund' | 'activate'
  memberSource?: PublicKey
  pendingActionStore?: PendingActionStore
  now?: () => number
}>

export function buildRitualActionDeps(params: RitualActionDepsParams): LifecycleActionDeps {
  const { client, ritualAddress, actor, kind, memberSource, pendingActionStore, now = () => Date.now() } = params
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let record: ReturnType<typeof makePendingActionRecord> | null = null
  return {
    async prepare() {
      const read = await client.readRitual(ritualAddress)
      if (kind === 'fund') {
        if (!(memberSource instanceof PublicKey)) throw new Error('member token account is unavailable')
        prepared = await client.prepareFund({ programId: client.programId, ritual: { address: read.address, account: read.account }, member: actor, memberSource })
      } else {
        prepared = await client.prepareActivate({ programId: client.programId, ritual: { address: read.address, account: read.account }, feePayer: actor })
      }
      return { kind, messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }
    },
    async submit() {
      if (!prepared) throw new Error('cannot submit before preparing')
      if (pendingActionStore) {
        record = makePendingActionRecord(prepared, now())
        await pendingActionStore.upsert(record)
      }
      handle = await client.submitPrepared(prepared)
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
