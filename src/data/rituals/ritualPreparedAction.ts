import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { ACCOUNT_DATA_LENGTHS, type RitualAccountView } from './accounts'
import { Message, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import type { BuildCreateRitualArgs, BuildFundMemberArgs, BuildActivateRitualArgs, BuildCancelUnactivatedArgs, RitualAccountContext } from './instructionsLifecycle'
import { buildCreateRitualInstruction, buildFundMemberInstruction, buildActivateRitualInstruction, buildCancelUnactivatedInstruction } from './instructionsLifecycle'
import type { BuildCloseTerminalVaultsArgs } from './instructionsEvents'
import { buildCloseTerminalVaultsInstruction } from './instructionsEvents'
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
type ActionKind = 'create' | 'fund' | 'activate' | 'cancel' | 'close'
type Expectation = Readonly<{
  kind: 'created' | 'funded' | 'activated' | 'cancelled' | 'vaults-closed'
  creator: PublicKeyText
  nonce: bigint
  member?: PublicKeyText
  expectedCount?: number
  stakeTotal?: bigint
  feeTotal?: bigint
}>
export type RitualPreparationSummary = Readonly<{
  clusterLabel: 'local/test-unconfigured'
  tokenMint: PublicKeyText
  tokenOutflow: bigint
  stakeOutflow: bigint
  activationFeeOutflow: bigint
  escrowActivationFeeTransfer: bigint
  estimatedNetworkFeeLamports: bigint
  estimatedRentLamports: bigint
  estimatedRentCreditLamports: bigint
  rentCreditRecipient: PublicKeyText | null
  totalEstimatedLamportOutflow: bigint
  creates: Readonly<{ description: 'ritual, stake vault, and fee vault'; count: 3 }> | null
  networkFeeIsEstimate: true
  rentCreditIsEstimate: true
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
  expectation: Expectation
}>
export type WalletRitualTransaction = Readonly<{
  kind: ActionKind
  transaction: Transaction
  blockhash: string
  expectedMessageDigest: string
  submittedContextSlot: number
  lastValidBlockHeight: number
  expectation: Expectation
  ritualAddress: PublicKeyText
}>
type Internal = {
  kind: ActionKind; programId: PublicKey; feePayer: PublicKey; ritualAddress: PublicKey; blockhash: string
  lastValidBlockHeight: number; blockhashContextSlot: number; instruction: TransactionInstruction
  messageBytes: Uint8Array; messageDigest: string; expectation: Expectation
}
const fail = (category: PreparationCategory, message: string): never => { throw new RitualPreparationError(category, message) }
const copyKey = (key: PublicKey): PublicKey => new PublicKey(Uint8Array.from(key.toBytes()))
const keyText = (key: PublicKey): PublicKeyText => key.toBase58() as PublicKeyText
const copyInstruction = (instruction: TransactionInstruction): TransactionInstruction => new TransactionInstruction({
  programId: copyKey(instruction.programId), keys: instruction.keys.map(meta => ({ pubkey: copyKey(meta.pubkey), isSigner: meta.isSigner, isWritable: meta.isWritable })), data: Buffer.from(instruction.data),
})
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i])
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
function ritualSnapshot(context: RitualAccountContext): { address: PublicKey; account: RitualAccountView } {
  try {
    const address = copyKey(context.address)
    const a = context.account
    const account = Object.freeze({
      ...a, creator: copyKey(a.creator), stakeMint: copyKey(a.stakeMint), members: Object.freeze(a.members.map(copyKey)),
      memberTotalStake: u64(a.memberTotalStake, 'memberTotalStake'), lockedActivationFee: u64(a.lockedActivationFee, 'lockedActivationFee'),
      fundedStakeTotal: u64(a.fundedStakeTotal, 'fundedStakeTotal'), fundedFeeTotal: u64(a.fundedFeeTotal, 'fundedFeeTotal'),
    }) as RitualAccountView
    return { address, account }
  } catch (error) { if (error instanceof RitualPreparationError) throw error; return fail('input', 'invalid ritual context') }
}

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
    expectation: Expectation, outflow: { token: bigint; stake: bigint; activation: bigint; escrow: bigint },
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
    const internal: Internal = { kind, programId: copyKey(this.programId), feePayer: payer, ritualAddress: ritual, blockhash: recentBlockhash, lastValidBlockHeight, blockhashContextSlot: slot, instruction: ix, messageBytes, messageDigest, expectation }
    const summary = Object.freeze({ clusterLabel: 'local/test-unconfigured' as const, tokenMint: keyText(tokenMint), tokenOutflow: u64(outflow.token, 'tokenOutflow'), stakeOutflow: u64(outflow.stake, 'stakeOutflow'), activationFeeOutflow: u64(outflow.activation, 'activationFeeOutflow'), escrowActivationFeeTransfer: u64(outflow.escrow, 'escrowActivationFeeTransfer'), estimatedNetworkFeeLamports: networkFee, estimatedRentLamports: rentDebit, estimatedRentCreditLamports: rentCredit, rentCreditRecipient, totalEstimatedLamportOutflow: total, creates, networkFeeIsEstimate: true as const, rentCreditIsEstimate: true as const })
    const action = Object.freeze({ kind, programId: keyText(this.programId), ritualAddress: keyText(ritual), feePayer: keyText(payer), blockhashContextSlot: slot, lastValidBlockHeight, messageDigest, summary, expectation })
    this.#snapshots.set(action, internal); return action
  }

  async prepareCreate(args: BuildCreateRitualArgs): Promise<PreparedRitualAction> {
    let instruction!: TransactionInstruction; try { instruction = buildCreateRitualInstruction(args) } catch { fail('input', 'invalid Create Ritual inputs') }
    const ix = copyInstruction(instruction); const feePayer = copyKey(ix.keys[2].pubkey); const ritual = copyKey(ix.keys[1].pubkey); const mint = copyKey(ix.keys[3].pubkey); const nonce = nonceFromInstruction(ix)
    return this.prepare('create', ix, feePayer, ritual, mint, Object.freeze({ kind: 'created', creator: keyText(feePayer), nonce }), { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_SIZE, ACCOUNT_SIZE], null, Object.freeze({ description: 'ritual, stake vault, and fee vault', count: 3 }))
  }

  async prepareFund(args: BuildFundMemberArgs): Promise<PreparedRitualAction> {
    const ritual = ritualSnapshot(args.ritual); const member = copyKey(args.member); const account = ritual.account; const index = account.members.findIndex(item => item.equals(member)); if (index < 0) fail('input', 'member is not in ritual')
    const share = account.feePayerMode === 'Host' ? (member.equals(account.creator) ? account.lockedActivationFee : 0n) : account.lockedActivationFee / BigInt(account.members.length) + (BigInt(index) < account.lockedActivationFee % BigInt(account.members.length) ? 1n : 0n)
    const expectedCount = account.fundedMemberCount + 1; const stakeTotal = addU64(account.fundedStakeTotal, account.memberTotalStake, 'expected stake total'); const feeTotal = addU64(account.fundedFeeTotal, share, 'expected fee total')
    let instruction!: TransactionInstruction; try { instruction = buildFundMemberInstruction({ ...args, ritual, member }) } catch { fail('input', 'invalid Fund Ritual inputs') }
    return this.prepare('fund', instruction, member, ritual.address, account.stakeMint, Object.freeze({ kind: 'funded', member: keyText(member), expectedCount, stakeTotal, feeTotal }) as Expectation, { token: account.memberTotalStake, stake: account.memberTotalStake, activation: share, escrow: 0n }, [], null, null)
  }
  async prepareActivate(args: BuildActivateRitualArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction> {
    const ritual = ritualSnapshot(args.ritual); const payer = copyKey(args.feePayer); if (payer.equals(PublicKey.default)) fail('input', 'feePayer must not be default')
    let instruction!: TransactionInstruction; try { instruction = buildActivateRitualInstruction({ programId: args.programId, ritual }) } catch { fail('input', 'invalid Activate Ritual inputs') }
    return this.prepare('activate', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'activated' }) as Expectation, { token: 0n, stake: 0n, activation: 0n, escrow: ritual.account.lockedActivationFee }, [], null, null)
  }
  async prepareCancel(args: BuildCancelUnactivatedArgs): Promise<PreparedRitualAction> {
    const ritual = ritualSnapshot(args.ritual); const payer = copyKey(args.caller); if (payer.equals(PublicKey.default)) fail('input', 'caller must not be default')
    let instruction!: TransactionInstruction; try { instruction = buildCancelUnactivatedInstruction({ ...args, ritual }) } catch { fail('input', 'invalid Cancel Ritual inputs') }
    return this.prepare('cancel', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'cancelled' }) as Expectation, { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [], null, null)
  }
  async prepareClose(args: BuildCloseTerminalVaultsArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction> {
    const ritual = ritualSnapshot(args.ritual); const payer = copyKey(args.feePayer); if (payer.equals(PublicKey.default)) fail('input', 'feePayer must not be default')
    let instruction!: TransactionInstruction; try { instruction = buildCloseTerminalVaultsInstruction({ programId: args.programId, ritual }) } catch { fail('input', 'invalid Close Ritual inputs') }
    return this.prepare('close', instruction, payer, ritual.address, ritual.account.stakeMint, Object.freeze({ kind: 'vaults-closed' }) as Expectation, { token: 0n, stake: 0n, activation: 0n, escrow: 0n }, [ACCOUNT_SIZE, ACCOUNT_SIZE], keyText(ritual.account.creator), null)
  }

  getTransactionForWallet(prepared: PreparedRitualAction): WalletRitualTransaction { const snapshot = this.internalFor(prepared); const transaction = new Transaction({ feePayer: copyKey(snapshot.feePayer), blockhash: snapshot.blockhash, lastValidBlockHeight: snapshot.lastValidBlockHeight }); transaction.add(copyInstruction(snapshot.instruction)); if (!equalBytes(Uint8Array.from(transaction.serializeMessage()), snapshot.messageBytes)) fail('mutation', 'prepared message reconstruction changed'); return Object.freeze({ kind: snapshot.kind, transaction, blockhash: snapshot.blockhash, expectedMessageDigest: snapshot.messageDigest, submittedContextSlot: snapshot.blockhashContextSlot, lastValidBlockHeight: snapshot.lastValidBlockHeight, expectation: snapshot.expectation, ritualAddress: keyText(snapshot.ritualAddress) }) }
  assertWalletTransactionUnchanged(prepared: PreparedRitualAction, transaction: Transaction): void { const internal = this.internalFor(prepared); try { if (!(transaction instanceof Transaction)) fail('input', 'transaction provenance is invalid') } catch { fail('input', 'transaction provenance is invalid') }; try { if (!(transaction.feePayer instanceof PublicKey) || !transaction.feePayer.equals(internal.feePayer) || transaction.recentBlockhash !== internal.blockhash || transaction.lastValidBlockHeight !== internal.lastValidBlockHeight) fail('mutation', 'wallet transaction strategy was mutated') } catch { fail('mutation', 'wallet transaction strategy was mutated') }; let bytes = new Uint8Array(); try { bytes = Uint8Array.from(transaction.serializeMessage()) } catch { fail('mutation', 'wallet transaction message was mutated') }; if (!equalBytes(bytes, internal.messageBytes) || hex(sha256(bytes)) !== internal.messageDigest) fail('mutation', 'wallet transaction message was mutated') }
}
export const createRitualActionPreparer = (transport: RitualPreparationTransport, programId: PublicKey): RitualActionPreparer => new RitualActionPreparer(transport, programId)
export function createCurrentRitualActionPreparer(_transport: RitualPreparationTransport): never { void _transport; const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG; if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured'); return fail('deployment', 'Current Ritual action preparer is unavailable') }
