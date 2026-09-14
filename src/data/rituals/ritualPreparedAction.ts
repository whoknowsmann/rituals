import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { ACCOUNT_DATA_LENGTHS } from './accounts'
import { Message, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'
import { buildCreateRitualInstruction } from './instructionsLifecycle'
import { RITUALS_CURRENT_CONFIG } from './programIds'

const MAX_SAFE = Number.MAX_SAFE_INTEGER

type PreparationCategory = 'deployment' | 'input' | 'rpc' | 'fee' | 'rent' | 'mutation'
export class RitualPreparationError extends Error {
  readonly category: PreparationCategory
  constructor(category: PreparationCategory, message: string) {
    super(message)
    this.name = 'RitualPreparationError'
    this.category = category
  }
}

export type RitualPreparationTransport = {
  getLatestBlockhashAndContext: (config: Readonly<{ commitment: 'confirmed' }>) => Promise<unknown>
  getFeeForMessage: (message: Message, config: Readonly<{ commitment: 'confirmed'; minContextSlot: number }>) => Promise<unknown>
  getMinimumBalanceForRentExemption: (dataLength: number, commitment: 'confirmed') => Promise<unknown>
}
export type RitualPreparationSummary = Readonly<{
  clusterLabel: 'local/test-unconfigured'
  tokenMint: PublicKey
  tokenOutflow: 0n
  stakeOutflow: 0n
  activationFeeOutflow: 0n
  estimatedNetworkFeeLamports: bigint
  estimatedRentLamports: bigint
  totalEstimatedLamportOutflow: bigint
  creates: Readonly<{ description: 'ritual, stake vault, and fee vault'; count: 3 }>
  networkFeeIsEstimate: true
}>
export type PreparedRitualAction = Readonly<{
  kind: 'create'
  programId: PublicKey
  ritualAddress: PublicKey
  feePayer: PublicKey
  blockhashContextSlot: number
  lastValidBlockHeight: number
  messageDigest: string
  summary: RitualPreparationSummary
  expectation: Readonly<{ kind: 'created'; creator: PublicKey; nonce: bigint }>
}>
export type WalletRitualTransaction = Readonly<{
  transaction: Transaction
  blockhash: string
  expectedMessageDigest: string
  submittedContextSlot: number
  lastValidBlockHeight: number
  expectation: Readonly<{ kind: 'created'; creator: PublicKey; nonce: bigint }>
  ritualAddress: PublicKey
}>

type Internal = {
  programId: PublicKey
  feePayer: PublicKey
  ritualAddress: PublicKey
  blockhash: string
  lastValidBlockHeight: number
  blockhashContextSlot: number
  instruction: TransactionInstruction
  messageBytes: Uint8Array
  messageDigest: string
  expectation: Readonly<{ kind: 'created'; creator: PublicKey; nonce: bigint }>
}
const fail = (category: PreparationCategory, message: string): never => { throw new RitualPreparationError(category, message) }
const copyKey = (key: PublicKey): PublicKey => new PublicKey(Uint8Array.from(key.toBytes()))
const copyInstruction = (instruction: TransactionInstruction): TransactionInstruction => new TransactionInstruction({
  programId: copyKey(instruction.programId),
  keys: instruction.keys.map(meta => ({ pubkey: copyKey(meta.pubkey), isSigner: meta.isSigner, isWritable: meta.isWritable })),
  data: Buffer.from(instruction.data),
})
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i])
const nonceFromInstruction = (instruction: TransactionInstruction): bigint => {
  let nonce = 0n
  for (let i = 0; i < 8; i += 1) nonce |= BigInt(instruction.data[8 + i]) << BigInt(i * 8)
  return nonce
}
const hex = (bytes: Uint8Array): string => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
function safeSlot(value: unknown, name: string, category: 'rpc' | 'fee' = 'rpc'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(category, `invalid ${name}`)
  return value as number
}
function object(value: unknown, name: string, category: 'rpc' | 'fee' = 'rpc'): Record<string, unknown> {
  if (value === null || typeof value !== 'object') fail(category, `invalid ${name}`)
  return value as Record<string, unknown>
}
function blockhash(value: unknown): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) fail('rpc', 'invalid blockhash')
  try {
    const key = new PublicKey(value as string)
    if (key.equals(PublicKey.default) || key.toBase58() !== value) fail('rpc', 'invalid blockhash')
  } catch { fail('rpc', 'invalid blockhash') }
  return value as string
}
function amount(value: unknown, category: 'fee' | 'rent'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE) fail(category, 'invalid lamport amount')
  return value as number
}
function transportMethod(transport: unknown, name: keyof RitualPreparationTransport): (...args: any[]) => Promise<unknown> {
  if (transport === null || (typeof transport !== 'object' && typeof transport !== 'function')) fail('input', 'transport is invalid')
  try {
    const method = (transport as Record<string, unknown>)[name]
    if (typeof method !== 'function') fail('input', 'transport is invalid')
    return (method as (...args: any[]) => Promise<unknown>).bind(transport)
  } catch { fail('input', 'transport is invalid') }
  return fail('input', 'transport is invalid')
}

export class RitualActionPreparer {
  #snapshots = new WeakMap<object, Internal>()
  private readonly programId!: PublicKey
  private readonly latest!: (...args: any[]) => Promise<unknown>
  private readonly fee!: (...args: any[]) => Promise<unknown>
  private readonly rent!: (...args: any[]) => Promise<unknown>

  constructor(transport: RitualPreparationTransport, programId: PublicKey) {
    try {
      if (!(programId instanceof PublicKey) || programId.equals(PublicKey.default)) fail('input', 'programId is invalid')
      this.programId = copyKey(programId)
      this.latest = transportMethod(transport, 'getLatestBlockhashAndContext')
      this.fee = transportMethod(transport, 'getFeeForMessage')
      this.rent = transportMethod(transport, 'getMinimumBalanceForRentExemption')
    } catch (error) {
      if (error instanceof RitualPreparationError) throw error
      fail('input', 'invalid preparation dependencies')
    }
  }

  private internalFor(prepared: PreparedRitualAction): Internal {
    if (prepared === null || (typeof prepared !== 'object' && typeof prepared !== 'function')) fail('input', 'prepared action provenance is invalid')
    const internal = this.#snapshots.get(prepared as object)
    if (!internal) fail('input', 'prepared action provenance is invalid')
    return internal as Internal
  }

  async prepareCreate(args: BuildCreateRitualArgs): Promise<PreparedRitualAction> {
    let instruction!: TransactionInstruction
    try { instruction = buildCreateRitualInstruction(args) } catch { fail('input', 'invalid Create Ritual inputs') }
    if (!instruction.programId.equals(this.programId)) fail('input', 'programId does not match preparer')
    const instructionCopy = copyInstruction(instruction)
    const feePayer = copyKey(instructionCopy.keys[2].pubkey)
    const ritualAddress = copyKey(instructionCopy.keys[1].pubkey)
    const tokenMint = copyKey(instructionCopy.keys[3].pubkey)
    const nonce = nonceFromInstruction(instructionCopy)
    const latest = await this.latest({ commitment: 'confirmed' }).catch(() => fail('rpc', 'latest blockhash request failed'))
    const latestObject = object(latest, 'latest blockhash response')
    const context = object(latestObject.context, 'blockhash context')
    const value = object(latestObject.value, 'blockhash value')
    const slot = safeSlot(context.slot, 'blockhash context slot')
    const recentBlockhash = blockhash(value.blockhash)
    const lastValidBlockHeight = safeSlot(value.lastValidBlockHeight, 'last valid block height')
    const transaction = new Transaction({ feePayer: copyKey(feePayer), blockhash: recentBlockhash, lastValidBlockHeight })
    transaction.add(copyInstruction(instructionCopy))
    const message = transaction.compileMessage()
    const feeResponse = await this.fee(message, { commitment: 'confirmed', minContextSlot: slot }).catch(() => fail('fee', 'fee request failed'))
    const feeObject = object(feeResponse, 'fee response', 'fee')
    const feeContext = object(feeObject.context, 'fee context', 'fee')
    const feeSlot = safeSlot(feeContext.slot, 'fee context slot', 'fee')
    if (feeSlot < slot) fail('fee', 'fee context is stale')
    const feeValue = feeObject.value
    if (feeValue === null) fail('fee', 'fee is unavailable')
    const networkFee = amount(feeValue, 'fee')
    const rents: bigint[] = []
    for (const length of [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE]) {
      const result = await this.rent(length, 'confirmed').catch(() => fail('rent', 'rent request failed'))
      rents.push(BigInt(amount(result, 'rent')))
    }
    const rentTotal = rents.reduce((sum, item) => sum + item, 0n)
    const total = BigInt(networkFee) + rentTotal
    const messageBytes = Uint8Array.from(transaction.serializeMessage())
    const messageDigest = hex(sha256(messageBytes))
    const expectation = Object.freeze({ kind: 'created' as const, creator: copyKey(feePayer), nonce })
    const internal: Internal = { programId: copyKey(this.programId), feePayer, ritualAddress, blockhash: recentBlockhash, lastValidBlockHeight, blockhashContextSlot: slot, instruction: instructionCopy, messageBytes, messageDigest, expectation }
    const summary = Object.freeze({ clusterLabel: 'local/test-unconfigured' as const, tokenMint, tokenOutflow: 0n, stakeOutflow: 0n, activationFeeOutflow: 0n, estimatedNetworkFeeLamports: BigInt(networkFee), estimatedRentLamports: rentTotal, totalEstimatedLamportOutflow: total, creates: Object.freeze({ description: 'ritual, stake vault, and fee vault' as const, count: 3 as const }), networkFeeIsEstimate: true as const })
    const action = Object.freeze({ kind: 'create' as const, programId: copyKey(this.programId), ritualAddress: copyKey(ritualAddress), feePayer: copyKey(feePayer), blockhashContextSlot: slot, lastValidBlockHeight, messageDigest, summary, expectation })
    this.#snapshots.set(action, internal)
    return action
  }

  getTransactionForWallet(prepared: PreparedRitualAction): WalletRitualTransaction {
    const snapshot = this.internalFor(prepared)
    const transaction = new Transaction({ feePayer: copyKey(snapshot.feePayer), blockhash: snapshot.blockhash, lastValidBlockHeight: snapshot.lastValidBlockHeight })
    transaction.add(copyInstruction(snapshot.instruction))
    if (!equalBytes(Uint8Array.from(transaction.serializeMessage()), snapshot.messageBytes)) fail('mutation', 'prepared message reconstruction changed')
    return Object.freeze({ transaction, blockhash: snapshot.blockhash, expectedMessageDigest: snapshot.messageDigest, submittedContextSlot: snapshot.blockhashContextSlot, lastValidBlockHeight: snapshot.lastValidBlockHeight, expectation: snapshot.expectation, ritualAddress: copyKey(snapshot.ritualAddress) })
  }

  assertWalletTransactionUnchanged(prepared: PreparedRitualAction, transaction: Transaction): void {
    const internal = this.internalFor(prepared)
    if (!(transaction instanceof Transaction)) fail('input', 'transaction provenance is invalid')
    if (transaction.recentBlockhash !== internal.blockhash || transaction.lastValidBlockHeight !== internal.lastValidBlockHeight) fail('mutation', 'wallet transaction strategy was mutated')
    let bytes = new Uint8Array()
    try { bytes = Uint8Array.from(transaction.serializeMessage()) } catch { fail('mutation', 'wallet transaction message was mutated') }
    if (!equalBytes(bytes, internal.messageBytes) || hex(sha256(bytes)) !== internal.messageDigest) fail('mutation', 'wallet transaction message was mutated')
  }
}

/** Explicit-program local/test preparer; this does not authorize deployment or signing. */
export const createRitualActionPreparer = (transport: RitualPreparationTransport, programId: PublicKey): RitualActionPreparer => new RitualActionPreparer(transport, programId)

/** Current production deployment is deliberately unavailable; fails before inspecting dependencies. */
export function createCurrentRitualActionPreparer(_transport: RitualPreparationTransport): never {
  void _transport
  const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG
  if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured')
  return fail('deployment', 'Current Ritual action preparer is unavailable')
}
