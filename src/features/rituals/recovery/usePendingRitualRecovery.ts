import { useEffect, useRef, useState } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { AppState } from 'react-native'
import { readPendingAction } from './readPendingAction'
import { useAuthorization } from '../../../utils/useAuthorization'
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
  actor: string | null,
  mayContinue: () => boolean = () => true,
): Promise<readonly PendingActionResolution[]> {
  if (!actor || !mayContinue()) return []
  const records = await store.list()
  const resolutions: PendingActionResolution[] = []
  for (const record of records) {
    if (!mayContinue()) break
    // Legacy journals without an actor remain on disk; never attribute them to this wallet.
    if (record.actor !== actor) continue
    const resolution = await resolvePendingAction(record, transport)
    if (!mayContinue()) break
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
  const { selectedAccount } = useAuthorization()
  const actor = selectedAccount?.publicKey.toBase58() ?? null
  const session = useRef({ actor })
  if (session.current.actor !== actor) session.current = { actor }
  const scope = session.current
  const [notice, setNotice] = useState<{ scope: typeof scope; value: PendingRecoveryNotice | null } | null>(null)

  useEffect(() => {
    let mounted = true
    if (clientState.status !== 'ready' || !enabled || !actor) return () => { mounted = false }
    const mayContinue = () => mounted && session.current === scope && AppState.currentState === 'active'
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
      if (running || !mayContinue()) return
      running = true
      void resolvePendingActions(store, transport, actor, mayContinue).then((resolutions) => {
        if (!mayContinue()) return
        // Expired records need no banner; the ritual's readback remains the authority.
        const resolution = resolutions.find((item) => item.status === 'still-unknown') ?? resolutions.find((item) => item.status !== 'expired')
        setNotice({ scope, value: resolution ? Object.freeze({ title: 'Picking up where you left off', body: copyFor(resolution), resolution }) : null })
      }).catch(() => { /* journal remains available for retry */ }).finally(() => { running = false })
    }
    recover()
    const listener = AppState.addEventListener('change', recover)
    const timer = setInterval(recover, 15_000)
    return () => { mounted = false; listener.remove(); clearInterval(timer) }
  }, [clientState, connection, store, enabled, actor, scope])

  return enabled && actor && notice?.scope === scope ? notice.value : null
}
