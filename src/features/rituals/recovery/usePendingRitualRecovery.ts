import { useEffect, useState } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import type { RitualClientState } from '../client/useRitualClient'
import {
  asyncStoragePendingActionStore,
  resolvePendingAction,
  type PendingActionRecord,
  type PendingActionResolution,
  type PendingActionSignatureStatus,
  type PendingActionStore,
} from './pendingAction'

export type PendingRecoveryTransport = Readonly<{
  getSignatureStatus: (signature: string) => Promise<PendingActionSignatureStatus | null>
  getBlockHeight: () => Promise<number>
  readRitual: (address: PublicKey, record: PendingActionRecord) => Promise<Readonly<{ slot: number; actionObserved: boolean }>>
}>

export type PendingRecoveryNotice = Readonly<{
  title: 'We found a transaction from before the app closed'
  body: string
  resolution: PendingActionResolution
}>

const copyFor = (resolution: PendingActionResolution): string => {
  switch (resolution.status) {
    case 'confirmed': return 'It is confirmed on-chain. Your ritual state is up to date.'
    case 'failed': return 'It failed on-chain. Nothing from this transaction was applied.'
    case 'expired': return 'It expired before landing. Nothing was resubmitted.'
    case 'still-unknown': return 'We cannot tell yet whether it landed. Check your rituals before acting again.'
  }
}

export async function resolvePendingActions(
  store: PendingActionStore,
  transport: PendingRecoveryTransport,
): Promise<readonly PendingActionResolution[]> {
  const records = await store.list()
  const resolutions: PendingActionResolution[] = []
  for (const record of records) {
    const resolution = await resolvePendingAction(record, transport)
    resolutions.push(resolution)
    if (resolution.status !== 'still-unknown') {
      try { await store.remove(record) } catch { /* leave the record for a later retry */ }
    }
  }
  return Object.freeze(resolutions)
}

export function usePendingRitualRecovery(
  clientState: RitualClientState,
  connection: Connection,
  store: PendingActionStore = asyncStoragePendingActionStore,
): PendingRecoveryNotice | null {
  const [notice, setNotice] = useState<PendingRecoveryNotice | null>(null)

  useEffect(() => {
    let mounted = true
    if (clientState.status !== 'ready') return () => { mounted = false }
    const client = clientState.client
    const transport: PendingRecoveryTransport = {
      getSignatureStatus: async (signature): Promise<PendingActionSignatureStatus | null> => {
        const response = await connection.getSignatureStatuses([signature])
        const value = response.value[0]
        return value === null ? null : { slot: value.slot, err: value.err, confirmationStatus: value.confirmationStatus ?? null }
      },
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
      readRitual: async (address) => {
        const read = await client.readRitual(address)
        return { slot: read.slot, actionObserved: true }
      },
    }
    void resolvePendingActions(store, transport).then((resolutions) => {
      if (!mounted) return
      const resolution = resolutions[0]
      if (resolution) setNotice(Object.freeze({ title: 'We found a transaction from before the app closed', body: copyFor(resolution), resolution }))
    }).catch(() => {
      // Recovery is best effort; the journal remains available for the next mount.
    })
    return () => { mounted = false }
  }, [clientState, connection, store])

  return notice
}
