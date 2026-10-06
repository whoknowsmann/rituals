import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import type { Connection } from '@solana/web3.js'
import { estimatedChainTime, readChainTime, type ChainTimeSample } from './chainTime'

/** Re-sync on resume/focus; no phone-time fallback on an outage. */
export function useChainTime(connection: Connection, focused = true): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    let generation = 0
    let reading = false
    let sample: ChainTimeSample | null = null
    const sync = async () => {
      if (!focused || AppState.currentState !== 'active' || reading) return
      reading = true
      const run = generation
      try {
        const seconds = await readChainTime(connection)
        if (alive && run === generation) { sample = { seconds, monotonicMs: performance.now() }; setNow(seconds) }
      } catch { /* stale samples expire below; never guess from Date.now */ }
      finally { reading = false }
    }
    const reset = () => { generation++; sample = null; setNow(null); void sync() }
    reset()
    const listener = AppState.addEventListener('change', reset)
    const tick = setInterval(() => {
      if (alive) setNow(estimatedChainTime(sample, performance.now()))
    }, 1000)
    const refresh = setInterval(() => { void sync() }, 15_000)
    return () => { alive = false; listener.remove(); clearInterval(tick); clearInterval(refresh) }
  }, [connection, focused])
  return now
}
