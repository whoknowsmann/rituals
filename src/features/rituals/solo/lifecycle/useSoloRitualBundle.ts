import { useEffect, useRef, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import type { RitualClientState } from '../../client/useRitualClient'
import { useRitualBundle, type BundleState } from '../../authoritativeRituals'
import type { SoloRitualBundle } from './soloRitualModel'

/**
 * Historical event reads are bounded to the protocol's 16-event maximum. The
 * current bundle supplies the open event; past cells need explicit event
 * bundles because a Ritual account only carries aggregate settledEventCount.
 */
export function useSoloRitualBundle(clientState: RitualClientState, addressText: string, receiptEventIndex?: number): BundleState & { bundle?: SoloRitualBundle } {
  const current = useRitualBundle(clientState, addressText, receiptEventIndex)
  const [history, setHistory] = useState<readonly RitualBundleRead[]>([])
  const generation = useRef(0)
  const historyFor = useRef<string | null>(null)
  useEffect(() => {
    const generationValue = ++generation.current
    // Keep the last history while re-reading the same ritual (no flicker);
    // clear it only when the screen shows a different ritual.
    if (historyFor.current !== addressText) { historyFor.current = addressText; setHistory([]) }
    if (current.status !== 'ready' || clientState.status !== 'ready' || !current.bundle) return
    const readyBundle = current.bundle
    const account = readyBundle.ritual.account
    // Only the final receipt needs ritual totals; ordinary receipts stay one-week reads.
    if (receiptEventIndex !== undefined && (account.status !== 'Completed' || receiptEventIndex !== account.schedule.length - 1)) return
    const count = Math.min(account.currentEventIndex, 16)
    if (count === 0) return
    void Promise.all(
      Array.from({ length: count }, (_, eventIndex) => eventIndex)
        .filter((eventIndex) => eventIndex !== readyBundle.event?.account.eventIndex)
        .map((eventIndex) => clientState.client.getEventBundle(new PublicKey(addressText), eventIndex).catch(() => null)),
    ).then((bundles) => {
      if (generation.current !== generationValue) return
      setHistory(Object.freeze(bundles.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null)))
    })
    return () => { generation.current += 1 }
  }, [addressText, receiptEventIndex, clientState, current.status, current.status === 'ready' ? current.bundle : null])
  if (current.status !== 'ready') return current
  const enriched = Object.freeze({ ...current.bundle, history: historyFor.current === addressText ? history : [] })
  return Object.freeze({ ...current, bundle: enriched }) as BundleState & { bundle?: SoloRitualBundle }
}
