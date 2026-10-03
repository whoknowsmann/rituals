/**
 * Read every event bundle of a Ritual through the app's reader and print the
 * result or the exact failure. Read-only; devnet.
 *   npx tsx scripts/diag-event-bundles.ts <ritual address>
 */
import { Connection, PublicKey } from '@solana/web3.js'
import { withReadRetry } from '../src/features/rituals/client/resilientRead'
import { createCurrentRitualClient, type RitualClientTransport } from '../src/data/rituals/ritualClient'

async function main(): Promise<void> {
  const address = new PublicKey(process.argv[2])
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const transport = {
    getMultipleAccountsInfoAndContext: withReadRetry(connection.getMultipleAccountsInfoAndContext.bind(connection)),
    getLatestBlockhashAndContext: withReadRetry(connection.getLatestBlockhashAndContext.bind(connection)),
    getFeeForMessage: connection.getFeeForMessage.bind(connection),
    getMinimumBalanceForRentExemption: connection.getMinimumBalanceForRentExemption.bind(connection),
    confirmTransaction: () => { throw new Error('read-only') },
    signAndSendTransaction: () => { throw new Error('read-only') },
  } as unknown as RitualClientTransport
  const client = createCurrentRitualClient(transport, transport as never)
  const ritual = await client.readRitual(address)
  console.log('status', ritual.account.status, 'currentEventIndex', ritual.account.currentEventIndex, 'settled', ritual.account.settledEventCount)
  for (let index = 0; index <= Math.min(ritual.account.currentEventIndex, 15); index += 1) {
    try {
      const bundle = await client.getEventBundle(address, index)
      console.log(index, 'OK', bundle.event?.account.status, 'forfeited', bundle.event?.account.forfeitedTotal.toString(), 'claims', bundle.claims.map((c) => c.account?.status ?? null))
    } catch (error) {
      const e = error as { name?: string; code?: string; category?: string; message?: string }
      console.log(index, 'FAIL', e.name, e.code ?? e.category, e.message)
    }
  }
}
void main().catch((error) => { console.error(error); process.exit(1) })
