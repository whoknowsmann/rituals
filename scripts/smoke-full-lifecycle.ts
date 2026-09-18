/**
 * Full-lifecycle devnet proof.
 *
 * Runs the entire hero flow against a live validator using the production
 * typed builders:
 *
 *   create -> fund(host) -> fund(friend) -> activate -> initialize event
 *          -> claim -> friend approves -> finalize/settle
 *
 * Both "members" are local keypairs so no phone is required. On the Seeker the
 * same instructions are produced; only the signer transport differs.
 *
 * Uses the accelerated demo cadence so the claim window and resolution grace
 * elapse in seconds rather than days. Devnet only, valueless TEST token.
 */

import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  buildCreateRitualInstruction,
  buildFundMemberInstruction,
  buildActivateRitualInstruction,
} from '../src/data/rituals/instructionsLifecycle'
import {
  buildInitializeCurrentEventInstruction,
  buildClaimCompletionInstruction,
  buildApproveClaimInstruction,
  buildFinalizeEventInstruction,
} from '../src/data/rituals/instructionsEvents'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { ritualPda, eventPda, claimPda, CURRENT_CLAIM_VERSION } from '../src/data/rituals/pdas'
import {
  RITUALS_PROGRAM_ID,
  RITUALS_DEVNET_STAKE_MINT,
  RITUALS_DEVNET_FEE_RECIPIENT,
} from '../src/data/rituals/programIds'
import { generateRitualNonce } from '../src/domain/rituals/nonce'
import { generateRitualSchedule, type RitualCadence } from '../src/domain/rituals/schedule'
import { digestRulesSync, type LockedRitualRules } from '../src/domain/rituals/draft'
import type { PublicKeyText } from '../src/domain/rituals/types'

const URL = 'https://api.devnet.solana.com'
const KEYPAIR_PATH = '.keys/rituals-devnet-deployer.json'
const FRIEND_PATH = '.keys/rituals-devnet-friend.json'

// Tight windows so the whole lifecycle completes in about a minute.
const FAST: RitualCadence = Object.freeze({
  periodSeconds: 120,
  claimWindowSeconds: 60,
  resolutionGraceSeconds: 30,
  accelerated: true,
  label: 'Lifecycle test',
})

const MEMBER_STAKE = 2_000_000n // 2 TEST, divides evenly across 2 events
const ACTIVATION_FEE = 500_000n

const results: Array<[string, boolean]> = []
const check = (label: string, ok: boolean) => {
  results.push([label, ok])
  console.log(ok ? '  PASS' : '  FAIL', '-', label)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function send(
  connection: Connection,
  instruction: ReturnType<typeof buildCreateRitualInstruction>,
  signers: Keypair[],
): Promise<string> {
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), signers, {
    commitment: 'confirmed',
  })
}

async function main(): Promise<void> {
  const connection = new Connection(URL, 'confirmed')
  const host = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8')) as number[]))
  const friend = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(FRIEND_PATH, 'utf8')) as number[]))

  const reader = new RitualsRpcReader(
    { getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never,
    RITUALS_PROGRAM_ID,
  )

  const members = [host.publicKey, friend.publicKey]
  const hostToken = new PublicKey(process.argv[2])
  const friendToken = new PublicKey(process.argv[3])

  console.log('host  :', host.publicKey.toBase58())
  console.log('friend:', friend.publicKey.toBase58())

  // ---------- 1. CREATE ----------
  console.log('\n[1] create_ritual')
  const nonce = generateRitualNonce()
  const firstEventAt = Math.floor(Date.now() / 1000) + 15
  const schedule = generateRitualSchedule({ firstEventAt, eventCount: 2, cadence: FAST })

  const rules: LockedRitualRules = {
    schemaVersion: 1,
    cluster: 'devnet',
    title: 'Lifecycle proof',
    requirement: 'Prove the full hero flow works on a live validator.',
    schedule,
    members: members.map((m) => m.toBase58() as PublicKeyText),
    memberTotalStake: MEMBER_STAKE,
    stakeMint: RITUALS_DEVNET_STAKE_MINT.toBase58() as PublicKeyText,
    tokenDecimals: 6,
    confirmationMode: 'ONE_FRIEND',
    additionalConfirmationThreshold: 1,
    activationFee: ACTIVATION_FEE,
    feePayerMode: 'HOST',
  }

  const [ritualAddress] = ritualPda(host.publicKey, nonce, RITUALS_PROGRAM_ID)
  await send(connection, buildCreateRitualInstruction({
    programId: RITUALS_PROGRAM_ID,
    creator: host.publicKey,
    stakeMint: RITUALS_DEVNET_STAKE_MINT,
    feeRecipientToken: RITUALS_DEVNET_FEE_RECIPIENT,
    ritual: {
      nonce,
      ruleDigest: digestRulesSync(rules),
      members,
      memberTotalStake: MEMBER_STAKE,
      schedule: schedule.map((e) => ({
        opens: BigInt(e.claimOpensAt),
        deadline: BigInt(e.claimDeadlineAt),
        resolution: BigInt(e.resolutionDeadlineAt),
      })),
      additionalConfirmationThreshold: 1,
      feePayerMode: 'HOST',
    },
  }), [host])
  console.log('  ritual:', ritualAddress.toBase58())
  let ritual = await reader.getRitual(ritualAddress)
  check('created in Funding status', ritual.account.status === 'Funding')

  const ctx = () => ({ address: ritualAddress, account: ritual.account })

  // ---------- 2. FUND ----------
  console.log('\n[2] fund_member x2')
  await send(connection, buildFundMemberInstruction({
    programId: RITUALS_PROGRAM_ID, ritual: ctx(), member: host.publicKey, memberSource: hostToken,
  }), [host])
  ritual = await reader.getRitual(ritualAddress)
  check('host funded', ritual.account.fundedMemberCount === 1)

  await send(connection, buildFundMemberInstruction({
    programId: RITUALS_PROGRAM_ID, ritual: ctx(), member: friend.publicKey, memberSource: friendToken,
  }), [friend])
  ritual = await reader.getRitual(ritualAddress)
  check('both members funded', ritual.account.fundedMemberCount === 2)
  check('stake total is 2x member stake', ritual.account.fundedStakeTotal === MEMBER_STAKE * 2n)

  // ---------- 3. ACTIVATE ----------
  console.log('\n[3] activate_ritual')
  await send(connection, buildActivateRitualInstruction({
    programId: RITUALS_PROGRAM_ID, ritual: ctx(),
  }), [host])
  ritual = await reader.getRitual(ritualAddress)
  check('ritual is Active', ritual.account.status === 'Active')
  check('activation fee transferred', ritual.account.fundedFeeTotal === ACTIVATION_FEE)

  // ---------- 4. INITIALIZE EVENT ----------
  console.log('\n[4] initialize_current_event')
  const waitOpen = schedule[0].claimOpensAt * 1000 - Date.now()
  if (waitOpen > 0) { console.log(`  waiting ${Math.ceil(waitOpen / 1000)}s for the claim window`); await sleep(waitOpen + 2000) }

  await send(connection, buildInitializeCurrentEventInstruction({
    programId: RITUALS_PROGRAM_ID, ritual: ctx(), eventIndex: 0, payer: host.publicKey,
  }), [host])
  const [eventAddress] = eventPda(ritualAddress, 0, RITUALS_PROGRAM_ID)
  let bundle = await reader.getEventBundle(ritualAddress, 0)
  check('event initialized', bundle.event !== null)

  const eventCtx = () => {
    const event = bundle.event
    if (event === null) throw new Error('event account missing')
    return { address: eventAddress, account: event.account }
  }

  // ---------- 5. CLAIM ----------
  console.log('\n[5] claim_completion (host claims)')
  await send(connection, buildClaimCompletionInstruction({
    programId: RITUALS_PROGRAM_ID, ritual: ctx(), event: eventCtx(), claimant: host.publicKey,
  }), [host])
  bundle = await reader.getEventBundle(ritualAddress, 0)
  check('claim recorded on the event', bundle.event?.account.claimedMembersBitmap !== 0)
  check('exactly one member has a claim account', bundle.claims.filter((c) => c.account !== null).length === 1)

  // ---------- 6. FRIEND APPROVES ----------
  console.log('\n[6] approve_claim (friend confirms)')
  const [claimAddress] = claimPda(eventAddress, host.publicKey, CURRENT_CLAIM_VERSION, RITUALS_PROGRAM_ID)
  await send(connection, buildApproveClaimInstruction({
    programId: RITUALS_PROGRAM_ID,
    ritual: ctx(),
    event: eventCtx(),
    claim: { address: claimAddress, account: bundle.claims[0]!.account },
    approver: friend.publicKey,
  }), [friend])
  bundle = await reader.getEventBundle(ritualAddress, 0)
  const confirmedClaim = bundle.claims.find((c) => c.account !== null)?.account
  check('claim is Confirmed', confirmedClaim?.status === 'Confirmed')
  check('approval threshold met', confirmedClaim?.approvalCount === confirmedClaim?.requiredAdditionalConfirmations)
  check('event confirmed bitmap set', (bundle.event?.account.confirmedMembersBitmap ?? 0) !== 0)

  // ---------- 7. SETTLE ----------
  console.log('\n[7] finalize_event (settlement)')
  const waitResolve = schedule[0].resolutionDeadlineAt * 1000 - Date.now()
  if (waitResolve > 0) { console.log(`  waiting ${Math.ceil(waitResolve / 1000)}s for resolution`); await sleep(waitResolve + 2000) }

  await send(connection, buildFinalizeEventInstruction({
    programId: RITUALS_PROGRAM_ID,
    ritual: ctx(),
    event: eventCtx(),
    destinationTokenAccounts: [hostToken, friendToken],
  }), [host])
  bundle = await reader.getEventBundle(ritualAddress, 0)
  const settledEvent = bundle.event
  if (settledEvent === null) throw new Error('event missing after settlement')
  const settled = settledEvent.account
  check('event is Settled', settled.status === 'Settled')
  check('event pool equals both member allocations', settled.eventPool === MEMBER_STAKE)
  // Conservation: everything paid out or refunded must equal the pool exactly,
  // with no remainder stranded and no protocol share taken.
  check('pool conserved exactly', settled.payoutTotal + settled.refundedTotal + settled.remainderUnits === settled.eventPool)
  check('unclaimed allocation was forfeited to the claimant', settled.forfeitedTotal === MEMBER_STAKE / 2n)
  check('no remainder stranded', settled.remainderUnits === 0n)

  console.log('\n  payout   :', settled.payoutTotal.toString())
  console.log('  forfeited:', settled.forfeitedTotal.toString())
  console.log('  refunded :', settled.refundedTotal.toString())

  const failed = results.filter(([, ok]) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} assertions passed`)
  if (failed > 0) throw new Error(`${failed} assertion(s) failed`)
  console.log('\nFULL LIFECYCLE VERIFIED ON DEVNET')
  console.log('ritual:', ritualAddress.toBase58())
}

main().catch((error: unknown) => {
  console.error('\nFAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
