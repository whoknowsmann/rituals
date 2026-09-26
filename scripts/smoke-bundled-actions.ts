/**
 * Devnet proof for atomic multi-instruction Ritual transactions.
 *
 * Usage:
 *   npx tsx scripts/smoke-bundled-actions.ts HOST_TOKEN_ACCOUNT FRIEND_TOKEN_ACCOUNT
 *
 * This script uses only the explicit CLI keypairs below. It never consults the
 * Solana CLI default wallet and is devnet-only. One fresh ritual proves:
 *   A: create_ritual + host fund_member
 *   B: friend fund_member + activate_ritual
 *   C: initialize_current_event + host claim_completion
 */
import { readFileSync } from 'node:fs'
import { Connection, ComputeBudgetProgram, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import { buildCreateRitualInstruction, buildFundMemberInstruction, buildActivateRitualInstruction } from '../src/data/rituals/instructionsLifecycle'
import { buildInitializeCurrentEventInstruction, buildClaimCompletionInstruction } from '../src/data/rituals/instructionsEvents'
import type { RitualAccountContext, BuildCreateRitualArgs } from '../src/data/rituals/instructionsLifecycle'
import type { RitualEventAccountContext } from '../src/data/rituals/instructionsEvents'
import { deriveCreateRitualAccounts } from '../src/data/rituals/instructionsLifecycle'
import { eventPda } from '../src/data/rituals/pdas'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { RITUALS_DEVNET_STAKE_MINT, RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'
import { generateRitualNonce } from '../src/domain/rituals/nonce'
import { DEMO_CADENCE, generateRitualSchedule } from '../src/domain/rituals/schedule'
import { digestRulesSync, type LockedRitualRules } from '../src/domain/rituals/draft'
import type { RitualAccountView, RitualEventAccountView } from '../src/data/rituals/accounts'
import type { PublicKeyText } from '../src/domain/rituals/types'

const URL = 'https://api.devnet.solana.com'
const HOST_KEYPAIR = '.keys/rituals-devnet-deployer.json'
const FRIEND_KEYPAIR = '.keys/rituals-devnet-friend.json'
const MEMBER_TOTAL_STAKE = 2_000_000n
const COMPUTE_LIMIT = 200_000
const COMPUTE_PRICE = 1_000

type ReadClient = Pick<RitualsRpcReader, 'getProtocolConfig' | 'getRitual' | 'getEventBundle'>

function keypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[]))
}

function canonicalPublicKey(value: string | undefined, label: string): PublicKey {
  if (!value) throw new Error(`usage: provide ${label} token account`)
  const result = new PublicKey(value)
  if (result.equals(PublicKey.default) || result.toBase58() !== value) throw new Error(`${label} token account is not canonical`)
  return result
}

function syntheticRitualForFunding(
  address: PublicKey,
  creator: PublicKey,
  nonce: bigint,
  protocolConfig: PublicKey,
  stakeVault: PublicKey,
  feeVault: PublicKey,
  stakeMint: PublicKey,
  feeRecipient: PublicKey,
  members: readonly PublicKey[],
  bump: number,
  stakeVaultBump: number,
  feeVaultBump: number,
  fundedMembersBitmap: number,
  fundedMemberCount: number,
): RitualAccountContext {
  return {
    address,
    account: {
      creator,
      nonce,
      protocolConfig,
      stakeMint,
      members,
      stakeVault,
      feeVault,
      bump,
      stakeVaultBump,
      feeVaultBump,
      lockedFeeRecipient: feeRecipient,
      status: 'Funding',
      fundedMembersBitmap,
      fundedMemberCount,
    } as RitualAccountView,
  }
}

function syntheticEventForClaim(ritual: RitualAccountView, ritualAddress: PublicKey, eventIndex: number): RitualEventAccountContext {
  const window = ritual.schedule[eventIndex]
  if (!window) throw new Error('missing event schedule')
  const [address, bump] = eventPda(ritualAddress, eventIndex, RITUALS_PROGRAM_ID)
  return {
    address,
    account: {
      schemaVersion: 1,
      ritual: ritualAddress,
      eventIndex,
      window,
      memberCount: ritual.members.length,
      status: 'Scheduled',
      claimedMembersBitmap: 0,
      confirmedMembersBitmap: 0,
      questionedMembersBitmap: 0,
      initializedAt: 0n,
      resolvedAt: 0n,
      settlementVersion: 0,
      voidReason: 'None',
      eventPool: 0n,
      forfeitedTotal: 0n,
      payoutTotal: 0n,
      refundedTotal: 0n,
      confirmedMemberCount: 0,
      remainderUnits: 0n,
      remainingStakeTotalAfter: 0n,
      bump,
    } as RitualEventAccountView,
  }
}

function createArgs(
  host: Keypair,
  friend: Keypair,
  protocolConfig: PublicKey,
  feeRecipient: PublicKey,
  nonce: bigint,
  firstEventAt: number,
): BuildCreateRitualArgs {
  const members = [host.publicKey, friend.publicKey]
  const schedule = generateRitualSchedule({ firstEventAt, eventCount: 2, cadence: DEMO_CADENCE })
  const lockedFee = 500_000n
  const rules: LockedRitualRules = {
    schemaVersion: 1,
    cluster: 'devnet',
    title: 'Bundled actions proof',
    requirement: 'Prove atomic Ritual action bundles on devnet.',
    schedule,
    members: members.map((member) => member.toBase58() as PublicKeyText),
    memberTotalStake: MEMBER_TOTAL_STAKE,
    stakeMint: RITUALS_DEVNET_STAKE_MINT.toBase58() as PublicKeyText,
    tokenDecimals: 6,
    confirmationMode: 'ONE_FRIEND',
    additionalConfirmationThreshold: 1,
    activationFee: lockedFee,
    feePayerMode: 'HOST',
  }
  return {
    programId: RITUALS_PROGRAM_ID,
    creator: host.publicKey,
    stakeMint: RITUALS_DEVNET_STAKE_MINT,
    feeRecipientToken: feeRecipient,
    ritual: {
      nonce,
      ruleDigest: digestRulesSync(rules),
      members,
      memberTotalStake: MEMBER_TOTAL_STAKE,
      schedule: schedule.map((entry) => ({ opens: BigInt(entry.claimOpensAt), deadline: BigInt(entry.claimDeadlineAt), resolution: BigInt(entry.resolutionDeadlineAt) })),
      additionalConfirmationThreshold: 1,
      feePayerMode: 'HOST',
    },
  }
}

async function sendBundle(connection: Connection, label: string, payer: Keypair, instructions: readonly TransactionInstruction[]): Promise<string> {
  const latest = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({ feePayer: payer.publicKey, ...latest })
  transaction.add(...instructions, ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_LIMIT }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_PRICE }))
  const requiredSignatures = transaction.compileMessage().header.numRequiredSignatures
  if (requiredSignatures !== 1) throw new Error(`${label} requires ${requiredSignatures} wallet signatures; expected one`)
  transaction.partialSign(payer)
  const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed', maxRetries: 3 })
  const result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
  if (result.value.err) throw new Error(`${label} failed on-chain: ${JSON.stringify(result.value.err)}`)
  console.log(`${label}: ${signature} (wallet signatures: ${requiredSignatures})`)
  return signature
}

async function tokenAmount(connection: Connection, address: PublicKey): Promise<bigint> {
  const account = await getAccount(connection, address, 'confirmed')
  if (!account.mint.equals(RITUALS_DEVNET_STAKE_MINT)) throw new Error(`${address.toBase58()} has the wrong mint`)
  return account.amount
}

async function main(): Promise<void> {
  const host = keypair(HOST_KEYPAIR)
  const friend = keypair(FRIEND_KEYPAIR)
  const hostToken = canonicalPublicKey(process.argv[2], 'host')
  const friendToken = canonicalPublicKey(process.argv[3], 'friend')
  const connection = new Connection(URL, 'confirmed')
  const reader: ReadClient = new RitualsRpcReader({ getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never, RITUALS_PROGRAM_ID)
  const config = await reader.getProtocolConfig()
  if (!config.account.allowedStakeMint.equals(RITUALS_DEVNET_STAKE_MINT)) throw new Error('live config has the wrong stake mint')
  await tokenAmount(connection, hostToken)
  await tokenAmount(connection, friendToken)
  const nonce = generateRitualNonce()
  const firstEventAt = Math.floor(Date.now() / 1000) + 12
  const args = createArgs(host, friend, config.address, config.account.feeRecipient, nonce, firstEventAt)
  const accounts = deriveCreateRitualAccounts(RITUALS_PROGRAM_ID, host.publicKey, nonce)
  const initial = syntheticRitualForFunding(accounts.ritual, host.publicKey, nonce, config.address, accounts.stakeVault, accounts.feeVault, RITUALS_DEVNET_STAKE_MINT, config.account.feeRecipient, [host.publicKey, friend.publicKey], accounts.ritualBump, accounts.stakeVaultBump, accounts.feeVaultBump, 0, 0)
  const create = buildCreateRitualInstruction(args)
  const hostFund = buildFundMemberInstruction({ programId: RITUALS_PROGRAM_ID, ritual: initial, member: host.publicKey, memberSource: hostToken })

  console.log('host  :', host.publicKey.toBase58())
  console.log('friend:', friend.publicKey.toBase58())
  console.log('ritual:', accounts.ritual.toBase58())
  console.log('A is create_ritual + host fund_member in one transaction')
  await sendBundle(connection, 'A create+host-fund', host, [create, hostFund])
  let read = await reader.getRitual(accounts.ritual)
  if (read.account.status !== 'Funding' || read.account.fundedMembersBitmap !== 1 || read.account.fundedMemberCount !== 1 || read.account.fundedStakeTotal !== MEMBER_TOTAL_STAKE || read.account.fundedFeeTotal === 0n) throw new Error('A authoritative readback mismatch')
  console.log('A readback: Funding, host funded, activation fee locked')

  console.log('B is last-member fund_member + activate_ritual in one transaction')
  const friendFund = buildFundMemberInstruction({ programId: RITUALS_PROGRAM_ID, ritual: read, member: friend.publicKey, memberSource: friendToken })
  const fullyFunded = { address: read.address, account: { ...read.account, fundedMembersBitmap: 3, fundedMemberCount: 2, fundedStakeTotal: MEMBER_TOTAL_STAKE * 2n, fundedFeeTotal: read.account.lockedActivationFee } }
  const activate = buildActivateRitualInstruction({ programId: RITUALS_PROGRAM_ID, ritual: fullyFunded })
  await sendBundle(connection, 'B friend-fund+activate', friend, [friendFund, activate])
  read = await reader.getRitual(accounts.ritual)
  if (read.account.status !== 'Active' || read.account.fundedMembersBitmap !== 3 || read.account.fundedMemberCount !== 2 || read.account.fundedFeeTotal !== read.account.lockedActivationFee) throw new Error('B authoritative readback mismatch')
  console.log('B readback: Active, all members funded, activation fee transferred')

  const eventIndex = 0
  const secondsUntilOpen = Number(read.account.schedule[eventIndex].opens) - Math.floor(Date.now() / 1000)
  if (secondsUntilOpen > 0) {
    console.log(`waiting ${secondsUntilOpen + 1}s for event window`)
    await new Promise((resolve) => setTimeout(resolve, (secondsUntilOpen + 1) * 1000))
  }
  console.log('C is initialize_current_event + host claim_completion in one transaction')
  const event = syntheticEventForClaim(read.account, accounts.ritual, eventIndex)
  const initialize = buildInitializeCurrentEventInstruction({ programId: RITUALS_PROGRAM_ID, ritual: read, eventIndex, payer: host.publicKey })
  const claim = buildClaimCompletionInstruction({ programId: RITUALS_PROGRAM_ID, ritual: read, event, claimant: host.publicKey })
  await sendBundle(connection, 'C initialize-event+claim', host, [initialize, claim])
  const bundle = await reader.getEventBundle(accounts.ritual, eventIndex)
  const hostClaim = bundle.claims.find((entry) => entry.member.equals(host.publicKey))?.account
  if (!bundle.event || !['Claiming', 'Resolving'].includes(bundle.event.account.status) || !hostClaim || hostClaim.status !== 'Pending' || bundle.event.account.claimedMembersBitmap !== 1) throw new Error('C authoritative readback mismatch')
  console.log('C readback: event initialized and host claim is Pending')
  console.log('BUNDLED ACTIONS A/B/C VERIFIED ON DEVNET')
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
