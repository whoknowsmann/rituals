import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { ACCOUNT_DATA_LENGTHS, type RitualAccountView } from './accounts'
import { ComputeBudgetProgram, Message, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import type { BuildCreateRitualArgs, BuildCreateSoloRitualArgs, BuildDeclareSkipArgs, BuildFundMemberArgs, BuildActivateRitualArgs, BuildCancelUnactivatedArgs, RitualAccountContext } from './instructionsLifecycle'
import { buildCreateRitualInstruction, buildCreateSoloRitualInstruction, buildDeclareSkipInstruction, buildFundMemberInstruction, buildActivateRitualInstruction, buildCancelUnactivatedInstruction, deriveCreateRitualAccounts } from './instructionsLifecycle'
import type { BuildCloseTerminalVaultsArgs, BuildInitializeCurrentEventArgs, BuildClaimCompletionArgs, BuildApproveClaimArgs, BuildQuestionClaimArgs, BuildFinalizeEventArgs, RitualEventAccountContext, CompletionClaimAccountContext } from './instructionsEvents'
import { buildCloseTerminalVaultsInstruction, buildInitializeCurrentEventInstruction, buildClaimCompletionInstruction, buildApproveClaimInstruction, buildQuestionClaimInstruction, buildFinalizeEventInstruction } from './instructionsEvents'
import { RITUALS_CURRENT_CONFIG } from './programIds'
import { eventPda } from './pdas'
import { buildEjectRitualInstruction, type BuildEjectRitualArgs } from './instructionsEject'
import type { PublicKeyText } from '../../domain/rituals/types'

const MAX_SAFE = Number.MAX_SAFE_INTEGER
const MAX_U64 = 0xffffffffffffffffn
type PreparationCategory = 'deployment' | 'input' | 'rpc' | 'fee' | 'rent' | 'mutation'
export class RitualPreparationError extends Error {
  readonly category: PreparationCategory
  constructor(category: PreparationCategory, message: string) { super(message); this.name = 'RitualPreparationError'; this.category = category }
}
export type RitualPreparationTransport = {
  getLatestBlockhashAndContext: (config: Readonly<{ commitment: 'confirmed' }>) => Promise<unknown>
  getFeeForMessage: (message: Message, config: Readonly<{ commitment: 'confirmed'; minContextSlot: number }>) => Promise<unknown>
  getMinimumBalanceForRentExemption: (dataLength: number, commitment: 'confirmed') => Promise<unknown>
}
type ActionKind = 'create' | 'create-solo' | 'fund' | 'fund-and-activate' | 'activate' | 'cancel' | 'close' | 'initialize-event' | 'claim' | 'approve' | 'question' | 'declare-skip' | 'finalize' | 'create-and-fund' | 'create-solo-fund-and-activate' | 'initialize-event-and-claim' | 'eject'
export type PreparedExpectation =
  | Readonly<{ kind: 'created'; creator: PublicKeyText; nonce: bigint }>
  | Readonly<{ kind: 'skip-declared'; eventIndex: number }>
  | Readonly<{ kind: 'funded'; member: PublicKeyText; expectedFundedMemberCount: number; expectedFundedStakeTotal: bigint; expectedFundedFeeTotal: bigint }>
  | Readonly<{ kind: 'activated' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'ejected'; creatorDestination: PublicKeyText; minimumCreatorBalance: bigint }>
  | Readonly<{ kind: 'vaults-closed' }>
  | Readonly<{ kind: 'event-initialized'; eventIndex: number }>
  | Readonly<{ kind: 'claimed'; claimant: PublicKeyText; eventIndex: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'approved'; claimant: PublicKeyText; approver: PublicKeyText; eventIndex: number; expectedApprovalCount: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'questioned'; claimant: PublicKeyText; questioner: PublicKeyText; eventIndex: number }>
  | Readonly<{ kind: 'finalized'; eventIndex: number; expectedEventStatus: 'Settled' | 'Voided'; expectedVoidReason: 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims' | 'DeclaredSkip'; expectedRitualStatus: 'Active' | 'Completed'; expectedCurrentEventIndex: number; expectedSettledEventCount: number }>
  | Readonly<{ kind: 'bundle'; expectations: readonly PreparedExpectation[] }>
export type RitualPreparationSummary = Readonly<{
  clusterLabel: 'local/test-unconfigured'
  tokenMint: PublicKeyText
  tokenOutflow: bigint
  stakeOutflow: bigint
  activationFeeOutflow: bigint
  escrowActivationFeeTransfer: bigint
  escrowSettlementTransfer: bigint
  protocolForfeitureShare: 0n
  estimatedNetworkFeeLamports: bigint
  estimatedRentLamports: bigint
  estimatedRentCreditLamports: bigint
  rentCreditRecipient: PublicKeyText | null
  totalEstimatedLamportOutflow: bigint
  creates: Readonly<{ description: string; count: number }> | null
  networkFeeIsEstimate: true
  rentCreditIsEstimate: boolean
  /** SOL sent to the app's own settle key inside this transaction (solo create only). */
  settlerFundingLamports?: bigint
}>
export type PreparedRitualAction = Readonly<{
  kind: ActionKind
  programId: PublicKeyText
  ritualAddress: PublicKeyText
  feePayer: PublicKeyText
  /** The exact recent blockhash bound into the reviewed message. */
  blockhash: string
  blockhashContextSlot: number
  lastValidBlockHeight: number
  messageDigest: string
  summary: RitualPreparationSummary
  expectation: PreparedExpectation
}>
export type WalletRitualTransaction = Readonly<{
  kind: ActionKind
  transaction: Transaction
  blockhash: string
  expectedMessageDigest: string
  submittedContextSlot: number
  lastValidBlockHeight: number
  expectation: PreparedExpectation
  ritualAddress: PublicKeyText
}>
type Internal = {
  kind: ActionKind; programId: PublicKey; feePayer: PublicKey; ritualAddress: PublicKey; blockhash: string
  lastValidBlockHeight: number; blockhashContextSlot: number; instructions: readonly TransactionInstruction[]
  messageBytes: Uint8Array; messageDigest: string; expectation: PreparedExpectation
}
/**
 * Explicit compute budget, appended after the program instruction.
 *
 * Phantom rewrites any transaction that lacks compute-budget instructions
 * (it inserts its own limit + priority fee before signing), so the message it
 * signs and sends differs from the one the user reviewed and the exact-bytes
 * signature check rejects a transaction that actually landed. Declaring our own
 * budget keeps the signed message byte-identical to the prepared one.
 * 200k CU matches the runtime default for one program instruction (Create
 * measured 37,517 CU on devnet); the price adds 200 lamports at most.
 */
export const RITUAL_COMPUTE_UNIT_LIMIT = 200_000
export const RITUAL_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000
const budgetInstructions = (kind?: ActionKind): TransactionInstruction[] => [
  ComputeBudgetProgram.setComputeUnitLimit({ units: kind === 'eject' ? 600_000 : RITUAL_COMPUTE_UNIT_LIMIT }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: RITUAL_COMPUTE_UNIT_PRICE_MICROLAMPORTS }),
]
const fail = (category: PreparationCategory, message: string): never => { throw new RitualPreparationError(category, message) }
const copyKey = (key: PublicKey): PublicKey => new PublicKey(Uint8Array.from(key.toBytes()))
const keyText = (key: PublicKey): PublicKeyText => key.toBase58() as PublicKeyText
const copyInstruction = (instruction: TransactionInstruction): TransactionInstruction => new TransactionInstruction({
  programId: copyKey(instruction.programId), keys: instruction.keys.map(meta => ({ pubkey: copyKey(meta.pubkey), isSigner: meta.isSigner, isWritable: meta.isWritable })), data: Buffer.from(instruction.data),
})
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i])
const popcount = (value: number): number => { let count = 0; for (let bits = value; bits !== 0; bits &= bits - 1) count += 1; return count }

type FinalizeOutcome = Readonly<{ status: 'Settled' | 'Voided'; voidReason: 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims' | 'DeclaredSkip' }>
/**
 * Mirrors the program's settlement plans. Group: no confirmed member voids
 * the week. Solo (derive_solo_event_settlement_plan): a declared skip voids,
 * an unresolved claim voids, and a week nobody checked in to SETTLES with the
 * stake forfeited to the locked destination.
 */
function expectedFinalizeOutcome(
  ritual: Readonly<{ kind: 'Group' | 'Solo'; skipDeclared: boolean; skipEventIndex: number }>,
  event: Readonly<{ eventIndex: number; claimedMembersBitmap: number; questionedMembersBitmap: number }>,
  pending: number,
  confirmedCount: number,
): FinalizeOutcome {
  const unresolved = pending !== 0 || event.questionedMembersBitmap !== 0
  if (ritual.kind === 'Solo') {
    if (ritual.skipDeclared && ritual.skipEventIndex === event.eventIndex) return { status: 'Voided', voidReason: 'DeclaredSkip' }
    if (unresolved || (event.claimedMembersBitmap !== 0 && confirmedCount === 0)) return { status: 'Voided', voidReason: 'UnresolvedClaims' }
    return { status: 'Settled', voidReason: 'None' }
  }
  if (unresolved) return { status: 'Voided', voidReason: 'UnresolvedClaims' }
  return confirmedCount === 0 ? { status: 'Voided', voidReason: 'NoConfirmedMembers' } : { status: 'Settled', voidReason: 'None' }
}

function checkedSettlerFunding(value: unknown, payer: PublicKey): SettlerFunding {
  const record = inputObject(value, 'settlerFunding')
  let to: PublicKey
  try { to = copyKey(record.to as PublicKey) } catch { return fail('input', 'invalid settlerFunding.to') }
  const lamports = record.lamports
  if (typeof lamports !== 'bigint' || lamports <= 0n || lamports > MAX_SETTLER_FUNDING_LAMPORTS) fail('input', 'settlerFunding.lamports is out of range')
  if (to.equals(PublicKey.default) || to.equals(payer)) fail('input', 'settlerFunding.to must be a separate key')
  return Object.freeze({ to, lamports: lamports as bigint })
}
const nonceFromInstruction = (instruction: TransactionInstruction): bigint => { let nonce = 0n; for (let i = 0; i < 8; i += 1) nonce |= BigInt(instruction.data[8 + i]) << BigInt(i * 8); return nonce }
const hex = (bytes: Uint8Array): string => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
function safeSlot(value: unknown, name: string, category: 'rpc' | 'fee' = 'rpc'): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(category, `invalid ${name}`); return value as number }
function object(value: unknown, name: string, category: 'rpc' | 'fee' = 'rpc'): Record<string, unknown> { try { if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category, `invalid ${name}`); return value as Record<string, unknown> } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail(category, `invalid ${name}`) } }
function property(value: Record<string, unknown>, name: string, category: 'rpc' | 'fee' = 'rpc'): unknown { try { return value[name] } catch { return fail(category, `invalid ${name}`) } }
function blockhash(value: unknown): string { if (typeof value !== 'string' || value.length < 32 || value.length > 44) fail('rpc', 'invalid blockhash'); try { const key = new PublicKey(value as string); if (key.equals(PublicKey.default) || key.toBase58() !== value) fail('rpc', 'invalid blockhash') } catch { fail('rpc', 'invalid blockhash') }; return value as string }
function amount(value: unknown, category: 'fee' | 'rent'): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE) fail(category, 'invalid lamport amount'); return value as number }
function transportMethod(transport: unknown, name: keyof RitualPreparationTransport): (...args: any[]) => Promise<unknown> { if (transport === null || Array.isArray(transport) || (typeof transport !== 'object' && typeof transport !== 'function')) fail('input', 'transport is invalid'); try { const method = (transport as Record<string, unknown>)[name]; if (typeof method !== 'function') fail('input', 'transport is invalid'); return (method as (...args: any[]) => Promise<unknown>).bind(transport) } catch { return fail('input', 'transport is invalid') } }
async function callTransport<T>(method: (...args: any[]) => unknown, args: unknown[], category: 'rpc' | 'fee' | 'rent', message: string): Promise<T> { try { return await Promise.resolve().then(() => method(...args)) as T } catch { return fail(category, message) } }
function u64(value: bigint, name: string): bigint { if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) fail('input', `${name} is outside u64`); return value }
function addU64(a: bigint, b: bigint, name: string): bigint { const result = u64(a, name) + u64(b, name); return u64(result, name) }
function inputObject(value: unknown, name: string): Record<string, unknown> {
  try { if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('input', `invalid ${name}`); return value as Record<string, unknown> } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', `invalid ${name}`) }
}
function inputProperty(value: unknown, name: string): unknown {
  const record = inputObject(value, 'arguments')
  try { return record[name] } catch { return fail('input', `invalid ${name}`) }
}
function ritualSnapshot(context: unknown): { address: PublicKey; account: RitualAccountView } {
  try {
    const address = copyKey(inputProperty(context, 'address') as PublicKey)
    const a = inputObject(inputProperty(context, 'account'), 'ritual.account')
    const read = (name: string) => inputProperty(a, name)
    const membersRaw = read('members'); if (!Array.isArray(membersRaw)) fail('input', 'invalid ritual.members')
    const scheduleRaw = read('schedule'); if (!Array.isArray(scheduleRaw)) fail('input', 'invalid ritual.schedule')
    const members = Object.freeze((membersRaw as unknown[]).map((member: unknown, index: number) => { try { return copyKey(member as PublicKey) } catch { return fail('input', `invalid ritual.members[${index}]`) } }))
    const schedule = Object.freeze((scheduleRaw as unknown[]).map((window: unknown, index: number) => { const w = inputObject(window, `ritual.schedule[${index}]`); return Object.freeze({ opens: readBigint(w.opens, `schedule[${index}].opens`), deadline: readBigint(w.deadline, `schedule[${index}].deadline`), resolution: readBigint(w.resolution, `schedule[${index}].resolution`) }) }))
    const account = Object.freeze({
      schemaVersion: read('schemaVersion'), protocolConfig: copyKey(read('protocolConfig') as PublicKey), creator: copyKey(read('creator') as PublicKey), nonce: readBigint(read('nonce'), 'nonce'), ruleDigest: read('ruleDigest'), stakeMint: copyKey(read('stakeMint') as PublicKey), members,
      memberTotalStake: readU64(read('memberTotalStake'), 'memberTotalStake'), perEventAllocation: readBigint(read('perEventAllocation'), 'perEventAllocation'), schedule, additionalConfirmationThreshold: read('additionalConfirmationThreshold'), feePayerMode: read('feePayerMode'), lockedActivationFee: readU64(read('lockedActivationFee'), 'lockedActivationFee'), stakeDecimals: read('stakeDecimals'), lockedFeeRecipient: copyKey(read('lockedFeeRecipient') as PublicKey), stakeVault: copyKey(read('stakeVault') as PublicKey), feeVault: copyKey(read('feeVault') as PublicKey), stakeVaultBump: read('stakeVaultBump'), feeVaultBump: read('feeVaultBump'), fundedMembersBitmap: read('fundedMembersBitmap'), fundedMemberCount: read('fundedMemberCount'), fundedStakeTotal: readU64(read('fundedStakeTotal'), 'fundedStakeTotal'), fundedFeeTotal: readU64(read('fundedFeeTotal'), 'fundedFeeTotal'), status: read('status'), currentEventIndex: read('currentEventIndex'), settledEventCount: read('settledEventCount'), createdAt: readBigint(read('createdAt'), 'createdAt'), activatedAt: readBigint(read('activatedAt'), 'activatedAt'), cancelledAt: readBigint(read('cancelledAt'), 'cancelledAt'), completedAt: readBigint(read('completedAt'), 'completedAt'), vaultsClosed: read('vaultsClosed'), kind: read('kind'), witness: read('witness') === null ? null : copyKey(read('witness') as PublicKey), season: read('season') === null ? null : copyKey(read('season') as PublicKey), forfeitDestination: copyKey(read('forfeitDestination') as PublicKey), skipDeclared: read('skipDeclared'), skipEventIndex: read('skipEventIndex'), bump: read('bump'),
    }) as RitualAccountView
    return { address, account }
  } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid ritual context') }
}
function eventSnapshot(context: unknown): RitualEventAccountContext {
  const value = inputObject(context, 'event'); const address = copyKey(inputProperty(value, 'address') as PublicKey); const raw = inputObject(inputProperty(value, 'account'), 'event.account'); const read = (name: string) => inputProperty(raw, name); const windowRaw = inputObject(read('window'), 'event.window')
  const account = Object.freeze({ schemaVersion: read('schemaVersion'), ritual: copyKey(read('ritual') as PublicKey), eventIndex: read('eventIndex'), window: Object.freeze({ opens: readBigint(windowRaw.opens, 'event.window.opens'), deadline: readBigint(windowRaw.deadline, 'event.window.deadline'), resolution: readBigint(windowRaw.resolution, 'event.window.resolution') }), memberCount: read('memberCount'), status: read('status'), claimedMembersBitmap: read('claimedMembersBitmap'), confirmedMembersBitmap: read('confirmedMembersBitmap'), questionedMembersBitmap: read('questionedMembersBitmap'), initializedAt: readBigint(read('initializedAt'), 'event.initializedAt'), resolvedAt: readBigint(read('resolvedAt'), 'event.resolvedAt'), settlementVersion: read('settlementVersion'), voidReason: read('voidReason'), eventPool: readU64(read('eventPool'), 'event.eventPool'), forfeitedTotal: readU64(read('forfeitedTotal'), 'event.forfeitedTotal'), payoutTotal: readU64(read('payoutTotal'), 'event.payoutTotal'), refundedTotal: readU64(read('refundedTotal'), 'event.refundedTotal'), confirmedMemberCount: read('confirmedMemberCount'), remainderUnits: readU64(read('remainderUnits'), 'event.remainderUnits'), remainingStakeTotalAfter: readU64(read('remainingStakeTotalAfter'), 'event.remainingStakeTotalAfter'), bump: read('bump') }) as RitualEventAccountContext['account']
  return Object.freeze({ address, account })
}
function claimSnapshot(context: unknown): CompletionClaimAccountContext {
  const value = inputObject(context, 'claim'); const address = copyKey(inputProperty(value, 'address') as PublicKey); const raw = inputObject(inputProperty(value, 'account'), 'claim.account'); const read = (name: string) => inputProperty(raw, name)
  const account = Object.freeze({ schemaVersion: read('schemaVersion'), ritual: copyKey(read('ritual') as PublicKey), event: copyKey(read('event') as PublicKey), eventIndex: read('eventIndex'), claimant: copyKey(read('claimant') as PublicKey), memberIndex: read('memberIndex'), claimVersion: read('claimVersion'), status: read('status'), requiredAdditionalConfirmations: read('requiredAdditionalConfirmations'), approvalsBitmap: read('approvalsBitmap'), approvalCount: read('approvalCount'), claimedAt: readBigint(read('claimedAt'), 'claim.claimedAt'), bump: read('bump') }) as CompletionClaimAccountContext['account']
  return Object.freeze({ address, account })
}
function readBigint(value: unknown, name: string): bigint { if (typeof value !== 'bigint') fail('input', `${name} is invalid`); return value as bigint }
function readU64(value: unknown, name: string): bigint { return u64(readBigint(value, name), name) }

export type BuildCreateAndFundArgs = BuildCreateRitualArgs & Readonly<{ memberSource: PublicKey; lockedActivationFee: bigint }>
/**
 * Devnet: the creator pre-pays a little SOL to the app's own settle key in the
 * same approval, so closing and settling weeks (permissionless instructions)
 * never need another wallet prompt. Capped; the key can only pay fees/rent.
 */
export type SettlerFunding = Readonly<{ to: PublicKey; lamports: bigint }>
export const MAX_SETTLER_FUNDING_LAMPORTS = 50_000_000n
export type BuildCreateSoloFundAndActivateArgs = BuildCreateSoloRitualArgs & Readonly<{ memberSource: PublicKey; lockedActivationFee: bigint; settlerFunding?: SettlerFunding | null }>
export type BuildFundAndActivateArgs = BuildFundMemberArgs
export type BuildInitializeAndClaimArgs = BuildInitializeCurrentEventArgs & Readonly<{ claimant: PublicKey }>
export type PrepareEjectArgs = BuildEjectRitualArgs & Readonly<{ creatorBalanceBefore: bigint; expectedRefund: bigint; missingReceiptCount: number }>

export class RitualActionPreparer {
  #snapshots = new WeakMap<object, Internal>()
  private readonly programId!: PublicKey
  private readonly latest!: (...args: any[]) => Promise<unknown>
  private readonly fee!: (...args: any[]) => Promise<unknown>
  private readonly rent!: (...args: any[]) => Promise<unknown>
  constructor(transport: RitualPreparationTransport, programId: PublicKey) {
    try { if (!(programId instanceof PublicKey) || programId.equals(PublicKey.default)) fail('input', 'programId is invalid'); this.programId = copyKey(programId); this.latest = transportMethod(transport, 'getLatestBlockhashAndContext'); this.fee = transportMethod(transport, 'getFeeForMessage'); this.rent = transportMethod(transport, 'getMinimumBalanceForRentExemption') }
    catch (error) { if (error instanceof RitualPreparationError) throw error; fail('input', 'invalid preparation dependencies') }
  }
  private internalFor(prepared: PreparedRitualAction): Internal { if (prepared === null || (typeof prepared !== 'object' && typeof prepared !== 'function')) fail('input', 'prepared action provenance is invalid'); let internal: Internal | undefined; try { internal = this.#snapshots.get(prepared as object) } catch { fail('input', 'prepared action provenance is invalid') }; if (!internal) fail('input', 'prepared action provenance is invalid'); return internal as Internal }

  private async prepare(
    kind: ActionKind, instructionInput: TransactionInstruction | readonly TransactionInstruction[], feePayer: PublicKey, ritualAddress: PublicKey, tokenMint: PublicKey,
    expectation: PreparedExpectation, outflow: { token: bigint; stake: bigint; activation: bigint; escrow: bigint; settlement?: bigint },
    rentLengths: readonly number[], rentCreditRecipient: PublicKeyText | null, creates: RitualPreparationSummary['creates'], settlerFunding: SettlerFunding | null = null,
  ): Promise<PreparedRitualAction> {
    const rawInstructions = Array.isArray(instructionInput) ? instructionInput : [instructionInput]
    if (rawInstructions.length === 0 || rawInstructions.some((instruction) => !instruction.programId.equals(this.programId))) fail('input', 'programId does not match preparer')
    const instructions = rawInstructions.map(copyInstruction)
    const payer = copyKey(feePayer); const ritual = copyKey(ritualAddress)
    // The only non-Rituals instruction ever allowed: one capped SOL transfer
    // from the signer to the app's own settle key (see SettlerFunding).
    const funding = settlerFunding === null ? null : checkedSettlerFunding(settlerFunding, payer)
    if (funding) instructions.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: funding.to, lamports: Number(funding.lamports) }))
    const latest = await callTransport(this.latest, [{ commitment: 'confirmed' }], 'rpc', 'latest blockhash request failed')
    const latestObject = object(latest, 'latest blockhash response'); const context = object(property(latestObject, 'context'), 'blockhash context'); const value = object(property(latestObject, 'value'), 'blockhash value')
    const slot = safeSlot(property(context, 'slot'), 'blockhash context slot'); const recentBlockhash = blockhash(property(value, 'blockhash')); const lastValidBlockHeight = safeSlot(property(value, 'lastValidBlockHeight'), 'last valid block height')
    const transaction = new Transaction({ feePayer: payer, blockhash: recentBlockhash, lastValidBlockHeight }); transaction.add(...instructions, ...budgetInstructions(kind)); const message = transaction.compileMessage(); const before = Uint8Array.from(message.serialize())
    const feeResponse = await callTransport(this.fee, [message, { commitment: 'confirmed', minContextSlot: slot }], 'fee', 'fee request failed')
    try { if (!equalBytes(Uint8Array.from(message.serialize()), before)) fail('fee', 'fee transport mutated message') } catch (error) { if (error instanceof RitualPreparationError) throw error; fail('fee', 'fee transport mutated message') }
    const feeObject = object(feeResponse, 'fee response', 'fee'); const feeContext = object(property(feeObject, 'context', 'fee'), 'fee context', 'fee'); const feeSlot = safeSlot(property(feeContext, 'slot', 'fee'), 'fee context slot', 'fee'); if (feeSlot < slot) fail('fee', 'fee context is stale'); const feeValue = property(feeObject, 'value', 'fee'); if (feeValue === null) fail('fee', 'fee is unavailable'); const networkFee = BigInt(amount(feeValue, 'fee'))
    let rentDebit = 0n; let rentCredit = 0n; for (const length of rentLengths) { const result = BigInt(amount(await callTransport(this.rent, [length, 'confirmed'], 'rent', 'rent request failed'), 'rent')); if (rentCreditRecipient === null) rentDebit += result; else rentCredit += result }
    const messageBytes = Uint8Array.from(transaction.serializeMessage()); const messageDigest = hex(sha256(messageBytes)); const total = networkFee + rentDebit + (funding?.lamports ?? 0n)
    const stakeOutflow = u64(outflow.stake, 'stakeOutflow'); const activationFeeOutflow = u64(outflow.activation, 'activationFeeOutflow'); const tokenOutflow = u64(outflow.token, 'tokenOutflow'); if (tokenOutflow !== addU64(stakeOutflow, activationFeeOutflow, 'tokenOutflow')) fail('input', 'tokenOutflow does not equal stakeOutflow plus activationFeeOutflow')
    const internal: Internal = { kind, programId: copyKey(this.programId), feePayer: payer, ritualAddress: ritual, blockhash: recentBlockhash, lastValidBlockHeight, blockhashContextSlot: slot, instructions, messageBytes, messageDigest, expectation }
    const summary = Object.freeze({ clusterLabel: 'local/test-unconfigured' as const, tokenMint: keyText(tokenMint), tokenOutflow, stakeOutflow, activationFeeOutflow, escrowActivationFeeTransfer: u64(outflow.escrow, 'escrowActivationFeeTransfer'), escrowSettlementTransfer: u64(outflow.settlement ?? 0n, 'escrowSettlementTransfer'), protocolForfeitureShare: 0n, estimatedNetworkFeeLamports: networkFee, estimatedRentLamports: rentDebit, estimatedRentCreditLamports: rentCredit, rentCreditRecipient, totalEstimatedLamportOutflow: total, creates, networkFeeIsEstimate: true as const, rentCreditIsEstimate: rentCreditRecipient !== null, ...(funding ? { settlerFundingLamports: funding.lamports } : {}) })
    const action = Object.freeze({ kind, programId: keyText(this.programId), ritualAddress: keyText(ritual), feePayer: keyText(payer), blockhash: recentBlockhash, blockhashContextSlot: slot, lastValidBlockHeight, messageDigest, summary, expectation })
    this.#snapshots.set(action, internal); return action
  }

  async prepareCreate(args: BuildCreateRitualArgs): Promise<PreparedRitualAction> {
    let instruction!: TransactionInstruction; try { instruction = buildCreateRitualInstruction(args) } catch { fail('input', 'invalid Create Ritual inputs') }
    const ix = copyInstruction(instruction); const feePayer = copyKey(ix.keys[2].pubkey); const ritual = copyKey(ix.keys[1].pubkey); const mint = copyKey(ix.keys[3].pubkey); const nonce = nonceFromInstruction(ix)
    return this.prepare('create', ix, feePayer, ritual, mint, Object.freeze({ kind: 'created', creator: keyText(feePayer), nonce }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'ritual, stake vault, and fee vault', count: 3 }))
  }

  async prepareCreateSolo(args: BuildCreateSoloRitualArgs): Promise<PreparedRitualAction> {
    let instruction!: TransactionInstruction; try { instruction = buildCreateSoloRitualInstruction(args) } catch { fail('input', 'invalid Create Solo Ritual inputs') }
    const ix = copyInstruction(instruction); const feePayer = copyKey(ix.keys[2].pubkey); const ritual = copyKey(ix.keys[1].pubkey); const mint = copyKey(ix.keys[3].pubkey); const nonce = nonceFromInstruction(ix)
    return this.prepare('create-solo', ix, feePayer, ritual, mint, Object.freeze({ kind: 'created', creator: keyText(feePayer), nonce }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'solo ritual, stake vault, and fee vault', count: 3 }))
  }

  async prepareDeclareSkip(args: BuildDeclareSkipArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const eventIndex = inputProperty(args, 'eventIndex'); if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > 15) fail('input', 'invalid eventIndex'); const member = copyKey(inputProperty(args, 'member') as PublicKey); const instruction = buildDeclareSkipInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, member, eventIndex: eventIndex as number }); return this.prepare('declare-skip', instruction, member, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'skip-declared', eventIndex: eventIndex as number }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Declare Skip inputs') }
  }

  async prepareEject(args: PrepareEjectArgs): Promise<PreparedRitualAction> {
    try {
      const ritual = ritualSnapshot(args.ritual)
      const creator = copyKey(args.creator)
      const destination = copyKey(args.creatorDestination)
      const expectedForfeit = u64(args.expectedForfeit, 'expectedForfeit')
      const expectedRefund = u64(args.expectedRefund, 'expectedRefund')
      const minimumCreatorBalance = addU64(args.creatorBalanceBefore, expectedRefund, 'creator balance')
      const count = args.missingReceiptCount
      if (!Number.isSafeInteger(count) || count < 0 || count > ritual.account.schedule.length) fail('input', 'invalid receipt count')
      const ix = buildEjectRitualInstruction({ programId: args.programId, ritual, creator, creatorDestination: destination, expectedForfeit })
      return this.prepare('eject', ix, creator, ritual.address, ritual.account.stakeMint,
        Object.freeze({ kind: 'ejected', creatorDestination: keyText(destination), minimumCreatorBalance }),
        { token: 0n, stake: 0n, activation: 0n, escrow: 0n, settlement: addU64(expectedRefund, expectedForfeit, 'escrow transfer') },
        Array.from({ length: count }, () => ACCOUNT_DATA_LENGTHS.RitualEvent), null,
        count ? Object.freeze({ description: 'settled week receipts', count }) : null)
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid End Ritual inputs') }
  }

  async prepareCreateAndFund(args: BuildCreateAndFundArgs): Promise<PreparedRitualAction> {
    try {
      const create = buildCreateRitualInstruction(args)
      const programId = copyKey(inputProperty(args, 'programId') as PublicKey)
      const creator = copyKey(inputProperty(args, 'creator') as PublicKey)
      const mint = copyKey(inputProperty(args, 'stakeMint') as PublicKey)
      const feeRecipient = copyKey(inputProperty(args, 'feeRecipientToken') as PublicKey)
      const nonce = inputProperty(inputProperty(args, 'ritual'), 'nonce') as bigint
      const accounts = deriveCreateRitualAccounts(programId, creator, nonce)
      const ritualInput = inputProperty(args, 'ritual')
      const membersRaw = inputProperty(ritualInput, 'members')
      if (!Array.isArray(membersRaw)) fail('input', 'invalid ritual members')
      const members = Object.freeze((membersRaw as unknown[]).map((member, index) => copyKey(member as PublicKey)))
      const memberSource = copyKey(inputProperty(args, 'memberSource') as PublicKey)
      const memberTotalStake = u64(inputProperty(ritualInput, 'memberTotalStake') as bigint, 'memberTotalStake')
      const lockedActivationFee = u64(inputProperty(args, 'lockedActivationFee') as bigint, 'lockedActivationFee')
      const fundingContext = {
        address: accounts.ritual,
        account: { creator, nonce, protocolConfig: accounts.protocolConfig, stakeMint: mint, members, stakeVault: accounts.stakeVault, feeVault: accounts.feeVault, bump: accounts.ritualBump, stakeVaultBump: accounts.stakeVaultBump, feeVaultBump: accounts.feeVaultBump, lockedFeeRecipient: feeRecipient, status: 'Funding', fundedMembersBitmap: 0, fundedMemberCount: 0, kind: 'Group', witness: null, season: null, forfeitDestination: PublicKey.default, skipDeclared: false, currentEventIndex: 0 },
      } as RitualAccountContext
      const fund = buildFundMemberInstruction({ programId, ritual: fundingContext, member: creator, memberSource })
      return this.prepare('create-and-fund', [create, fund], creator, accounts.ritual, mint, Object.freeze({ kind: 'bundle', expectations: Object.freeze([{ kind: 'created', creator: keyText(creator), nonce }, { kind: 'funded', member: keyText(creator), expectedFundedMemberCount: 1, expectedFundedStakeTotal: memberTotalStake, expectedFundedFeeTotal: lockedActivationFee }]) }) as PreparedExpectation, { token: addU64(memberTotalStake, lockedActivationFee, 'tokenOutflow'), stake: memberTotalStake, activation: lockedActivationFee, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'ritual, stake vault, fee vault, and host funding', count: 3 }))
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Create and Fund inputs') }
  }

  async prepareCreateSoloFundAndActivate(args: BuildCreateSoloFundAndActivateArgs): Promise<PreparedRitualAction> {
    try {
      const create = buildCreateSoloRitualInstruction(args)
      const programId = copyKey(inputProperty(args, 'programId') as PublicKey)
      const creator = copyKey(inputProperty(args, 'creator') as PublicKey)
      const mint = copyKey(inputProperty(args, 'stakeMint') as PublicKey)
      const feeRecipient = copyKey(inputProperty(args, 'feeRecipientToken') as PublicKey)
      const forfeitDestination = copyKey(inputProperty(args, 'forfeitDestination') as PublicKey)
      const ritualInput = inputProperty(args, 'ritual')
      const nonce = inputProperty(ritualInput, 'nonce') as bigint
      const accounts = deriveCreateRitualAccounts(programId, creator, nonce)
      const memberSource = copyKey(inputProperty(args, 'memberSource') as PublicKey)
      const memberTotalStake = u64(inputProperty(ritualInput, 'memberTotalStake') as bigint, 'memberTotalStake')
      const lockedActivationFee = u64(inputProperty(args, 'lockedActivationFee') as bigint, 'lockedActivationFee')
      const seasonValue = inputProperty(args, 'season')
      const season = seasonValue === undefined || seasonValue === null ? null : copyKey(seasonValue as PublicKey)
      const witnessValue = inputProperty(ritualInput, 'witness')
      const witness = witnessValue === null ? null : copyKey(witnessValue as PublicKey)
      const fundingContext = {
        address: accounts.ritual,
        account: { creator, nonce, protocolConfig: accounts.protocolConfig, stakeMint: mint, members: [creator], stakeVault: accounts.stakeVault, feeVault: accounts.feeVault, bump: accounts.ritualBump, stakeVaultBump: accounts.stakeVaultBump, feeVaultBump: accounts.feeVaultBump, lockedFeeRecipient: feeRecipient, status: 'Funding' as const, fundedMembersBitmap: 0, fundedMemberCount: 0, kind: 'Solo' as const, witness, season, forfeitDestination, skipDeclared: false, currentEventIndex: 0 },
      } as unknown as RitualAccountContext
      const fund = buildFundMemberInstruction({ programId, ritual: fundingContext, member: creator, memberSource })
      const activated = { address: accounts.ritual, account: { ...fundingContext.account, fundedMembersBitmap: 1, fundedMemberCount: 1, fundedStakeTotal: memberTotalStake, fundedFeeTotal: lockedActivationFee } } as RitualAccountContext
      const activate = buildActivateRitualInstruction({ programId, ritual: activated })
      const expectation: PreparedExpectation = Object.freeze({ kind: 'bundle' as const, expectations: Object.freeze([
        { kind: 'created' as const, creator: keyText(creator), nonce },
        { kind: 'funded' as const, member: keyText(creator), expectedFundedMemberCount: 1, expectedFundedStakeTotal: memberTotalStake, expectedFundedFeeTotal: lockedActivationFee },
        { kind: 'activated' as const },
      ]) })
      return this.prepare('create-solo-fund-and-activate', [create, fund, activate], creator, accounts.ritual, mint, expectation, { token: addU64(memberTotalStake, lockedActivationFee, 'tokenOutflow'), stake: memberTotalStake, activation: lockedActivationFee, escrow: lockedActivationFee }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'solo ritual, stake vault, fee vault, creator funding, and activation', count: 3 }), (inputProperty(args, 'settlerFunding') ?? null) as SettlerFunding | null)
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Create Solo Fund and Activate inputs') }
  }

  async prepareInitializeAndClaim(args: BuildInitializeAndClaimArgs): Promise<PreparedRitualAction> {
    try {
      const ritual = ritualSnapshot(inputProperty(args, 'ritual'))
      const index = inputProperty(args, 'eventIndex') as number
      if (!Number.isSafeInteger(index) || index < 0 || index > 15 || index !== ritual.account.currentEventIndex) fail('input', 'invalid eventIndex')
      const payer = copyKey(inputProperty(args, 'payer') as PublicKey)
      const claimant = copyKey(inputProperty(args, 'claimant') as PublicKey)
      const programId = copyKey(inputProperty(args, 'programId') as PublicKey)
      const initialize = buildInitializeCurrentEventInstruction({ programId, ritual, eventIndex: index, payer })
      const [eventAddress, eventBump] = eventPda(ritual.address, index, programId)
      const window = ritual.account.schedule[index]
      if (!window) fail('input', 'event schedule is unavailable')
      const event: RitualEventAccountContext = { address: eventAddress, account: { schemaVersion: 1, ritual: ritual.address, eventIndex: index, window, memberCount: ritual.account.members.length, status: 'Scheduled', claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0, initializedAt: 0n, resolvedAt: 0n, settlementVersion: 0, voidReason: 'None', eventPool: 0n, forfeitedTotal: 0n, payoutTotal: 0n, refundedTotal: 0n, confirmedMemberCount: 0, remainderUnits: 0n, remainingStakeTotalAfter: 0n, bump: eventBump } }
      const claim = buildClaimCompletionInstruction({ programId, ritual, event, claimant })
      const expectedClaimStatus = ritual.account.additionalConfirmationThreshold === 0 ? 'Confirmed' : 'Pending'
      return this.prepare('initialize-event-and-claim', [initialize, claim], claimant, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'bundle', expectations: Object.freeze([{ kind: 'event-initialized', eventIndex: index }, { kind: 'claimed', claimant: keyText(claimant), eventIndex: index, expectedClaimStatus }]) }) as PreparedExpectation, { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.RitualEvent, ACCOUNT_DATA_LENGTHS.CompletionClaim], null, Object.freeze({ description: 'ritual event and completion claim', count: 2 }))
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Initialize and Claim inputs') }
  }

  async prepareFund(args: BuildFundMemberArgs): Promise<PreparedRitualAction> {
    try {
      const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const member = copyKey(inputProperty(args, 'member') as PublicKey); const memberSource = copyKey(inputProperty(args, 'memberSource') as PublicKey); const account = ritual.account; const index = account.members.findIndex(item => item.equals(member)); if (index < 0) fail('input', 'member is not in ritual')
      const share = account.feePayerMode === 'Host' ? (member.equals(account.creator) ? account.lockedActivationFee : 0n) : account.lockedActivationFee / BigInt(account.members.length) + (BigInt(index) < account.lockedActivationFee % BigInt(account.members.length) ? 1n : 0n)
      const expectedCount = account.fundedMemberCount + 1; const stakeTotal = addU64(account.fundedStakeTotal, account.memberTotalStake, 'expected stake total'); const feeTotal = addU64(account.fundedFeeTotal, share, 'expected fee total'); const walletTokenOutflow = addU64(account.memberTotalStake, share, 'wallet token outflow')
      const instruction = buildFundMemberInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, member, memberSource })
      return this.prepare('fund', instruction, member, ritual.address, account.stakeMint, Object.freeze({ kind: 'funded', member: keyText(member), expectedFundedMemberCount: expectedCount, expectedFundedStakeTotal: stakeTotal, expectedFundedFeeTotal: feeTotal }), { token: walletTokenOutflow, stake: account.memberTotalStake, activation: share, escrow: 0n }, [], null, null)
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Fund Ritual inputs') }
  }
  async prepareFundAndActivate(args: BuildFundAndActivateArgs): Promise<PreparedRitualAction> {
    try {
      const ritual = ritualSnapshot(inputProperty(args, 'ritual'))
      const member = copyKey(inputProperty(args, 'member') as PublicKey)
      const memberSource = copyKey(inputProperty(args, 'memberSource') as PublicKey)
      const account = ritual.account
      const index = account.members.findIndex((item) => item.equals(member))
      if (index < 0) fail('input', 'member is not in ritual')
      const memberMask = (1 << account.members.length) - 1
      if (account.status !== 'Funding' || (account.fundedMembersBitmap & (1 << index)) !== 0 || (account.fundedMembersBitmap | (1 << index)) !== memberMask) fail('input', 'fund and activate requires the last unfunded member')
      const share = account.feePayerMode === 'Host'
        ? (member.equals(account.creator) ? account.lockedActivationFee : 0n)
        : account.lockedActivationFee / BigInt(account.members.length) + (BigInt(index) < account.lockedActivationFee % BigInt(account.members.length) ? 1n : 0n)
      const expectedCount = account.fundedMemberCount + 1
      const expectedStake = addU64(account.fundedStakeTotal, account.memberTotalStake, 'expected stake total')
      const expectedFee = addU64(account.fundedFeeTotal, share, 'expected fee total')
      const fund = buildFundMemberInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, member, memberSource })
      const activated = {
        address: ritual.address,
        account: { ...account, status: 'Funding' as const, fundedMembersBitmap: memberMask, fundedMemberCount: account.members.length, fundedStakeTotal: expectedStake, fundedFeeTotal: expectedFee },
      } as RitualAccountContext
      const activate = buildActivateRitualInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual: activated })
      const expectation: PreparedExpectation = Object.freeze({ kind: 'bundle' as const, expectations: Object.freeze([
        { kind: 'funded' as const, member: keyText(member), expectedFundedMemberCount: expectedCount, expectedFundedStakeTotal: expectedStake, expectedFundedFeeTotal: expectedFee },
        { kind: 'activated' as const },
      ]) })
      return this.prepare('fund-and-activate', [fund, activate], member, ritual.address, account.stakeMint, expectation, { token: addU64(account.memberTotalStake, share, 'tokenOutflow'), stake: account.memberTotalStake, activation: share, escrow: account.lockedActivationFee }, [], null, null)
    } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Fund and Activate inputs') }
  }

  async prepareActivate(args: BuildActivateRitualArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const payer = copyKey(inputProperty(args, 'feePayer') as PublicKey); if (payer.equals(PublicKey.default)) fail('input', 'feePayer must not be default'); const instruction = buildActivateRitualInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual }); return this.prepare('activate', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'activated' }), { token: 0n, stake: 0n, activation: 0n, escrow: ritual.account.lockedActivationFee }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Activate Ritual inputs') }
  }
  async prepareCancel(args: BuildCancelUnactivatedArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const payer = copyKey(inputProperty(args, 'caller') as PublicKey); if (payer.equals(PublicKey.default)) fail('input', 'caller must not be default'); const raw = inputProperty(args, 'destinationTokenAccounts'); if (!Array.isArray(raw)) fail('input', 'invalid destinationTokenAccounts'); const destinations = Object.freeze((raw as unknown[]).map((item: unknown, index: number) => { try { return copyKey(item as PublicKey) } catch { return fail('input', `invalid destinationTokenAccounts[${index}]`) } })); const instruction = buildCancelUnactivatedInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, caller: payer, destinationTokenAccounts: destinations }); return this.prepare('cancel', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'cancelled' }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Cancel Ritual inputs') }
  }
  async prepareClose(args: BuildCloseTerminalVaultsArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const payer = copyKey(inputProperty(args, 'feePayer') as PublicKey); if (payer.equals(PublicKey.default)) fail('input', 'feePayer must not be default'); const instruction = buildCloseTerminalVaultsInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual }); return this.prepare('close', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'vaults-closed' }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_SIZE, ACCOUNT_SIZE], keyText(ritual.account.creator), null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Close Ritual inputs') }
  }

  async prepareInitializeEvent(args: BuildInitializeCurrentEventArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const index = inputProperty(args, 'eventIndex') as number; if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 255) fail('input', 'invalid eventIndex'); const eventIndex = index; const payer = copyKey(inputProperty(args, 'payer') as PublicKey); const instruction = buildInitializeCurrentEventInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, eventIndex: eventIndex, payer }); return this.prepare('initialize-event', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'event-initialized', eventIndex: eventIndex }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.RitualEvent], null, Object.freeze({ description: 'ritual event', count: 1 })) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Initialize Event inputs') }
  }
  async prepareClaim(args: BuildClaimCompletionArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const event = eventSnapshot(inputProperty(args, 'event')); const claimant = copyKey(inputProperty(args, 'claimant') as PublicKey); const instruction = buildClaimCompletionInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, event, claimant }); const index = event.account.eventIndex; const threshold = ritual.account.additionalConfirmationThreshold; return this.prepare('claim', instruction, claimant, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'claimed', claimant: keyText(claimant), eventIndex: index, expectedClaimStatus: threshold === 0 ? 'Confirmed' : 'Pending' }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.CompletionClaim], null, Object.freeze({ description: 'completion claim', count: 1 })) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Claim inputs') }
  }
  async prepareApprove(args: BuildApproveClaimArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const event = eventSnapshot(inputProperty(args, 'event')); const claim = claimSnapshot(inputProperty(args, 'claim')); const approver = copyKey(inputProperty(args, 'approver') as PublicKey); const instruction = buildApproveClaimInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, event, claim, approver }); const count = claim.account.approvalCount + 1; if (!Number.isSafeInteger(count) || count > 255) fail('input', 'expected approval count is outside u8'); return this.prepare('approve', instruction, approver, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'approved', claimant: keyText(claim.account.claimant), approver: keyText(approver), eventIndex: claim.account.eventIndex, expectedApprovalCount: count, expectedClaimStatus: count === claim.account.requiredAdditionalConfirmations ? 'Confirmed' : 'Pending' }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Approve inputs') }
  }
  async prepareQuestion(args: BuildQuestionClaimArgs): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const event = eventSnapshot(inputProperty(args, 'event')); const claim = claimSnapshot(inputProperty(args, 'claim')); const questioner = copyKey(inputProperty(args, 'questioner') as PublicKey); const instruction = buildQuestionClaimInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, event, claim, questioner }); return this.prepare('question', instruction, questioner, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'questioned', claimant: keyText(claim.account.claimant), questioner: keyText(questioner), eventIndex: claim.account.eventIndex }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Question inputs') }
  }
  async prepareFinalize(args: BuildFinalizeEventArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction> {
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const event = eventSnapshot(inputProperty(args, 'event')); const raw = inputProperty(args, 'destinationTokenAccounts'); if (!Array.isArray(raw)) fail('input', 'invalid destinationTokenAccounts'); const destinations = Object.freeze((raw as unknown[]).map((item, index) => { try { return copyKey(item as PublicKey) } catch { return fail('input', `invalid destinationTokenAccounts[${index}]`) } })); const payer = copyKey(inputProperty(args, 'feePayer') as PublicKey); if (payer.equals(PublicKey.default)) fail('input', 'feePayer must not be default'); const instruction = buildFinalizeEventInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, event, destinationTokenAccounts: destinations }); const pending = event.account.claimedMembersBitmap & ~(event.account.confirmedMembersBitmap | event.account.questionedMembersBitmap); const confirmedCount = popcount(event.account.confirmedMembersBitmap); const outcome = expectedFinalizeOutcome(ritual.account, event.account, pending, confirmedCount); const expectedEventStatus = outcome.status; const expectedVoidReason = outcome.voidReason; const nextIndex = event.account.eventIndex + 1; if (nextIndex > ritual.account.schedule.length) fail('input', 'expected event index is outside schedule'); const expectedRitualStatus = nextIndex === ritual.account.schedule.length ? 'Completed' : 'Active'; if (!Number.isSafeInteger(ritual.account.settledEventCount) || ritual.account.settledEventCount < 0 || ritual.account.settledEventCount >= 255) fail('input', 'expected settled event count is outside u8'); const settlement = u64(ritual.account.perEventAllocation * BigInt(ritual.account.members.length), 'escrowSettlementTransfer'); return this.prepare('finalize', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'finalized', eventIndex: event.account.eventIndex, expectedEventStatus, expectedVoidReason, expectedRitualStatus, expectedCurrentEventIndex: nextIndex, expectedSettledEventCount: ritual.account.settledEventCount + 1 }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n, settlement }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Finalize inputs') }
  }

  getTransactionForWallet(prepared: PreparedRitualAction): WalletRitualTransaction { const snapshot = this.internalFor(prepared); const transaction = new Transaction({ feePayer: copyKey(snapshot.feePayer), blockhash: snapshot.blockhash, lastValidBlockHeight: snapshot.lastValidBlockHeight }); transaction.add(...snapshot.instructions.map(copyInstruction), ...budgetInstructions(snapshot.kind)); if (!equalBytes(Uint8Array.from(transaction.serializeMessage()), snapshot.messageBytes)) fail('mutation', 'prepared message reconstruction changed'); return Object.freeze({ kind: snapshot.kind, transaction, blockhash: snapshot.blockhash, expectedMessageDigest: snapshot.messageDigest, submittedContextSlot: snapshot.blockhashContextSlot, lastValidBlockHeight: snapshot.lastValidBlockHeight, expectation: snapshot.expectation, ritualAddress: keyText(snapshot.ritualAddress) }) }
  assertWalletTransactionUnchanged(prepared: PreparedRitualAction, transaction: Transaction): void { const internal = this.internalFor(prepared); try { if (!(transaction instanceof Transaction)) fail('input', 'transaction provenance is invalid') } catch { fail('input', 'transaction provenance is invalid') }; try { if (!(transaction.feePayer instanceof PublicKey) || !transaction.feePayer.equals(internal.feePayer) || transaction.recentBlockhash !== internal.blockhash || transaction.lastValidBlockHeight !== internal.lastValidBlockHeight) fail('mutation', 'wallet transaction strategy was mutated') } catch { fail('mutation', 'wallet transaction strategy was mutated') }; let bytes = new Uint8Array(); try { bytes = Uint8Array.from(transaction.serializeMessage()) } catch { fail('mutation', 'wallet transaction message was mutated') }; if (!equalBytes(bytes, internal.messageBytes) || hex(sha256(bytes)) !== internal.messageDigest) fail('mutation', 'wallet transaction message was mutated') }
}
export const createRitualActionPreparer = (transport: RitualPreparationTransport, programId: PublicKey): RitualActionPreparer => new RitualActionPreparer(transport, programId)
export function createCurrentRitualActionPreparer(_transport: RitualPreparationTransport): never { void _transport; const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG; if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured'); return fail('deployment', 'Current Ritual action preparer is unavailable') }
