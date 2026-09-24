/**
 * Devnet proof for reload recovery.
 *
 * A real Create is prepared with the production instruction builder and sent
 * with a CLI keypair. The opaque submission handle is intentionally discarded;
 * the resolver receives only a JSON round-tripped pending record plus live RPC
 * transport and must classify the action from signature status and the
 * authoritative RitualsRpcReader readback.
 *
 * Devnet only; the deployer keypair is explicit and never the Solana CLI default.
 */
import { readFileSync } from 'node:fs'
import { sha256 } from '@noble/hashes/sha256'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { buildCreateRitualInstruction } from '../src/data/rituals/instructionsLifecycle'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { RITUALS_DEVNET_FEE_RECIPIENT, RITUALS_DEVNET_STAKE_MINT, RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'
import { makePendingActionRecord, parsePendingAction, resolvePendingAction, withPendingActionSignature, type PendingActionRecord } from '../src/features/rituals/recovery/pendingAction'
import { generateRitualNonce } from '../src/domain/rituals/nonce'
import { DEMO_CADENCE, generateRitualSchedule } from '../src/domain/rituals/schedule'
import { digestRulesSync, type LockedRitualRules } from '../src/domain/rituals/draft'
import { ritualPda } from '../src/data/rituals/pdas'
import type { PublicKeyText } from '../src/domain/rituals/types'

const URL = 'https://api.devnet.solana.com'
const KEYPAIR_PATH = '.keys/rituals-devnet-deployer.json'
const FRIEND_PATH = '.keys/rituals-devnet-friend.json'
const hex = (bytes: Uint8Array): string => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')

function keypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[]))
}

function persistedRoundTrip(record: PendingActionRecord): PendingActionRecord {
  const parsed = parsePendingAction(JSON.parse(JSON.stringify(record)) as unknown)
  if (!parsed) throw new Error('pending record round trip failed')
  return parsed
}

async function main(): Promise<void> {
  const connection = new Connection(URL, 'confirmed')
  const host = keypair(KEYPAIR_PATH)
  const friend = keypair(FRIEND_PATH)
  const reader = new RitualsRpcReader({ getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never, RITUALS_PROGRAM_ID)
  const members = [host.publicKey, friend.publicKey]
  const schedule = generateRitualSchedule({ firstEventAt: Math.floor(Date.now() / 1000) + 60, eventCount: 2, cadence: DEMO_CADENCE })
  const nonce = generateRitualNonce()
  const rules: LockedRitualRules = {
    schemaVersion: 1,
    cluster: 'devnet',
    title: 'Reload recovery proof',
    requirement: 'Prove a pending transaction survives an app reload.',
    schedule,
    members: members.map((member) => member.toBase58() as PublicKeyText),
    memberTotalStake: 2_000_000n,
    stakeMint: RITUALS_DEVNET_STAKE_MINT.toBase58() as PublicKeyText,
    tokenDecimals: 6,
    confirmationMode: 'ONE_FRIEND',
    additionalConfirmationThreshold: 1,
    activationFee: 500_000n,
    feePayerMode: 'HOST',
  }
  const ruleDigest = digestRulesSync(rules)
  const [ritualAddress] = ritualPda(host.publicKey, nonce, RITUALS_PROGRAM_ID)
  const instruction = buildCreateRitualInstruction({
    programId: RITUALS_PROGRAM_ID,
    creator: host.publicKey,
    stakeMint: RITUALS_DEVNET_STAKE_MINT,
    feeRecipientToken: RITUALS_DEVNET_FEE_RECIPIENT,
    ritual: {
      nonce,
      ruleDigest,
      members,
      memberTotalStake: 2_000_000n,
      schedule: schedule.map((entry) => ({ opens: BigInt(entry.claimOpensAt), deadline: BigInt(entry.claimDeadlineAt), resolution: BigInt(entry.resolutionDeadlineAt) })),
      additionalConfirmationThreshold: 1,
      feePayerMode: 'HOST',
    },
  })
  const latest = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({ feePayer: host.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }).add(instruction)
  const beforeWallet = persistedRoundTrip(makePendingActionRecord({
    kind: 'create',
    ritualAddress: ritualAddress.toBase58(),
    messageDigest: hex(sha256(transaction.serializeMessage())),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  } as never, Date.now()))

  // Wallet handoff: sign and send, then keep only the plain persisted record.
  transaction.partialSign(host)
  const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed' })
  const persisted = persistedRoundTrip(withPendingActionSignature(beforeWallet, signature))
  await connection.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, 'confirmed')

  const resolution = await resolvePendingAction(persisted, {
    getSignatureStatus: async (value) => {
      const status = (await connection.getSignatureStatuses([value])).value[0]
      return status === null ? null : { slot: status.slot, err: status.err, confirmationStatus: status.confirmationStatus ?? null }
    },
    getBlockHeight: () => connection.getBlockHeight('confirmed'),
    readRitual: async (address) => {
      const read = await reader.getRitual(address)
      return { slot: read.slot, actionObserved: read.account.status === 'Funding' && read.address.equals(ritualAddress) }
    },
  })
  if (resolution.status !== 'confirmed') throw new Error(`reload resolver classified submitted Create as ${resolution.status}`)
  console.log('PASS - forgot handle and recovered confirmed Create from persisted record')
  console.log('ritual:', ritualAddress.toBase58())
  console.log('signature:', signature)

  const currentHeight = await connection.getBlockHeight('confirmed')
  const expired = persistedRoundTrip({ ...beforeWallet, lastValidBlockHeight: Math.max(0, currentHeight - 1) })
  const expiredResolution = await resolvePendingAction(expired, {
    getSignatureStatus: async () => null,
    getBlockHeight: async () => currentHeight,
    readRitual: async () => ({ slot: currentHeight, actionObserved: false }),
  })
  if (expiredResolution.status !== 'expired') throw new Error(`never-sent record classified as ${expiredResolution.status}`)
  console.log('PASS - never-sent record classified as expired')
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
