/**
 * End-to-end devnet smoke test: create a real Ritual.
 *
 * Exercises the full Create path against a live validator — schedule
 * generation, nonce allocation, rule canonicalization and digest, PDA
 * derivation, instruction encoding, token vault creation — then reads the
 * result back through the typed reader and asserts it matches what was sent.
 *
 * Devnet only, valueless TEST token. Safe to run repeatedly: each run uses a
 * fresh random nonce and therefore a fresh Ritual PDA.
 */

import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { buildCreateRitualInstruction } from '../src/data/rituals/instructionsLifecycle'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { ritualPda, stakeVaultPda, feeVaultPda } from '../src/data/rituals/pdas'
import {
  RITUALS_PROGRAM_ID,
  RITUALS_DEVNET_STAKE_MINT,
  RITUALS_DEVNET_FEE_RECIPIENT,
} from '../src/data/rituals/programIds'
import { generateRitualNonce } from '../src/domain/rituals/nonce'
import { DEMO_CADENCE, generateRitualSchedule } from '../src/domain/rituals/schedule'
import { digestRulesSync } from '../src/domain/rituals/draft'
import type { LockedRitualRules } from '../src/domain/rituals/draft'
import type { PublicKeyText } from '../src/domain/rituals/types'

const URL = 'https://api.devnet.solana.com'
const KEYPAIR_PATH = '.keys/rituals-devnet-deployer.json'

async function main(): Promise<void> {
  const secret = Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8')) as number[])
  const creator = Keypair.fromSecretKey(secret)
  const connection = new Connection(URL, 'confirmed')

  // Two members: the creator plus a deterministic stand-in for a friend. The
  // friend never signs here; Create only requires the creator.
  const friend = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1))
  const members = [creator.publicKey, friend.publicKey]

  const nonce = generateRitualNonce()
  const firstEventAt = Math.floor(Date.now() / 1000) + 60
  const schedule = generateRitualSchedule({
    firstEventAt,
    eventCount: 2,
    cadence: DEMO_CADENCE,
  })

  const memberTotalStake = 2_000_000n // 2 TEST at 6 decimals, divides by 2 events

  const rules: LockedRitualRules = {
    schemaVersion: 1,
    cluster: 'devnet',
    title: 'Devnet smoke ritual',
    requirement: 'Prove the create path works end to end on a live validator.',
    schedule,
    members: members.map((m) => m.toBase58() as PublicKeyText),
    memberTotalStake,
    stakeMint: RITUALS_DEVNET_STAKE_MINT.toBase58() as PublicKeyText,
    tokenDecimals: 6,
    confirmationMode: 'ONE_FRIEND',
    additionalConfirmationThreshold: 1,
    activationFee: 500_000n,
    feePayerMode: 'HOST',
  }
  const ruleDigest = digestRulesSync(rules)

  const [ritualAddress] = ritualPda(creator.publicKey, nonce, RITUALS_PROGRAM_ID)
  const [stakeVault] = stakeVaultPda(ritualAddress, RITUALS_PROGRAM_ID)
  const [feeVault] = feeVaultPda(ritualAddress, RITUALS_PROGRAM_ID)

  console.log('creator :', creator.publicKey.toBase58())
  console.log('nonce   :', nonce.toString())
  console.log('ritual  :', ritualAddress.toBase58())
  console.log('digest  :', ruleDigest)
  console.log('schedule:', schedule.map((e) => `[${e.claimOpensAt}..${e.resolutionDeadlineAt}]`).join(' '))

  const instruction = buildCreateRitualInstruction({
    programId: RITUALS_PROGRAM_ID,
    creator: creator.publicKey,
    stakeMint: RITUALS_DEVNET_STAKE_MINT,
    feeRecipientToken: RITUALS_DEVNET_FEE_RECIPIENT,
    ritual: {
      nonce,
      ruleDigest,
      members,
      memberTotalStake,
      schedule: schedule.map((entry) => ({
        opens: BigInt(entry.claimOpensAt),
        deadline: BigInt(entry.claimDeadlineAt),
        resolution: BigInt(entry.resolutionDeadlineAt),
      })),
      additionalConfirmationThreshold: 1,
      feePayerMode: 'HOST',
    },
  })

  console.log('\nsubmitting create_ritual...')
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [creator],
    { commitment: 'confirmed' },
  )
  console.log('signature:', signature)

  // Authoritative readback through the real typed reader.
  const reader = new RitualsRpcReader(
    { getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never,
    RITUALS_PROGRAM_ID,
  )
  const read = await reader.getRitual(ritualAddress)
  const account = read.account

  console.log('\n--- read back through the typed reader ---')
  console.log('status        :', account.status)
  console.log('creator       :', account.creator.toBase58())
  console.log('nonce         :', account.nonce.toString())
  console.log('members       :', account.members.length)
  console.log('stake/member  :', account.memberTotalStake.toString())
  console.log('per event     :', account.perEventAllocation.toString())
  console.log('events        :', account.schedule.length)
  console.log('stakeVault    :', account.stakeVault.toBase58())
  console.log('feeVault      :', account.feeVault.toBase58())
  console.log('activationFee :', account.lockedActivationFee.toString())

  const checks: Array<[string, boolean]> = [
    ['status is Funding', account.status === 'Funding'],
    ['creator matches', account.creator.equals(creator.publicKey)],
    ['nonce matches', account.nonce === nonce],
    ['member count is 2', account.members.length === 2],
    ['stake matches', account.memberTotalStake === memberTotalStake],
    ['per-event allocation is half', account.perEventAllocation === memberTotalStake / 2n],
    ['schedule length is 2', account.schedule.length === 2],
    ['stake vault PDA matches', account.stakeVault.equals(stakeVault)],
    ['fee vault PDA matches', account.feeVault.equals(feeVault)],
    ['rule digest matches', account.ruleDigest === ruleDigest],
    ['first event window preserved', account.schedule[0].opens === BigInt(schedule[0].claimOpensAt)],
  ]

  console.log('\n--- assertions ---')
  let failed = 0
  for (const [label, ok] of checks) {
    console.log(ok ? 'PASS' : 'FAIL', '-', label)
    if (!ok) failed += 1
  }
  if (failed > 0) throw new Error(`${failed} assertion(s) failed`)

  console.log('\nRITUAL CREATED AND VERIFIED ON DEVNET')
  console.log('address:', ritualAddress.toBase58())
  console.log('tx     :', signature)
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
