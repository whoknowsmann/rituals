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
export function useSoloRitualBundle(clientState: RitualClientState, addressText: string): BundleState & { bundle?: SoloRitualBundle } {
  const current = useRitualBundle(clientState, addressText)
  const [history, setHistory] = useState<readonly RitualBundleRead[]>([])
  const generation = useRef(0)
  useEffect(() => {
    const generationValue = ++generation.current
    setHistory([])
    if (current.status !== 'ready' || clientState.status !== 'ready' || !current.bundle) return
    const readyBundle = current.bundle
    const account = readyBundle.ritual.account
    const count = Math.min(account.currentEventIndex, 16)
    if (count === 0) return
    void Promise.all(
      Array.from({ length: count }, (_, eventIndex) => clientState.client.getEventBundle(new PublicKey(addressText), eventIndex).catch(() => null)),
    ).then((bundles) => {
      if (generation.current !== generationValue) return
      setHistory(Object.freeze(bundles.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null)))
    })
  }, [addressText, clientState, current.status, current.status === 'ready' ? current.bundle : null])
  if (current.status !== 'ready') return current
  const enriched = Object.freeze({ ...current.bundle, history })
  return Object.freeze({ ...current, bundle: enriched }) as BundleState & { bundle?: SoloRitualBundle }
}
