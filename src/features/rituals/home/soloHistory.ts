import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import type { RitualBundleRead } from '../../../data/rituals/ritualsRpc'

/** Closed weeks of a solo ritual: every week before the current one, or all of them once it completes. */
export function closedWeekCount(account: Readonly<{ kind: 'Group' | 'Solo'; status: string; currentEventIndex: number; schedule: readonly unknown[] }>): number {
  if (account.kind !== 'Solo') return 0
  const closed = account.status === 'Completed' ? account.schedule.length : account.currentEventIndex
  return Math.max(0, Math.min(closed, 16))
}

/**
 * Reads each closed week of a solo ritual so Home can show kept vs missed
 * (the ritual account alone only counts settled weeks, so Home used to tick
 * every one). A week that fails to read is left out, never guessed.
 */
export async function readSoloHistory(client: Pick<RitualClient, 'getEventBundle'>, address: string, account: Parameters<typeof closedWeekCount>[0]): Promise<readonly RitualBundleRead[]> {
  const count = closedWeekCount(account)
  if (count === 0) return []
  const key = new PublicKey(address)
  const reads = await Promise.all(Array.from({ length: count }, (_, index) => client.getEventBundle(key, index).catch(() => null)))
  return reads.filter((read): read is RitualBundleRead => read !== null)
}
