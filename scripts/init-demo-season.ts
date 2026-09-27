/** Initialize (or read) the deterministic October Run Club Season. */
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { buildInitializeSeasonInstruction } from '../src/data/rituals/instructionsLifecycle'
import { decodeSeason } from '../src/data/rituals/accounts'
import { seasonPda } from '../src/data/rituals/pdas'
import { DEMO_CADENCE, generateRitualSchedule, nextWeekdayOccurrence, WEEKLY_CADENCE } from '../src/domain/rituals/schedule'
import { flag, connectionFor, integerOption, option, parseCli, printJsonSummary, readKeypair, requiredOption } from './lib/cli'
import { hashBytes, readProtocolConfig, refuseMainnetFundedPayer, seasonSummary, LOCAL_FAST_CADENCE } from './lib/chain'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

function scheduleFor(now: number, weekly: boolean, fast: boolean) {
  if (weekly && fast) throw new Error('--weekly and --fast are mutually exclusive')
  if (weekly) {
    const year = new Date(now * 1000).getUTCMonth() <= 9 ? new Date(now * 1000).getUTCFullYear() : new Date(now * 1000).getUTCFullYear() + 1
    const octoberEnd = Math.floor(Date.UTC(year, 9, 31, 23, 59, 59) / 1000)
    const first = nextWeekdayOccurrence(now, new Date(now * 1000).getUTCDay())
    const candidate = generateRitualSchedule({ firstEventAt: first, eventCount: 16, cadence: WEEKLY_CADENCE })
    const filtered = candidate.filter((entry) => entry.resolutionDeadlineAt <= octoberEnd)
    if (filtered.length === 0) throw new Error('no complete weekly Season window remains through October')
    return { cadence: WEEKLY_CADENCE, schedule: filtered, startAt: first, endAt: octoberEnd }
  }
  if (fast) {
    const first = now + 45
    const schedule = generateRitualSchedule({ firstEventAt: first, eventCount: 4, cadence: LOCAL_FAST_CADENCE })
    return { cadence: LOCAL_FAST_CADENCE, schedule, startAt: first, endAt: schedule[schedule.length - 1].resolutionDeadlineAt + 1 }
  }
  const first = now + 10 * 60
  const schedule = generateRitualSchedule({ firstEventAt: first, eventCount: 16, cadence: DEMO_CADENCE })
  return { cadence: DEMO_CADENCE, schedule, startAt: first, endAt: schedule[schedule.length - 1].resolutionDeadlineAt + 1 }
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url, connection } = connectionFor(args)
  const authorityPath = option(args, 'authority-keypair') ?? option(args, 'keypair') ?? requiredOption(args, 'authority-keypair')
  const authority = readKeypair(authorityPath)
  await refuseMainnetFundedPayer(url, authority)
  const slug = option(args, 'slug', 'october-run-club') as string
  const title = option(args, 'title', 'October Run Club') as string
  if (slug.length === 0 || title.trim().length === 0) throw new Error('--slug and --title must not be empty')
  const seasonId = hashBytes(slug)
  const titleDigest = hashBytes(title)
  const [address] = seasonPda(seasonId, RITUALS_PROGRAM_ID)
  const existing = await connection.getAccountInfo(address, 'confirmed')
  if (existing !== null) {
    const account = decodeSeason(existing, RITUALS_PROGRAM_ID, address)
    printJsonSummary({ script: 'init-demo-season', url, idempotent: true, slug, title, address, ...seasonSummary(address, account) })
    return
  }

  const config = await readProtocolConfig(connection)
  if (!config.account.authority.equals(authority.publicKey)) throw new Error(`authority does not match ProtocolConfig.authority (${config.account.authority.toBase58()})`)
  const selected = scheduleFor(Math.floor(Date.now() / 1000), flag(args, 'weekly'), flag(args, 'fast'))
  const inputSchedule = selected.schedule.map((entry) => ({ opens: BigInt(entry.claimOpensAt), deadline: BigInt(entry.claimDeadlineAt), resolution: BigInt(entry.resolutionDeadlineAt) }))
  const instruction = buildInitializeSeasonInstruction({ programId: RITUALS_PROGRAM_ID, authority: authority.publicKey, season: { seasonId, titleDigest, schedule: inputSchedule, startAt: BigInt(selected.startAt), endAt: BigInt(selected.endAt) } })
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority], { commitment: 'confirmed' })
  const created = await connection.getAccountInfo(address, 'confirmed')
  if (created === null) throw new Error('Season missing after initialization')
  const account = decodeSeason(created, RITUALS_PROGRAM_ID, address)
  printJsonSummary({ script: 'init-demo-season', url, idempotent: false, signature, slug, title, cadence: selected.cadence.label, ...seasonSummary(address, account) })
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
