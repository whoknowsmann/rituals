import type { RitualClient } from '../../../data/rituals/ritualClient'
import { readPendingAction } from './readPendingAction'
import { resolvePendingAction, type PendingActionRecord, type PendingActionResolution, type PendingActionStore, type PendingActionTransport } from './pendingAction'

export type ActionReconciler = () => Promise<PendingActionResolution | null>
export type ActionRecoveryEvent = Readonly<{ type: 'READBACK_OBSERVED' | 'EXPIRY_OBSERVED' | 'FAILURE_OBSERVED'; ritualAddress: string }>

/** A retry with no journal entry cannot replace an earlier uncertain send. */
export function retainActionReconciliation(previous: ActionReconciler | undefined, current: ActionReconciler | undefined): ActionReconciler | undefined {
  if (!previous || previous === current) return current
  if (!current) return previous
  return async () => {
    const results = await Promise.all([previous, current].map((read) => Promise.resolve().then(read).catch(() => undefined)))
    const confirmed = results.find((result) => result?.status === 'confirmed')
    if (confirmed) return confirmed
    // An unavailable reader is not proof that all attempts expired.
    if (results.includes(undefined)) throw new Error('Recovery reader unavailable')
    return results.find((result) => result?.status === 'still-unknown')
      ?? results.find((result) => result?.status === 'failed')
      ?? results.find((result) => result?.status === 'expired') ?? null
  }
}

export async function reconcilePendingAction(
  client: RitualClient,
  record: PendingActionRecord | null,
  store?: PendingActionStore,
  getBlockHeight?: PendingActionTransport['getBlockHeight'],
  getSignatureStatus?: PendingActionTransport['getSignatureStatus'],
): Promise<PendingActionResolution | null> {
  if (!record) return null
  const unavailable = async (): Promise<never> => { throw new Error('Recovery reader unavailable') }
  const resolution = await resolvePendingAction(record, {
    getBlockHeight: getBlockHeight ?? unavailable,
    getSignatureStatus: getSignatureStatus ?? unavailable,
    readRitual: (address, target) => readPendingAction(client, address, target),
  })
  if (resolution.status !== 'still-unknown' && store) {
    try { await store.remove(record) } catch { /* keep the durable record for later recovery */ }
  }
  return resolution
}

/**
 * Read immediately, then serialize reads until chain evidence resolves the
 * attempt. `onFirstAnswer` hears once whether the first read showed it landed.
 */
export function watchActionReconciliation(reconcile: ActionReconciler, dispatch: (event: ActionRecoveryEvent) => void, onFirstAnswer?: (landed: boolean) => void): () => void {
  let active = true
  let first = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = async () => {
    const result = await reconcile().catch(() => undefined)
    // null: this attempt never reached the journal, so there is nothing to read back.
    if (!active || result === null) return
    if (first) { first = false; onFirstAnswer?.(result?.status === 'confirmed') }
    if (result?.status === 'confirmed' || result?.status === 'expired' || result?.status === 'failed') {
      dispatch({ type: result.status === 'confirmed' ? 'READBACK_OBSERVED' : result.status === 'expired' ? 'EXPIRY_OBSERVED' : 'FAILURE_OBSERVED', ritualAddress: result.record.ritualAddress })
      return
    }
    timer = setTimeout(() => { void check() }, 3000)
  }
  void check()
  return () => { active = false; if (timer !== undefined) clearTimeout(timer) }
}
