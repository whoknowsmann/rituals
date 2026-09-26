/**
 * Print a Ritual's lifecycle state and event schedule relative to chain time.
 * Read-only. Usage: npx tsx scripts/ritual-schedule.ts RITUAL_ADDRESS
 */
import { Connection, PublicKey } from '@solana/web3.js'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

async function main(): Promise<void> {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const reader = new RitualsRpcReader(
    { getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never,
    RITUALS_PROGRAM_ID,
  )
  const address = new PublicKey(process.argv[2])
  const read = await reader.getRitualBundle(address)
  const a = read.ritual.account as unknown as Record<string, unknown>
  const now = await connection.getBlockTime(await connection.getSlot('confirmed'))
  console.log('chain now       :', now)
  console.log('status          :', a.status, '| current event:', a.currentEventIndex, '| settled:', a.settledEventCount)
  const schedule = (a.schedule as Array<Record<string, bigint | number>>) ?? []
  schedule.slice(0, Number(a.eventCount ?? schedule.length)).forEach((w, i) => {
    const rel = (t: bigint | number) => `${Number(t) - (now ?? 0) >= 0 ? '+' : ''}${Number(t) - (now ?? 0)}s`
    console.log(`event ${i}: opens ${rel(w.opens)}  deadline ${rel(w.deadline)}  resolution ${rel(w.resolution)}`)
  })
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
