/**
 * App-level devnet proof for ENDING A RITUAL EARLY (eject_ritual).
 *
 * Drives the exact modules the screens call: buildSoloCreateDeps +
 * runCreateRitual (Lock it in), buildRitualActionDeps('claim') (HOLD TO
 * STAMP), and getEjectQuote + buildEjectDeps + runLifecycleAction (Settings
 * → End early → End and get it back). The only substitute is the wallet: a
 * local devnet keypair signs the prepared bytes.
 *
 * Journey: a 3-week demo ritual (DEMO_SOLO_CADENCE: 60 s lead, 45 s stamp
 * window, 10 s grace, 5 s gap), stamp week 1, end it during week 2. Week 1 is
 * kept (settled by the eject itself unless --settle-week-1 lets the app's
 * settle key close it first, as the ritual screen does), weeks 2 and 3 come
 * back, nothing goes to the destination, both vaults close.
 *
 * Usage (devnet only; never the Solana CLI default wallet; needs the upgraded
 * program that has eject_ritual):
 *   npx tsx scripts/smoke-app-eject.ts --keypair .keys/rituals-solo-smoke-owner.json \
 *     --creator-token-account <tSKR ATA> [--cause-index N | --person <wallet>] [--settle-week-1]
 */
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { makeRitualTransport } from '../src/features/rituals/client/ritualTransport'
import { createCurrentRitualClient, type RitualClientTransport } from '../src/data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../src/data/rituals/ritualSubmission'
import { buildSoloCreateDeps } from '../src/features/rituals/solo/create/buildSoloCreateDeps'
import { selectSoloSchedule } from '../src/features/rituals/solo/create/schedule'
import { runCreateRitual } from '../src/features/rituals/create/runCreateRitual'
import { buildRitualActionDeps } from '../src/features/rituals/buildRitualActionDeps'
import { runLifecycleAction } from '../src/features/rituals/runLifecycleAction'
import { lifecycleInitialState, lifecycleReducer, type LifecycleEvent, type LifecycleState } from '../src/features/rituals/lifecycleMachine'
import { buildEjectDeps } from '../src/features/rituals/eject/ejectDeps'
import { DEMO_CAUSES } from '../src/data/rituals/demoConfig'
import { eventPda } from '../src/data/rituals/pdas'
import { DEMO_SOLO_CADENCE } from '../src/domain/rituals/schedule'
import { autoSettleWeek } from '../src/features/rituals/solo/settler/autoSettle'
import { createSettlerClient } from '../src/features/rituals/solo/settler/settlerClient'
import { settlerBudgetLamports } from '../src/features/rituals/solo/settler/settlerBudget'
import { connectionFor, option, parseCli, readKeypair, requiredOption } from './lib/cli'
import { refuseMainnetFundedPayer } from './lib/chain'

const EVENT_COUNT = 3
const STAKE_PER_WEEK = 1_000_000n

function stateRunner() {
  let state: LifecycleState = lifecycleInitialState()
  const dispatch = (event: LifecycleEvent) => { state = lifecycleReducer(state, event) }
  return { dispatch, get state() { return state } }
}

async function sleepUntil(unixSeconds: number, label: string): Promise<void> {
  const wait = unixSeconds * 1000 - Date.now()
  if (wait > 0) { console.log(`waiting ${Math.ceil(wait / 1000)}s for ${label}`); await new Promise((resolve) => setTimeout(resolve, wait + 2000)) }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url } = connectionFor(args)
  if (!url.includes('devnet')) throw new Error('devnet only')
  const owner = readKeypair(requiredOption(args, 'keypair') as string)
  await refuseMainnetFundedPayer(url, owner)
  const creatorToken = new PublicKey(requiredOption(args, 'creator-token-account') as string)
  const settleFirst = args['settle-week-1'] !== undefined
  const connection = new Connection(url, 'confirmed')
  const transport: RitualClientTransport & RitualWalletSubmissionTransport = makeRitualTransport(connection, async (transaction: Transaction, minContextSlot: number) => {
    if (!transaction.feePayer?.equals(owner.publicKey)) throw new Error('prepared fee payer is not the local signer')
    transaction.partialSign(owner)
    return connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed', minContextSlot })
  })
  const client = createCurrentRitualClient(transport, transport)
  const config = await client.getProtocolConfig()
  check(creatorToken.equals(getAssociatedTokenAddressSync(config.account.allowedStakeMint, owner.publicKey)), '--creator-token-account must be the owner’s tSKR ATA (the account the app refunds)')

  const personText = option(args, 'person')
  const causeIndex = Number(option(args, 'cause-index', '0'))
  const cause = DEMO_CAUSES[causeIndex]
  if (!personText && (!cause || cause.tokenAccount === null)) throw new Error(`demo cause ${causeIndex} is not configured`)
  const destinationAccount = personText ? getAssociatedTokenAddressSync(config.account.allowedStakeMint, new PublicKey(personText)) : cause!.tokenAccount!
  console.log(`missed weeks would go to ${personText ? `wallet ${personText}` : cause!.label}: ${destinationAccount.toBase58()}`)

  const tokenBalance = async (address: PublicKey) => (await getAccount(connection, address, 'confirmed')).amount
  const creatorStart = await tokenBalance(creatorToken)
  const destinationStart = await tokenBalance(destinationAccount)
  const settler = Keypair.generate()
  const settlerClient = createSettlerClient(connection, settler)
  const schedule = selectSoloSchedule({ cadence: DEMO_SOLO_CADENCE, referenceSeconds: Math.floor(Date.now() / 1000), eventCount: EVENT_COUNT })

  console.log('\n[create + fund + activate] (SoloCreateScreen path, 3 demo weeks)')
  let ritualText: string | null = null
  const created = await runCreateRitual(buildSoloCreateDeps({
    client, creator: owner.publicKey, title: 'App eject proof', requirement: 'Check in inside the window.', eventCount: EVENT_COUNT,
    stakePerWeekAtomic: STAKE_PER_WEEK, schedule, witnessMode: 'just-me', destination: personText ? 'person' : 'cause',
    causeTokenAccount: personText ? null : cause!.tokenAccount, personAddress: personText, seasonAddress: null,
    settlerFunding: { to: settler.publicKey, lamports: settlerBudgetLamports(EVENT_COUNT) }, authorizedActor: () => owner.publicKey,
  }), (event) => { if (event.type === 'PREPARED') ritualText = event.prepared.ritualAddress })
  if (!created.ok || !ritualText) throw new Error(`create did not confirm (${created.ok ? 'no address' : created.category})`)
  const ritualAddress = new PublicKey(ritualText)
  const active = await client.readRitual(ritualAddress)
  check(active.account.status === 'Active' && active.account.kind === 'Solo' && active.account.schedule.length === EVENT_COUNT, 'create readback is not an Active 3-week solo ritual')
  console.log('PASS create:', created.result.signature, ritualAddress.toBase58())
  const [week1, week2] = active.account.schedule

  await sleepUntil(Number(week1.opens), 'week 1 to open')
  console.log('\n[hold to stamp week 1] (SoloRitualScreen HOLD path)')
  const claimed = await runLifecycleAction(buildRitualActionDeps({ client, ritualAddress, actor: owner.publicKey, kind: 'claim', eventIndex: 0, claimant: owner.publicKey, authorizedActor: () => owner.publicKey }), stateRunner().dispatch)
  if (!claimed.ok) throw new Error(`stamp failed in ${claimed.category}`)
  console.log('PASS stamp week 1:', claimed.result.signature)

  if (settleFirst) {
    await sleepUntil(Number(week1.resolution), 'week 1 to close')
    console.log('\n[settle key closes kept week 1] (SoloRitualScreen auto-settle)')
    const settled = await autoSettleWeek({ client: settlerClient, ritualAddress, settler: settler.publicKey, eventIndex: 0, needsEventInit: false, destinationTokenAccounts: [creatorToken] })
    if (!settled.ok) throw new Error(`settle failed at ${settled.step} (${settled.category})`)
    console.log('PASS week 1 settled by the settle key:', settled.signatures.join(' '))
  }

  await sleepUntil(Number(week2.opens), 'week 2 to open')
  console.log('\n[Settings → End early] quote, then End and get it back')
  const quote = await client.getEjectQuote(ritualAddress)
  console.log(`quote at chain time ${quote.now}: back to you ${quote.backToYou}, to the destination ${quote.destinationTotal} (this eject ${quote.pendingForfeit}), receipts to create ${quote.missingReceiptCount}`)
  check(quote.now >= week2.opens && quote.now <= week2.deadline, 'week 2 is not open at the quote')
  check(quote.pendingForfeit === 0n && quote.destinationTotal === 0n, 'nothing should go to the destination: week 1 was stamped and week 2 is still open')
  check(quote.backToYou === STAKE_PER_WEEK * BigInt(settleFirst ? EVENT_COUNT - 1 : EVENT_COUNT), 'back to you should be every week still in the vault')
  const creatorBefore = await tokenBalance(creatorToken)
  const lamportsBefore = await connection.getBalance(owner.publicKey, 'confirmed')
  const ejectRunner = stateRunner()
  const ejected = await runLifecycleAction(buildEjectDeps({ client, ritualAddress, actor: owner.publicKey, shown: quote, authorizedActor: () => owner.publicKey, getBlockHeight: () => connection.getBlockHeight('confirmed') }), ejectRunner.dispatch)
  if (!ejected.ok) throw new Error(`eject failed in ${ejected.category} (${ejectRunner.state.status === 'error' ? ejectRunner.state.message : ''})`)
  console.log('PASS eject confirmed through the app path (readback: Ended, vaults gone, creator paid):', ejected.result.signature)

  const ended = await client.readRitual(ritualAddress)
  check(ended.account.status === 'Ended' && ended.account.vaultsClosed && ended.account.fundedStakeTotal === 0n, 'ritual did not read back Ended with closed vaults')
  check(ended.account.currentEventIndex === 1 && ended.account.settledEventCount === 1, `expected exactly week 1 settled, got ${ended.account.settledEventCount}`)
  for (const vault of [ended.account.stakeVault, ended.account.feeVault]) check(await connection.getAccountInfo(vault, 'confirmed') === null, `vault ${vault.toBase58()} still exists`)
  const receipt = await client.getEventBundle(ritualAddress, 0)
  check(receipt.event?.account.status === 'Settled' && receipt.event.account.payoutTotal === STAKE_PER_WEEK && receipt.event.account.forfeitedTotal === 0n, 'week 1 receipt is not KEPT')
  for (const index of [1, 2]) check(await connection.getAccountInfo(eventPda(ritualAddress, index, client.programId)[0], 'confirmed') === null, `week ${index + 1} should have no receipt`)
  const creatorAfter = await tokenBalance(creatorToken)
  const destinationAfter = await tokenBalance(destinationAccount)
  check(creatorAfter - creatorBefore === quote.backToYou, `creator received ${creatorAfter - creatorBefore}, expected ${quote.backToYou}`)
  check(destinationAfter === destinationStart, `destination changed by ${destinationAfter - destinationStart}`)
  check(creatorAfter === creatorStart, `over the whole ritual the creator's tSKR moved by ${creatorAfter - creatorStart}; expected 0 (every week kept or returned)`)
  const lamportsAfter = await connection.getBalance(owner.publicKey, 'confirmed')
  console.log('PASS balances: every stake back, destination untouched, vault rent returned')
  console.log(JSON.stringify({
    script: 'smoke-app-eject', ritual: ritualAddress.toBase58(), settledWeek1First: settleFirst, ejectSignature: ejected.result.signature,
    backToYou: quote.backToYou.toString(), destinationDelta: (destinationAfter - destinationStart).toString(), creatorTokenDeltaOverRitual: (creatorAfter - creatorStart).toString(),
    ownerLamportsDeltaAtEject: lamportsAfter - lamportsBefore, status: 'APP EJECT PATH VERIFIED ON DEVNET',
  }))
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  process.exit(1)
})
