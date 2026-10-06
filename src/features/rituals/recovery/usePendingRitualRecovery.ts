import { useEffect, useState } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { AppState } from 'react-native'
import { readPendingAction } from './readPendingAction'
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
  title: 'Picking up where you left off'
  body: string
  resolution: PendingActionResolution
}>

const copyFor = (resolution: PendingActionResolution): string => {
  switch (resolution.status) {
    case 'confirmed': return 'Your earlier approval went through. Open the ritual to see it.'
    case 'failed': return 'Your earlier request did not go through.'
    case 'expired': return 'Your earlier request expired. Nothing was sent again.'
    case 'still-unknown': return 'We are still checking your earlier request. Open the ritual before trying again.'
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
  enabled = true,
): PendingRecoveryNotice | null {
  const [notice, setNotice] = useState<PendingRecoveryNotice | null>(null)

  useEffect(() => {
    let mounted = true
    if (clientState.status !== 'ready' || !enabled) return () => { mounted = false }
    const client = clientState.client
    const transport: PendingRecoveryTransport = {
      getSignatureStatus: async (signature): Promise<PendingActionSignatureStatus | null> => {
        const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
        const value = response.value[0]
        return value === null ? null : { slot: value.slot, err: value.err, confirmationStatus: value.confirmationStatus ?? null }
      },
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
      readRitual: (address, record) => readPendingAction(client, address, record),
    }
    let running = false
    const recover = () => {
      if (running || AppState.currentState !== 'active') return
      running = true
      void resolvePendingActions(store, transport).then((resolutions) => {
        if (!mounted) return
        // An expired request sent nothing: there is nothing to tell the user.
        const resolution = resolutions.find((item) => item.status === 'still-unknown') ?? resolutions.find((item) => item.status !== 'expired')
        setNotice(resolution ? Object.freeze({ title: 'Picking up where you left off', body: copyFor(resolution), resolution }) : null)
      }).catch(() => { /* journal remains available for retry */ }).finally(() => { running = false })
    }
    recover()
    const listener = AppState.addEventListener('change', recover)
    const timer = setInterval(recover, 15_000)
    return () => { mounted = false; listener.remove(); clearInterval(timer) }
  }, [clientState, connection, store, enabled])

  return notice
}
