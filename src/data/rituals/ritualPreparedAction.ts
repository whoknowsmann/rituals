import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { ACCOUNT_DATA_LENGTHS, type RitualAccountView } from './accounts'
import { Message, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import type { BuildCreateRitualArgs, BuildFundMemberArgs, BuildActivateRitualArgs, BuildCancelUnactivatedArgs, RitualAccountContext } from './instructionsLifecycle'
import { buildCreateRitualInstruction, buildFundMemberInstruction, buildActivateRitualInstruction, buildCancelUnactivatedInstruction } from './instructionsLifecycle'
import type { BuildCloseTerminalVaultsArgs, BuildInitializeCurrentEventArgs, BuildClaimCompletionArgs, BuildApproveClaimArgs, BuildQuestionClaimArgs, BuildFinalizeEventArgs, RitualEventAccountContext, CompletionClaimAccountContext } from './instructionsEvents'
import { buildCloseTerminalVaultsInstruction, buildInitializeCurrentEventInstruction, buildClaimCompletionInstruction, buildApproveClaimInstruction, buildQuestionClaimInstruction, buildFinalizeEventInstruction } from './instructionsEvents'
import { RITUALS_CURRENT_CONFIG } from './programIds'
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
type ActionKind = 'create' | 'fund' | 'activate' | 'cancel' | 'close' | 'initialize-event' | 'claim' | 'approve' | 'question' | 'finalize'
export type PreparedExpectation =
  | Readonly<{ kind: 'created'; creator: PublicKeyText; nonce: bigint }>
  | Readonly<{ kind: 'funded'; member: PublicKeyText; expectedFundedMemberCount: number; expectedFundedStakeTotal: bigint; expectedFundedFeeTotal: bigint }>
  | Readonly<{ kind: 'activated' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'vaults-closed' }>
  | Readonly<{ kind: 'event-initialized'; eventIndex: number }>
  | Readonly<{ kind: 'claimed'; claimant: PublicKeyText; eventIndex: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'approved'; claimant: PublicKeyText; approver: PublicKeyText; eventIndex: number; expectedApprovalCount: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'questioned'; claimant: PublicKeyText; questioner: PublicKeyText; eventIndex: number }>
  | Readonly<{ kind: 'finalized'; eventIndex: number; expectedEventStatus: 'Settled' | 'Voided'; expectedVoidReason: 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims'; expectedRitualStatus: 'Active' | 'Completed'; expectedCurrentEventIndex: number; expectedSettledEventCount: number }>
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
  creates: Readonly<{ description: 'ritual, stake vault, and fee vault'; count: 3 } | { description: 'ritual event'; count: 1 } | { description: 'completion claim'; count: 1 }> | null
  networkFeeIsEstimate: true
  rentCreditIsEstimate: boolean
}>
export type PreparedRitualAction = Readonly<{
  kind: ActionKind
  programId: PublicKeyText
  ritualAddress: PublicKeyText
  feePayer: PublicKeyText
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
  lastValidBlockHeight: number; blockhashContextSlot: number; instruction: TransactionInstruction
  messageBytes: Uint8Array; messageDigest: string; expectation: PreparedExpectation
}
const fail = (category: PreparationCategory, message: string): never => { throw new RitualPreparationError(category, message) }
const copyKey = (key: PublicKey): PublicKey => new PublicKey(Uint8Array.from(key.toBytes()))
const keyText = (key: PublicKey): PublicKeyText => key.toBase58() as PublicKeyText
const copyInstruction = (instruction: TransactionInstruction): TransactionInstruction => new TransactionInstruction({
  programId: copyKey(instruction.programId), keys: instruction.keys.map(meta => ({ pubkey: copyKey(meta.pubkey), isSigner: meta.isSigner, isWritable: meta.isWritable })), data: Buffer.from(instruction.data),
})
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i])
const popcount = (value: number): number => { let count = 0; for (let bits = value; bits !== 0; bits &= bits - 1) count += 1; return count }
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
      memberTotalStake: readU64(read('memberTotalStake'), 'memberTotalStake'), perEventAllocation: readBigint(read('perEventAllocation'), 'perEventAllocation'), schedule, additionalConfirmationThreshold: read('additionalConfirmationThreshold'), feePayerMode: read('feePayerMode'), lockedActivationFee: readU64(read('lockedActivationFee'), 'lockedActivationFee'), stakeDecimals: read('stakeDecimals'), lockedFeeRecipient: copyKey(read('lockedFeeRecipient') as PublicKey), stakeVault: copyKey(read('stakeVault') as PublicKey), feeVault: copyKey(read('feeVault') as PublicKey), stakeVaultBump: read('stakeVaultBump'), feeVaultBump: read('feeVaultBump'), fundedMembersBitmap: read('fundedMembersBitmap'), fundedMemberCount: read('fundedMemberCount'), fundedStakeTotal: readU64(read('fundedStakeTotal'), 'fundedStakeTotal'), fundedFeeTotal: readU64(read('fundedFeeTotal'), 'fundedFeeTotal'), status: read('status'), currentEventIndex: read('currentEventIndex'), settledEventCount: read('settledEventCount'), createdAt: readBigint(read('createdAt'), 'createdAt'), activatedAt: readBigint(read('activatedAt'), 'activatedAt'), cancelledAt: readBigint(read('cancelledAt'), 'cancelledAt'), completedAt: readBigint(read('completedAt'), 'completedAt'), vaultsClosed: read('vaultsClosed'), bump: read('bump'),
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
    kind: ActionKind, instruction: TransactionInstruction, feePayer: PublicKey, ritualAddress: PublicKey, tokenMint: PublicKey,
    expectation: PreparedExpectation, outflow: { token: bigint; stake: bigint; activation: bigint; escrow: bigint; settlement?: bigint },
    rentLengths: readonly number[], rentCreditRecipient: PublicKeyText | null, creates: RitualPreparationSummary['creates'],
  ): Promise<PreparedRitualAction> {
    if (!instruction.programId.equals(this.programId)) fail('input', 'programId does not match preparer')
    const ix = copyInstruction(instruction); const payer = copyKey(feePayer); const ritual = copyKey(ritualAddress)
    const latest = await callTransport(this.latest, [{ commitment: 'confirmed' }], 'rpc', 'latest blockhash request failed')
    const latestObject = object(latest, 'latest blockhash response'); const context = object(property(latestObject, 'context'), 'blockhash context'); const value = object(property(latestObject, 'value'), 'blockhash value')
    const slot = safeSlot(property(context, 'slot'), 'blockhash context slot'); const recentBlockhash = blockhash(property(value, 'blockhash')); const lastValidBlockHeight = safeSlot(property(value, 'lastValidBlockHeight'), 'last valid block height')
    const transaction = new Transaction({ feePayer: payer, blockhash: recentBlockhash, lastValidBlockHeight }); transaction.add(copyInstruction(ix)); const message = transaction.compileMessage(); const before = Uint8Array.from(message.serialize())
    const feeResponse = await callTransport(this.fee, [message, { commitment: 'confirmed', minContextSlot: slot }], 'fee', 'fee request failed')
    try { if (!equalBytes(Uint8Array.from(message.serialize()), before)) fail('fee', 'fee transport mutated message') } catch (error) { if (error instanceof RitualPreparationError) throw error; fail('fee', 'fee transport mutated message') }
    const feeObject = object(feeResponse, 'fee response', 'fee'); const feeContext = object(property(feeObject, 'context', 'fee'), 'fee context', 'fee'); const feeSlot = safeSlot(property(feeContext, 'slot', 'fee'), 'fee context slot', 'fee'); if (feeSlot < slot) fail('fee', 'fee context is stale'); const feeValue = property(feeObject, 'value', 'fee'); if (feeValue === null) fail('fee', 'fee is unavailable'); const networkFee = BigInt(amount(feeValue, 'fee'))
    let rentDebit = 0n; let rentCredit = 0n; for (const length of rentLengths) { const result = BigInt(amount(await callTransport(this.rent, [length, 'confirmed'], 'rent', 'rent request failed'), 'rent')); if (rentCreditRecipient === null) rentDebit += result; else rentCredit += result }
    const messageBytes = Uint8Array.from(transaction.serializeMessage()); const messageDigest = hex(sha256(messageBytes)); const total = networkFee + rentDebit
    const stakeOutflow = u64(outflow.stake, 'stakeOutflow'); const activationFeeOutflow = u64(outflow.activation, 'activationFeeOutflow'); const tokenOutflow = u64(outflow.token, 'tokenOutflow'); if (tokenOutflow !== addU64(stakeOutflow, activationFeeOutflow, 'tokenOutflow')) fail('input', 'tokenOutflow does not equal stakeOutflow plus activationFeeOutflow')
    const internal: Internal = { kind, programId: copyKey(this.programId), feePayer: payer, ritualAddress: ritual, blockhash: recentBlockhash, lastValidBlockHeight, blockhashContextSlot: slot, instruction: ix, messageBytes, messageDigest, expectation }
    const summary = Object.freeze({ clusterLabel: 'local/test-unconfigured' as const, tokenMint: keyText(tokenMint), tokenOutflow, stakeOutflow, activationFeeOutflow, escrowActivationFeeTransfer: u64(outflow.escrow, 'escrowActivationFeeTransfer'), escrowSettlementTransfer: u64(outflow.settlement ?? 0n, 'escrowSettlementTransfer'), protocolForfeitureShare: 0n, estimatedNetworkFeeLamports: networkFee, estimatedRentLamports: rentDebit, estimatedRentCreditLamports: rentCredit, rentCreditRecipient, totalEstimatedLamportOutflow: total, creates, networkFeeIsEstimate: true as const, rentCreditIsEstimate: rentCreditRecipient !== null })
    const action = Object.freeze({ kind, programId: keyText(this.programId), ritualAddress: keyText(ritual), feePayer: keyText(payer), blockhashContextSlot: slot, lastValidBlockHeight, messageDigest, summary, expectation })
    this.#snapshots.set(action, internal); return action
  }

  async prepareCreate(args: BuildCreateRitualArgs): Promise<PreparedRitualAction> {
    let instruction!: TransactionInstruction; try { instruction = buildCreateRitualInstruction(args) } catch { fail('input', 'invalid Create Ritual inputs') }
    const ix = copyInstruction(instruction); const feePayer = copyKey(ix.keys[2].pubkey); const ritual = copyKey(ix.keys[1].pubkey); const mint = copyKey(ix.keys[3].pubkey); const nonce = nonceFromInstruction(ix)
    return this.prepare('create', ix, feePayer, ritual, mint, Object.freeze({ kind: 'created', creator: keyText(feePayer), nonce }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'ritual, stake vault, and fee vault', count: 3 }))
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
    try { const ritual = ritualSnapshot(inputProperty(args, 'ritual')); const event = eventSnapshot(inputProperty(args, 'event')); const raw = inputProperty(args, 'destinationTokenAccounts'); if (!Array.isArray(raw)) fail('input', 'invalid destinationTokenAccounts'); const destinations = Object.freeze((raw as unknown[]).map((item, index) => { try { return copyKey(item as PublicKey) } catch { return fail('input', `invalid destinationTokenAccounts[${index}]`) } })); const payer = copyKey(inputProperty(args, 'feePayer') as PublicKey); const instruction = buildFinalizeEventInstruction({ programId: inputProperty(args, 'programId') as PublicKey, ritual, event, destinationTokenAccounts: destinations }); const pending = event.account.claimedMembersBitmap & ~(event.account.confirmedMembersBitmap | event.account.questionedMembersBitmap); const confirmedCount = popcount(event.account.confirmedMembersBitmap); const voided = pending !== 0 || event.account.questionedMembersBitmap !== 0 || confirmedCount === 0; const expectedEventStatus = voided ? 'Voided' : 'Settled'; const expectedVoidReason = voided ? (pending !== 0 || event.account.questionedMembersBitmap !== 0 ? 'UnresolvedClaims' : 'NoConfirmedMembers') : 'None'; const nextIndex = event.account.eventIndex + 1; if (nextIndex > ritual.account.schedule.length) fail('input', 'expected event index is outside schedule'); const expectedRitualStatus = nextIndex === ritual.account.schedule.length ? 'Completed' : 'Active'; const settlement = u64(ritual.account.perEventAllocation * BigInt(ritual.account.members.length), 'escrowSettlementTransfer'); return this.prepare('finalize', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'finalized', eventIndex: event.account.eventIndex, expectedEventStatus, expectedVoidReason, expectedRitualStatus, expectedCurrentEventIndex: nextIndex, expectedSettledEventCount: ritual.account.settledEventCount + 1 }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n, settlement }, [], null, null) } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid Finalize inputs') }
  }

  getTransactionForWallet(prepared: PreparedRitualAction): WalletRitualTransaction { const snapshot = this.internalFor(prepared); const transaction = new Transaction({ feePayer: copyKey(snapshot.feePayer), blockhash: snapshot.blockhash, lastValidBlockHeight: snapshot.lastValidBlockHeight }); transaction.add(copyInstruction(snapshot.instruction)); if (!equalBytes(Uint8Array.from(transaction.serializeMessage()), snapshot.messageBytes)) fail('mutation', 'prepared message reconstruction changed'); return Object.freeze({ kind: snapshot.kind, transaction, blockhash: snapshot.blockhash, expectedMessageDigest: snapshot.messageDigest, submittedContextSlot: snapshot.blockhashContextSlot, lastValidBlockHeight: snapshot.lastValidBlockHeight, expectation: snapshot.expectation, ritualAddress: keyText(snapshot.ritualAddress) }) }
  assertWalletTransactionUnchanged(prepared: PreparedRitualAction, transaction: Transaction): void { const internal = this.internalFor(prepared); try { if (!(transaction instanceof Transaction)) fail('input', 'transaction provenance is invalid') } catch { fail('input', 'transaction provenance is invalid') }; try { if (!(transaction.feePayer instanceof PublicKey) || !transaction.feePayer.equals(internal.feePayer) || transaction.recentBlockhash !== internal.blockhash || transaction.lastValidBlockHeight !== internal.lastValidBlockHeight) fail('mutation', 'wallet transaction strategy was mutated') } catch { fail('mutation', 'wallet transaction strategy was mutated') }; let bytes = new Uint8Array(); try { bytes = Uint8Array.from(transaction.serializeMessage()) } catch { fail('mutation', 'wallet transaction message was mutated') }; if (!equalBytes(bytes, internal.messageBytes) || hex(sha256(bytes)) !== internal.messageDigest) fail('mutation', 'wallet transaction message was mutated') }
}
export const createRitualActionPreparer = (transport: RitualPreparationTransport, programId: PublicKey): RitualActionPreparer => new RitualActionPreparer(transport, programId)
export function createCurrentRitualActionPreparer(_transport: RitualPreparationTransport): never { void _transport; const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG; if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured'); return fail('deployment', 'Current Ritual action preparer is unavailable') }
