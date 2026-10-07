import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Connection } from '@solana/web3.js'
import { estimatedChainTime, readChainTime, type ChainTimeSample } from './chainTime'

/**
 * Re-sync on resume/focus; no phone-time fallback on an outage. The last
 * reading is kept across a short pause (a wallet approval, another screen):
 * blanking it swapped the whole ritual screen for "Checking the week clock…"
 * on every return from the wallet and replayed the stamp. A long pause or a
 * sleeping phone expires it (see estimatedChainTime).
 */
export function useChainTime(connection: Connection, focused = true): number | null {
  const kept = useRef<Readonly<{ connection: Connection; sample: ChainTimeSample }> | null>(null)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    let generation = 0
    let reading = false
    let again = false
    if (kept.current?.connection !== connection) kept.current = null
    const estimate = () => estimatedChainTime(kept.current?.sample ?? null, performance.now(), Date.now())
    const sync = async () => {
      if (!focused || AppState.currentState !== 'active') return
      if (reading) { again = true; return }
      reading = true
      const run = generation
      try {
        const seconds = await readChainTime(connection)
        if (alive && run === generation) { kept.current = { connection, sample: { seconds, monotonicMs: performance.now(), wallMs: Date.now() } }; setNow(seconds) }
      } catch { /* stale samples expire below; never guess from Date.now */ }
      finally {
        reading = false
        if (again && alive) { again = false; void sync() }
      }
    }
    setNow(estimate())
    void sync()
    // A read in flight across a pause is stale: drop it, and read again on return.
    const listener = AppState.addEventListener('change', (state) => {
      generation++
      if (state !== 'active') return
      setNow(estimate())
      void sync()
    })
    const tick = setInterval(() => { if (alive && focused) setNow(estimate()) }, 1000)
    const refresh = setInterval(() => { void sync() }, 15_000)
    return () => { alive = false; listener.remove(); clearInterval(tick); clearInterval(refresh) }
  }, [connection, focused])
  return now
}
