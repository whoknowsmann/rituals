import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import { RitualRpcError } from '../../../data/rituals/ritualsRpc'
import type { PendingActionReadback, PendingActionRecord } from './pendingAction'

/** Exact-week readback, including a wallet handoff killed before returning a signature. */
export async function readPendingAction(client: RitualClient, address: PublicKey, record: PendingActionRecord): Promise<PendingActionReadback> {
  try {
    const read = await client.readRitual(address)
    if (record.actor && record.eventIndex !== undefined) {
      if (record.actionKind === 'declare-skip') return { slot: read.slot, actionObserved: read.account.skipDeclared && read.account.skipEventIndex === record.eventIndex }
      if (['claim', 'initialize-event-and-claim', 'initialize-event', 'finalize'].includes(record.actionKind)) {
        const bundle = await client.getEventBundle(address, record.eventIndex)
        const observed = record.actionKind === 'initialize-event' ? Boolean(bundle.event)
          : record.actionKind === 'finalize' ? Boolean(bundle.event && ['Settled', 'Voided'].includes(bundle.event.account.status))
          : bundle.claims.some((claim) => claim.member.toBase58() === record.actor && ['Confirmed', 'Pending'].includes(claim.account?.status ?? ''))
        return { slot: bundle.slot, actionObserved: observed }
      }
      if (!record.transactionSignature) throw new Error('No action-specific readback for this request')
    }
    const activeSolo = record.actionKind !== 'create-solo-fund-and-activate' || (read.account.kind === 'Solo' && ['Active', 'Completed'].includes(read.account.status))
    return { slot: read.slot, actionObserved: activeSolo }
  } catch (error) {
    if (error instanceof RitualRpcError && error.category === 'not-found') return { slot: 0, actionObserved: false }
    throw error
  }
}
