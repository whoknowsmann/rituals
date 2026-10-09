/**
 * App-level devnet proof for the SOLO journey.
 *
 * Drives the exact modules the solo screens call: buildSoloCreateDeps +
 * runCreateRitual (SoloCreateScreen "Approve & make it real") and
 * buildRitualActionDeps('claim' | 'initialize-event' | 'finalize') +
 * runLifecycleAction (SoloRitualScreen HOLD / Settle). The only substitute is
 * the wallet transport: a local devnet keypair signs the prepared bytes.
 *
 * Why: scripts/smoke-solo.ts calls the preparer directly, so it never exercised
 * the screen-side event read. On 2026-10-01 the phone's first stamp failed with
 * "Ritual event was not found" before Phantom opened, and a successful create
 * reported "Confirmation incomplete". This script fails on both.
 *
 * Usage (devnet only; never the Solana CLI default wallet):
 *   npx tsx scripts/smoke-app-solo.ts --keypair .keys/rituals-solo-smoke-owner.json \
 *     --creator-token-account <TEST ATA> [--season <address>] [--claim-window-seconds N] [--cadence demo|real]
 * Without --season it creates a standalone solo ritual on the app's own solo
 * cadence (DEMO_SOLO_CADENCE: 90 s lead, 90 s check-in, 2-minute weeks, ~5 min end to end).
 * --claim-window-seconds N swaps in a shorter test cadence instead.
 * --cadence real creates on REAL_SOLO_CADENCE (the create screen's "Real
 * weeks": 90 s lead, 6 d check-in, 23 h grace, 7 d period), prints every
 * window read back from chain as ±seconds from now, asserts the shape, waits
 * for week 1 to open, stamps, verifies the claim and exits 0. It does NOT wait
 * for settlement (that is a week away); the demo path is unchanged.
 */
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import { makeRitualTransport } from '../src/features/rituals/client/ritualTransport'
import { feeForMessageAtSlot, withReadRetry } from '../src/features/rituals/client/resilientRead'
import { createCurrentRitualClient, type RitualClientTransport } from '../src/data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../src/data/rituals/ritualSubmission'
import { buildSoloCreateDeps } from '../src/features/rituals/solo/create/buildSoloCreateDeps'
import { selectSoloSchedule } from '../src/features/rituals/solo/create/schedule'
import { runCreateRitual } from '../src/features/rituals/create/runCreateRitual'
import { buildRitualActionDeps } from '../src/features/rituals/buildRitualActionDeps'
import { runLifecycleAction } from '../src/features/rituals/runLifecycleAction'
import { lifecycleInitialState, lifecycleReducer, type LifecycleEvent, type LifecycleState } from '../src/features/rituals/lifecycleMachine'
import { DEMO_CAUSES } from '../src/data/rituals/demoConfig'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { decodeSeason } from '../src/data/rituals/accounts'
import { connectionFor, integerOption, option, parseCli, readKeypair, requiredOption } from './lib/cli'
import { refuseMainnetFundedPayer } from './lib/chain'
import { demoCadenceFrom } from './lib/demoCadence'
import { DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE } from '../src/domain/rituals/schedule'
import { autoSettleWeek } from '../src/features/rituals/solo/settler/autoSettle'
import { createSettlerClient } from '../src/features/rituals/solo/settler/settlerClient'
import { settlerBudgetLamports } from '../src/features/rituals/solo/settler/settlerBudget'

const HOUR = 3600
const DAY = 24 * HOUR

function stateRunner() {
  let state: LifecycleState = lifecycleInitialState()
  const dispatch = (event: LifecycleEvent) => { state = lifecycleReducer(state, event) }
  return { dispatch, get state() { return state } }
}

async function sleepUntil(unixSeconds: number, label: string): Promise<void> {
  const wait = unixSeconds * 1000 - Date.now()
  if (wait > 0) { console.log(`waiting ${Math.ceil(wait / 1000)}s for ${label}`); await new Promise((resolve) => setTimeout(resolve, wait + 2000)) }
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url } = connectionFor(args)
  if (!url.includes('devnet')) throw new Error('devnet only')
  const owner = readKeypair(requiredOption(args, 'keypair') as string)
  await refuseMainnetFundedPayer(url, owner)
  const creatorToken = new PublicKey(requiredOption(args, 'creator-token-account') as string)
  const seasonText = option(args, 'season')
  const connection = new Connection(url, 'confirmed')

  // --simulate-wallet-fee-change: sign a copy with our priority fee replaced,
  // as Seed Vault Wallet did on 2026-10-03, so the app path must verify the
  // landed transaction instead of the exact reviewed bytes.
  const mutateFee = args['simulate-wallet-fee-change'] !== undefined
  const transport: RitualClientTransport & RitualWalletSubmissionTransport = makeRitualTransport(connection, async (transaction: Transaction, minContextSlot: number) => {
    if (!transaction.feePayer?.equals(owner.publicKey)) throw new Error('prepared fee payer is not the local signer')
    let outgoing = transaction
    if (mutateFee) {
      outgoing = new Transaction({ feePayer: transaction.feePayer, blockhash: transaction.recentBlockhash!, lastValidBlockHeight: transaction.lastValidBlockHeight! })
      outgoing.add(...transaction.instructions.map((ix) => (ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3 ? ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }) : ix)))
    }
    outgoing.partialSign(owner)
    return connection.sendRawTransaction(outgoing.serialize(), { preflightCommitment: 'confirmed', minContextSlot })
  })
  if (mutateFee) console.log('simulating a wallet that rewrites the priority fee before signing')
  const client = createCurrentRitualClient(transport, transport)
  // Where missed weeks go: --cause-index N (default 0) or --person <wallet> (Jack, 2026-10-06 picker).
  const personText = option(args, 'person')
  const causeIndex = Number(option(args, 'cause-index', '0'))
  const cause = DEMO_CAUSES[causeIndex]
  if (!personText && (!cause || cause.tokenAccount === null)) throw new Error(`demo cause ${causeIndex} is not configured`)
  const config0 = await client.getProtocolConfig()
  const destinationAccount = personText ? getAssociatedTokenAddressSync(config0.account.allowedStakeMint, new PublicKey(personText)) : cause!.tokenAccount!
  console.log(`missed weeks go to ${personText ? `wallet ${personText}` : cause!.label}: ${destinationAccount.toBase58()}`)

  const season = seasonText
    ? decodeSeason((await connection.getAccountInfo(new PublicKey(seasonText), 'confirmed'))!, client.programId, new PublicKey(seasonText))
    : null
  // Two weeks standalone: week 1 kept (stamp), week 2 missed (nobody checks in).
  const eventCount = season ? season.schedule.length : 2
  // --cadence real: the create screen's "Real weeks" option. Its windows are
  // the point of the run, so a Season template or a test cadence is refused.
  const speed = option(args, 'cadence', 'demo')
  if (speed !== 'demo' && speed !== 'real') throw new Error('--cadence must be demo or real')
  const realWeeks = speed === 'real'
  if (realWeeks && (seasonText !== undefined || option(args, 'claim-window-seconds') !== undefined)) throw new Error('--cadence real cannot be combined with --season or --claim-window-seconds')
  // Default to exactly what SoloCreateScreen ships, so a green run proves it.
  const cadence = realWeeks
    ? REAL_SOLO_CADENCE
    : option(args, 'claim-window-seconds') === undefined
      ? DEMO_SOLO_CADENCE
      : demoCadenceFrom({ claimWindowSeconds: integerOption(args, 'claim-window-seconds', 120) })
  console.log(`cadence: ${cadence.claimWindowSeconds}s check-in, ${cadence.resolutionGraceSeconds}s grace, ${cadence.periodSeconds}s period`)
  const schedule = selectSoloSchedule({ cadence, referenceSeconds: Math.floor(Date.now() / 1000), eventCount, seasonSchedule: season?.schedule })
  const before = (await getAccount(connection, creatorToken, 'confirmed')).amount
  // The app's settle key: funded inside the create approval, then it opens and
  // settles weeks with no further owner signature (SoloRitualScreen auto-settle).
  const settler = Keypair.generate()
  const settlerClient = createSettlerClient(connection, settler)
  const settlerFunding = { to: settler.publicKey, lamports: settlerBudgetLamports(eventCount) }

  console.log('\n[create + fund + activate] (SoloCreateScreen path)')
  let ritualText: string | null = null
  const created = await runCreateRitual(buildSoloCreateDeps({
    client,
    creator: owner.publicKey,
    title: 'App solo proof',
    requirement: 'Check in inside the window.',
    eventCount,
    stakePerWeekAtomic: BigInt(process.env.SMOKE_PER_WEEK_ATOMIC ?? '1000000'),
    schedule,
    witnessMode: 'just-me',
    destination: personText ? 'person' : 'cause',
    causeTokenAccount: personText ? null : cause!.tokenAccount,
    personAddress: personText,
    seasonAddress: seasonText ? new PublicKey(seasonText) : null,
    settlerFunding,
    authorizedActor: () => owner.publicKey,
  }), (event) => { if (event.type === 'PREPARED') ritualText = event.prepared.ritualAddress })
  if (!created.ok || !ritualText) throw new Error(`create did not confirm (${created.ok ? 'no address' : created.category}) — this is the "Confirmation incomplete" bug`)
  const ritualAddress = new PublicKey(ritualText)
  const active = await client.readRitual(ritualAddress)
  if (active.account.status !== 'Active' || active.account.kind !== 'Solo') throw new Error('create readback is not an Active solo ritual')
  console.log('PASS create confirmed through the app path:', created.result.signature, ritualAddress.toBase58())
  const settlerBalance = await connection.getBalance(settler.publicKey, 'confirmed')
  if (BigInt(settlerBalance) !== settlerFunding.lamports) throw new Error(`settle key holds ${settlerBalance}, expected ${settlerFunding.lamports} from the create approval`)
  console.log('PASS settle key funded inside the same approval:', settlerBalance, 'lamports')

  const window0 = active.account.schedule[0]
  if (realWeeks) {
    console.log('\n[real weeks] windows read back from chain, as seconds from now')
    const now = Math.floor(Date.now() / 1000)
    const fromNow = (value: bigint) => { const delta = Number(value) - now; return `${delta >= 0 ? '+' : ''}${delta}s` }
    active.account.schedule.forEach((window, index) => console.log(`week ${index + 1}: opens ${fromNow(window.opens)} · deadline ${fromNow(window.deadline)} · resolution ${fromNow(window.resolution)}`))
    const window1 = active.account.schedule[1]
    const lead = Number(window0.opens) - Number(active.account.createdAt)
    if (Math.abs(lead - 90) > 30) throw new Error(`week 1 opens ${lead}s after the chain's create time; expected 90s ±30s`)
    if (Number(window0.deadline) - Number(window0.opens) !== 6 * DAY) throw new Error(`week 1 check-in is ${Number(window0.deadline) - Number(window0.opens)}s, expected 6 days`)
    if (Number(window0.resolution) - Number(window0.deadline) !== 23 * HOUR) throw new Error(`week 1 grace is ${Number(window0.resolution) - Number(window0.deadline)}s, expected 23 hours`)
    if (Number(window1.opens) - Number(window0.opens) !== 7 * DAY) throw new Error(`week 2 opens ${Number(window1.opens) - Number(window0.opens)}s after week 1, expected 7 days`)
    console.log(`PASS real-weeks windows: week 1 opens ${lead}s after create, 6 d check-in, 23 h grace, week 2 opens 7 d later`)
  }
  await sleepUntil(Number(window0.opens), 'week 1 to open')

  console.log('\n[hold to stamp] (SoloRitualScreen HOLD path, week not yet opened)')
  const claimRunner = stateRunner()
  const claimed = await runLifecycleAction(buildRitualActionDeps({ client, ritualAddress, actor: owner.publicKey, kind: 'claim', eventIndex: 0, claimant: owner.publicKey, authorizedActor: () => owner.publicKey }), claimRunner.dispatch)
  if (!claimed.ok) throw new Error(`stamp failed in ${claimed.category} — this is the "Ritual event was not found" bug`)
  const afterClaim = await client.getEventBundle(ritualAddress, 0)
  const claim = afterClaim.claims.find((entry) => entry.member.equals(owner.publicKey))?.account
  if (!claim || claim.status !== 'Confirmed') throw new Error('stamp readback is not Confirmed')
  console.log('PASS stamp confirmed through the app path:', claimed.result.signature)

  if (realWeeks) {
    // Settlement is a week away; the ritual screen (settle key) or the wallet
    // fallback closes it then. Leave the ritual on devnet and stop here.
    const settlerLeft = await connection.getBalance(settler.publicKey, 'confirmed')
    console.log(JSON.stringify({ script: 'smoke-app-solo', cadence: 'real', ritual: ritualAddress.toBase58(), ownerSignatures: 2, settleKeySignatures: 0, settleKeyLamportsLeft: settlerLeft, week1SettlesAfter: new Date(Number(window0.resolution) * 1000).toISOString(), status: 'APP SOLO REAL-WEEKS CREATE + STAMP VERIFIED ON DEVNET (settlement not awaited)' }))
    return
  }

  await sleepUntil(Number(window0.resolution), 'the week to close')
  console.log('\n[auto-settle week 1] (SoloRitualScreen, settle key, no owner signature)')
  const settled = await autoSettleWeek({ client: settlerClient, ritualAddress, settler: settler.publicKey, eventIndex: 0, needsEventInit: false, destinationTokenAccounts: [creatorToken] })
  if (!settled.ok) throw new Error(`auto-settle failed at ${settled.step} (${settled.category})`)
  const final = await client.getEventBundle(ritualAddress, 0)
  if (final.event?.account.status !== 'Settled') throw new Error('settle readback is not Settled')
  const after = (await getAccount(connection, creatorToken, 'confirmed')).amount
  console.log('PASS week 1 settled by the settle key:', settled.signatures.join(' '))

  let missed: string[] = []
  if (!seasonText) {
    const window1 = active.account.schedule[1]
    const causeBefore = (await getAccount(connection, destinationAccount, 'confirmed')).amount
    await sleepUntil(Number(window1.resolution), 'week 2 to lapse with no check-in')
    console.log('\n[auto-settle missed week 2] (open + settle, settle key, no owner signature)')
    const lapsed = await autoSettleWeek({ client: settlerClient, ritualAddress, settler: settler.publicKey, eventIndex: 1, needsEventInit: true, destinationTokenAccounts: [creatorToken] })
    if (!lapsed.ok) throw new Error(`missed-week auto-settle failed at ${lapsed.step} (${lapsed.category})`)
    // Read back through the app's own reader: this threw "decoding failed" on 2026-10-02.
    const week2 = await client.getEventBundle(ritualAddress, 1)
    if (week2.event?.account.status !== 'Settled' || week2.event.account.forfeitedTotal !== active.account.perEventAllocation) throw new Error('missed week did not read back as Settled with the stake forfeited')
    const causeAfter = (await getAccount(connection, destinationAccount, 'confirmed')).amount
    if (causeAfter - causeBefore !== active.account.perEventAllocation) throw new Error(`cause received ${causeAfter - causeBefore}, expected ${active.account.perEventAllocation}`)
    missed = [...lapsed.signatures]
    console.log('PASS missed week settled to the cause by the settle key and read by the app reader:', missed.join(' '))
  }
  const settlerLeft = await connection.getBalance(settler.publicKey, 'confirmed')
  console.log(JSON.stringify({ script: 'smoke-app-solo', ritual: ritualAddress.toBase58(), season: seasonText ?? null, ownerSignatures: 2, settleKeySignatures: settled.signatures.length + missed.length, settleKeyLamportsLeft: settlerLeft, creatorTokenDelta: (after - before).toString(), status: 'APP SOLO PATH VERIFIED ON DEVNET' }))
}

main().catch((error: unknown) => {
  // Name + message: spl-token's TokenAccountNotFoundError has an empty message,
  // which once printed a bare "FAILED:" when the mint was passed as the ATA.
  console.error('FAILED:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  process.exit(1)
})
