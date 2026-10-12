// Read a ritual's schedule and state from devnet (debug aid, 2026-10-11).
//   npx tsx scripts/ritual-schedule-read.ts <ritual address>
import { Connection, PublicKey } from '@solana/web3.js'
import { decodeRitual } from '../src/data/rituals/accounts'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

async function main() {
  const address = new PublicKey(process.argv[2])
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const info = await connection.getAccountInfo(address)
  if (!info) throw new Error('no account')
  const view = decodeRitual({ address, owner: info.owner, data: new Uint8Array(info.data), lamports: BigInt(info.lamports) } as never, RITUALS_PROGRAM_ID)
  const fmt = (t: bigint) => new Date(Number(t) * 1000).toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/Chicago' })
  console.log('status', view.status, 'currentEventIndex', view.currentEventIndex, 'settled', view.settledEventCount, 'kind', view.kind)
  console.log('createdAt', fmt(view.createdAt), 'activatedAt', fmt(view.activatedAt), 'perEvent', view.perEventAllocation.toString())
  view.schedule.forEach((w, i) => console.log(`week ${i + 1}: opens ${fmt(w.opens)} deadline ${fmt(w.deadline)} resolution ${fmt(w.resolution)}`))
  console.log('now', new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/Chicago' }))
}
main().catch((e) => { console.error('FAILED', e?.name, e?.message); process.exit(1) })
