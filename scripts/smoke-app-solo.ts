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
 *     --creator-token-account <TEST ATA> [--season <address>] [--claim-window-seconds 120]
 * Without --season it creates a standalone solo ritual on a short demo cadence.
 */
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import { feeForMessageAtSlot, withReadRetry } from '../src/features/rituals/client/resilientRead'
import { createCurrentRitualClient, type RitualClientTransport } from '../src/data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../src/data/rituals/ritualSubmission'
import { buildSoloCreateDeps } from '../src/features/rituals/solo/create/buildSoloCreateDeps'
import { selectSoloSchedule } from '../src/features/rituals/solo/create/schedule'
import { runCreateRitual } from '../src/features/rituals/create/runCreateRitual'
import { buildRitualActionDeps } from '../src/features/rituals/buildRitualActionDeps'
import { runLifecycleAction } from '../src/features/rituals/runLifecycleAction'
import { lifecycleInitialState, lifecycleReducer, type LifecycleEvent, type LifecycleState } from '../src/features/rituals/lifecycleMachine'
import { DEMO_CAUSE } from '../src/data/rituals/demoConfig'
import { decodeSeason } from '../src/data/rituals/accounts'
import { connectionFor, integerOption, option, parseCli, readKeypair, requiredOption } from './lib/cli'
import { refuseMainnetFundedPayer } from './lib/chain'
import { demoCadenceFrom } from './lib/demoCadence'

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

  const transport: RitualClientTransport & RitualWalletSubmissionTransport = {
    getMultipleAccountsInfoAndContext: withReadRetry(connection.getMultipleAccountsInfoAndContext.bind(connection)),
    getLatestBlockhashAndContext: withReadRetry(connection.getLatestBlockhashAndContext.bind(connection)),
    getFeeForMessage: feeForMessageAtSlot(connection.getFeeForMessage.bind(connection) as never) as never,
    getMinimumBalanceForRentExemption: connection.getMinimumBalanceForRentExemption.bind(connection),
    confirmTransaction: (strategy, commitment) => connection.confirmTransaction(strategy, commitment),
    signAndSendTransaction: async (transaction: Transaction, minContextSlot: number) => {
      if (!transaction.feePayer?.equals(owner.publicKey)) throw new Error('prepared fee payer is not the local signer')
      transaction.partialSign(owner)
      return connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed', minContextSlot })
    },
  }
  const client = createCurrentRitualClient(transport, transport)
  if (DEMO_CAUSE.tokenAccount === null) throw new Error('demo cause is not configured')

  const season = seasonText
    ? decodeSeason((await connection.getAccountInfo(new PublicKey(seasonText), 'confirmed'))!, client.programId, new PublicKey(seasonText))
    : null
  const eventCount = season ? season.schedule.length : 1
  const cadence = demoCadenceFrom({ claimWindowSeconds: integerOption(args, 'claim-window-seconds', 120) })
  const schedule = selectSoloSchedule({ cadence, referenceSeconds: Math.floor(Date.now() / 1000), eventCount, seasonSchedule: season?.schedule })
  const before = (await getAccount(connection, creatorToken, 'confirmed')).amount

  console.log('\n[create + fund + activate] (SoloCreateScreen path)')
  let ritualText: string | null = null
  const created = await runCreateRitual(buildSoloCreateDeps({
    client,
    creator: owner.publicKey,
    title: 'App solo proof',
    requirement: 'Check in inside the window.',
    eventCount,
    stakePerWeekAtomic: 1_000_000n,
    schedule,
    witnessMode: 'just-me',
    destination: 'cause',
    causeTokenAccount: DEMO_CAUSE.tokenAccount,
    seasonAddress: seasonText ? new PublicKey(seasonText) : null,
    authorizedActor: () => owner.publicKey,
  }), (event) => { if (event.type === 'PREPARED') ritualText = event.prepared.ritualAddress })
  if (!created.ok || !ritualText) throw new Error(`create did not confirm (${created.ok ? 'no address' : created.category}) — this is the "Confirmation incomplete" bug`)
  const ritualAddress = new PublicKey(ritualText)
  const active = await client.readRitual(ritualAddress)
  if (active.account.status !== 'Active' || active.account.kind !== 'Solo') throw new Error('create readback is not an Active solo ritual')
  console.log('PASS create confirmed through the app path:', created.result.signature, ritualAddress.toBase58())

  const window0 = active.account.schedule[0]
  await sleepUntil(Number(window0.opens), 'week 1 to open')

  console.log('\n[hold to stamp] (SoloRitualScreen HOLD path, week not yet opened)')
  const claimRunner = stateRunner()
  const claimed = await runLifecycleAction(buildRitualActionDeps({ client, ritualAddress, actor: owner.publicKey, kind: 'claim', eventIndex: 0, claimant: owner.publicKey, authorizedActor: () => owner.publicKey }), claimRunner.dispatch)
  if (!claimed.ok) throw new Error(`stamp failed in ${claimed.category} — this is the "Ritual event was not found" bug`)
  const afterClaim = await client.getEventBundle(ritualAddress, 0)
  const claim = afterClaim.claims.find((entry) => entry.member.equals(owner.publicKey))?.account
  if (!claim || claim.status !== 'Confirmed') throw new Error('stamp readback is not Confirmed')
  console.log('PASS stamp confirmed through the app path:', claimed.result.signature)

  await sleepUntil(Number(window0.resolution), 'the week to close')
  console.log('\n[settle] (SoloRitualScreen Settle path)')
  const settled = await runLifecycleAction(buildRitualActionDeps({
    client, ritualAddress, actor: owner.publicKey, kind: 'finalize', eventIndex: 0,
    destinationTokenAccounts: [creatorToken], authorizedActor: () => owner.publicKey,
  }), stateRunner().dispatch)
  if (!settled.ok) throw new Error(`settle failed in ${settled.category}`)
  const final = await client.getEventBundle(ritualAddress, 0)
  if (final.event?.account.status !== 'Settled') throw new Error('settle readback is not Settled')
  const after = (await getAccount(connection, creatorToken, 'confirmed')).amount
  console.log('PASS settle confirmed through the app path:', settled.result.signature)
  console.log(JSON.stringify({ script: 'smoke-app-solo', ritual: ritualAddress.toBase58(), season: seasonText ?? null, creatorTokenDelta: (after - before).toString(), status: 'APP SOLO PATH VERIFIED ON DEVNET' }))
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
