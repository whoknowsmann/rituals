import { SYSVAR_CLOCK_PUBKEY, type Connection } from '@solana/web3.js'

/** Use the same Clock sysvar as the program, never the phone's wall clock. */
export async function readChainTime(connection: Pick<Connection, 'getAccountInfo'>): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed')
  if (!info || info.data.length !== 40) throw new Error('Could not read the week clock. Try again.')
  const seconds = Number(info.data.readBigInt64LE(32))
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('Week clock is unavailable.')
  return seconds
}

export type ChainTimeSample = Readonly<{ seconds: number; monotonicMs: number }>
/** Short-lived estimate for UI ticks; sends are still checked by the program. */
export function estimatedChainTime(sample: ChainTimeSample | null, monotonicMs: number): number | null {
  if (!sample) return null
  const age = monotonicMs - sample.monotonicMs
  return age >= 0 && age < 60_000 ? sample.seconds + Math.floor(age / 1000) : null
}
