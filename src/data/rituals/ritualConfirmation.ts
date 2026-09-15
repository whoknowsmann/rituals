import { PublicKey } from '@solana/web3.js'
import { RitualRpcError, RitualsRpcReader, type RitualBundleRead } from './ritualsRpc'
import { RITUALS_CURRENT_CONFIG } from './programIds'

export type RitualConfirmationErrorCategory = 'deployment' | 'input' | 'confirmation' | 'expired' | 'readback' | 'rpc'

export class RitualConfirmationError extends Error {
  readonly category: RitualConfirmationErrorCategory
  constructor(category: RitualConfirmationErrorCategory, message: string) {
    super(message)
    this.name = 'RitualConfirmationError'
    this.category = category
  }
}

export type RitualConfirmationTransport = Readonly<{
  confirmTransaction: (strategy: Readonly<{ signature: string; blockhash: string; lastValidBlockHeight: number }>, commitment: 'confirmed') => Promise<Readonly<{ context: Readonly<{ slot: number }>; value: Readonly<{ err: unknown | null }> }>>
}>

export type RitualActionExpectation =
  | Readonly<{ kind: 'created'; creator: PublicKey; nonce: bigint }>
  | Readonly<{ kind: 'funded'; member: PublicKey; expectedFundedMemberCount: number; expectedFundedStakeTotal: bigint; expectedFundedFeeTotal: bigint }>
  | Readonly<{ kind: 'activated' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'vaults-closed' }>
  | Readonly<{ kind: 'event-initialized'; eventIndex: number }>
  | Readonly<{ kind: 'claimed'; claimant: PublicKey; eventIndex: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'approved'; claimant: PublicKey; approver: PublicKey; eventIndex: number; expectedApprovalCount: number; expectedClaimStatus: 'Pending' | 'Confirmed' }>
  | Readonly<{ kind: 'questioned'; claimant: PublicKey; questioner: PublicKey; eventIndex: number }>
  | Readonly<{ kind: 'finalized'; eventIndex: number; expectedEventStatus: 'Settled' | 'Voided'; expectedVoidReason: 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims'; expectedRitualStatus: 'Active' | 'Completed'; expectedCurrentEventIndex: number; expectedSettledEventCount: number }>

export type SubmittedRitualAction = Readonly<{
  signature: string
  blockhash: string
  lastValidBlockHeight: number
  submittedContextSlot: number
  ritualAddress: PublicKey
  expectation: RitualActionExpectation
}>

export type ConfirmedRitualAction = Readonly<{
  signature: string
  confirmationSlot: number
  bundle: RitualBundleRead
  indexedBundle?: RitualBundleRead
  expectationKind: RitualActionExpectation['kind']
}>

const MAX_U64 = 0xffffffffffffffffn
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/
const isRecord = (value: unknown): value is Record<string, unknown> => {
  try { return value !== null && typeof value === 'object' && !Array.isArray(value) } catch { return false }
}
const safeSlot = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const safeU64 = (value: unknown): value is bigint => typeof value === 'bigint' && value >= 0n && value <= MAX_U64
const fail = (category: RitualConfirmationErrorCategory, message: string): never => { throw new RitualConfirmationError(category, message) }
function owns(object: object, property: string): boolean {
  try { return Object.hasOwn(object, property) } catch { return fail('confirmation', 'transaction confirmation response is malformed') }
}

function read<T>(object: object, property: string): T {
  try { return (object as Record<string, unknown>)[property] as T } catch { return fail('input', 'Ritual action could not be read') }
}
function readConfirmation<T>(object: object, property: string): T {
  try { return (object as Record<string, unknown>)[property] as T } catch { return fail('confirmation', 'transaction confirmation response is malformed') }
}
function cloneKey(value: unknown, name: string): PublicKey {
  try {
    if (!(value instanceof PublicKey) || value.equals(PublicKey.default)) fail('input', `${name} must be a non-default PublicKey`)
    return new PublicKey((value as PublicKey).toBytes())
  } catch (error) {
    if (error instanceof RitualConfirmationError) throw error
    return fail('input', `${name} must be a readable PublicKey`)
  }
}
function canonicalKey(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || !BASE58.test(value)) fail('input', `${name} is invalid`)
  try {
    const key = new PublicKey(value as string)
    if (key.toBase58() !== value || key.equals(PublicKey.default)) fail('input', `${name} is not canonical`)
    return value as string
  } catch { return fail('input', `${name} is invalid`) }
}
function canonicalSignature(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 90 || !BASE58.test(value)) fail('input', 'transaction signature is invalid')
  const signature = value as string
  const bytes: number[] = [0]
  for (const character of signature) {
    const digit = BASE58_ALPHABET.indexOf(character)
    if (digit < 0) fail('input', 'transaction signature is invalid')
    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      const product = bytes[index] * 58 + carry
      bytes[index] = product & 0xff
      carry = product >>> 8
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>>= 8 }
  }
  let leadingZeros = 0
  while (leadingZeros < signature.length && signature[leadingZeros] === '1') leadingZeros += 1
  const allZero = bytes.length === 1 && bytes[0] === 0
  const decodedLength = allZero ? leadingZeros : bytes.length + leadingZeros
  if (decodedLength !== 64) fail('input', 'transaction signature must decode to exactly 64 bytes')
  return signature
}
function snapshotExpectation(value: unknown): RitualActionExpectation {
  if (!isRecord(value)) fail('input', 'Ritual expectation is invalid')
  const kind = read<unknown>(value as object, 'kind')
  if (kind === 'activated' || kind === 'cancelled' || kind === 'vaults-closed') return Object.freeze({ kind })
  if (kind === 'created') {
    const creator = cloneKey(read<unknown>(value as object, 'creator'), 'creator'); const nonce = read<unknown>(value as object, 'nonce')
    if (!safeU64(nonce)) fail('input', 'nonce is invalid')
    return Object.freeze({ kind: 'created' as const, creator, nonce: nonce as bigint })
  }
  if (kind === 'funded') {
    const member = cloneKey(read<unknown>(value as object, 'member'), 'member')
    const count = read<unknown>(value as object, 'expectedFundedMemberCount'); const stake = read<unknown>(value as object, 'expectedFundedStakeTotal'); const fee = read<unknown>(value as object, 'expectedFundedFeeTotal')
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 6 || !safeU64(stake) || stake === 0n || !safeU64(fee)) fail('input', 'funding expectation is invalid')
    return Object.freeze({ kind: 'funded' as const, member, expectedFundedMemberCount: count as number, expectedFundedStakeTotal: stake as bigint, expectedFundedFeeTotal: fee as bigint })
  }
  if (kind === 'event-initialized') {
    const eventIndex = read<unknown>(value as object, 'eventIndex'); if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0) fail('input', 'eventIndex is invalid')
    return Object.freeze({ kind: 'event-initialized' as const, eventIndex: eventIndex as number })
  }
  if (kind === 'claimed') {
    const claimant = cloneKey(read<unknown>(value as object, 'claimant'), 'claimant'); const eventIndex = read<unknown>(value as object, 'eventIndex'); const expectedClaimStatus = read<unknown>(value as object, 'expectedClaimStatus')
    if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || (expectedClaimStatus !== 'Pending' && expectedClaimStatus !== 'Confirmed')) fail('input', 'claim expectation is invalid')
    return Object.freeze({ kind: 'claimed' as const, claimant, eventIndex: eventIndex as number, expectedClaimStatus: expectedClaimStatus as 'Pending' | 'Confirmed' })
  }
  if (kind === 'approved') {
    const claimant = cloneKey(read<unknown>(value as object, 'claimant'), 'claimant'); const approver = cloneKey(read<unknown>(value as object, 'approver'), 'approver'); const eventIndex = read<unknown>(value as object, 'eventIndex'); const count = read<unknown>(value as object, 'expectedApprovalCount'); const expectedClaimStatus = read<unknown>(value as object, 'expectedClaimStatus')
    if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 255 || (expectedClaimStatus !== 'Pending' && expectedClaimStatus !== 'Confirmed')) fail('input', 'approval expectation is invalid')
    return Object.freeze({ kind: 'approved' as const, claimant, approver, eventIndex: eventIndex as number, expectedApprovalCount: count as number, expectedClaimStatus: expectedClaimStatus as 'Pending' | 'Confirmed' })
  }
  if (kind === 'questioned') {
    const claimant = cloneKey(read<unknown>(value as object, 'claimant'), 'claimant'); const questioner = cloneKey(read<unknown>(value as object, 'questioner'), 'questioner'); const eventIndex = read<unknown>(value as object, 'eventIndex')
    if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0) fail('input', 'eventIndex is invalid')
    return Object.freeze({ kind: 'questioned' as const, claimant, questioner, eventIndex: eventIndex as number })
  }
  if (kind === 'finalized') {
    const eventIndex = read<unknown>(value as object, 'eventIndex'); const expectedEventStatus = read<unknown>(value as object, 'expectedEventStatus'); const expectedVoidReason = read<unknown>(value as object, 'expectedVoidReason'); const expectedRitualStatus = read<unknown>(value as object, 'expectedRitualStatus'); const current = read<unknown>(value as object, 'expectedCurrentEventIndex'); const settled = read<unknown>(value as object, 'expectedSettledEventCount')
    if (typeof eventIndex !== 'number' || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || (expectedEventStatus !== 'Settled' && expectedEventStatus !== 'Voided') || (expectedVoidReason !== 'None' && expectedVoidReason !== 'NoConfirmedMembers' && expectedVoidReason !== 'UnresolvedClaims') || (expectedRitualStatus !== 'Active' && expectedRitualStatus !== 'Completed') || typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0 || typeof settled !== 'number' || !Number.isSafeInteger(settled) || settled < 0) fail('input', 'finalization expectation is invalid')
    return Object.freeze({ kind: 'finalized' as const, eventIndex: eventIndex as number, expectedEventStatus: expectedEventStatus as 'Settled' | 'Voided', expectedVoidReason: expectedVoidReason as 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims', expectedRitualStatus: expectedRitualStatus as 'Active' | 'Completed', expectedCurrentEventIndex: current as number, expectedSettledEventCount: settled as number })
  }
  return fail('input', 'Ritual expectation kind is invalid')
}
function snapshotAction(value: unknown): Readonly<{ strategy: Readonly<{ signature: string; blockhash: string; lastValidBlockHeight: number }>; submittedContextSlot: number; ritualAddress: PublicKey; expectation: RitualActionExpectation }> {
  if (!isRecord(value)) fail('input', 'Submitted Ritual action is invalid')
  const signature = read<unknown>(value as object, 'signature'); const blockhash = read<unknown>(value as object, 'blockhash'); const height = read<unknown>(value as object, 'lastValidBlockHeight'); const submitted = read<unknown>(value as object, 'submittedContextSlot')
  const canonicalSignatureValue = canonicalSignature(signature)
  const canonicalBlockhash = canonicalKey(blockhash, 'blockhash')
  if (!safeSlot(height) || !safeSlot(submitted)) fail('input', 'transaction heights are invalid')
  const ritualAddress = cloneKey(read<unknown>(value as object, 'ritualAddress'), 'ritualAddress')
  const expectation = snapshotExpectation(read<unknown>(value as object, 'expectation'))
  return Object.freeze({ strategy: Object.freeze({ signature: canonicalSignatureValue, blockhash: canonicalBlockhash, lastValidBlockHeight: height as number }), submittedContextSlot: submitted as number, ritualAddress, expectation })
}
function expired(error: unknown): boolean {
  if (!isRecord(error)) return false
  const name = (() => { try { return error.name } catch { return undefined } })()
  return name === 'TransactionExpiredBlockheightExceededError' || name === 'TransactionExpiredTimeoutError' || name === 'TransactionExpiredNonceInvalidError'
}
function mismatch(): never { return fail('readback', 'Ritual state did not match the submitted action') }

function verifyExpectation(bundle: RitualBundleRead, expectation: RitualActionExpectation): void {
  const account = bundle.ritual.account
  if (expectation.kind === 'created') {
    if (account.status !== 'Funding' || !account.creator.equals(expectation.creator) || account.nonce !== expectation.nonce) mismatch()
  } else if (expectation.kind === 'funded') {
    const index = account.members.findIndex(member => member.equals(expectation.member))
    if (account.status !== 'Funding' || index < 0 || (account.fundedMembersBitmap & (1 << index)) === 0 || account.fundedMemberCount !== expectation.expectedFundedMemberCount || account.fundedStakeTotal !== expectation.expectedFundedStakeTotal || account.fundedFeeTotal !== expectation.expectedFundedFeeTotal) mismatch()
  } else if (expectation.kind === 'activated') {
    if (account.status !== 'Active' || account.activatedAt <= 0n || account.fundedMemberCount !== account.members.length || account.fundedMembersBitmap !== (1 << account.members.length) - 1) mismatch()
  } else if (expectation.kind === 'cancelled') {
    if (account.status !== 'Cancelled' || account.fundedStakeTotal !== 0n || account.fundedFeeTotal !== 0n) mismatch()
  } else if (expectation.kind === 'event-initialized') {
    if (!bundle.event || bundle.event.account.eventIndex !== expectation.eventIndex || !['Scheduled', 'Claiming', 'Resolving'].includes(bundle.event.account.status)) mismatch()
  } else if (expectation.kind === 'claimed' || expectation.kind === 'approved' || expectation.kind === 'questioned') {
    if (!bundle.event || bundle.event.account.eventIndex !== expectation.eventIndex) mismatch()
    const claimant = expectation.claimant
    const index = account.members.findIndex(member => member.equals(claimant))
    const claim = index < 0 ? undefined : bundle.claims[index]?.account
    if (index < 0 || !claim || !claim.claimant.equals(claimant) || (bundle.event.account.claimedMembersBitmap & (1 << index)) === 0) mismatch()
    if (expectation.kind === 'claimed') {
      if (claim.status === 'Pending') { if (expectation.expectedClaimStatus === 'Confirmed') mismatch() } else if (claim.status !== 'Confirmed' && claim.status !== 'Questioned') mismatch()
    } else if (expectation.kind === 'approved') {
      const approverIndex = account.members.findIndex(member => member.equals(expectation.approver))
      if (approverIndex < 0 || (account.fundedMembersBitmap & (1 << approverIndex)) === 0 || (claim.approvalsBitmap & (1 << approverIndex)) === 0 || claim.approvalCount < expectation.expectedApprovalCount) mismatch()
      if (expectation.expectedClaimStatus === 'Confirmed' && claim.status !== 'Confirmed') mismatch()
      if (expectation.expectedClaimStatus === 'Pending' && claim.status !== 'Pending' && claim.status !== 'Confirmed' && claim.status !== 'Questioned') mismatch()
    } else if (claim.status !== 'Questioned' || (bundle.event.account.questionedMembersBitmap & (1 << index)) === 0) mismatch()
  } else if (expectation.kind === 'finalized') {
    if (!bundle.event || bundle.event.account.eventIndex !== expectation.eventIndex || bundle.event.account.status !== expectation.expectedEventStatus || bundle.event.account.voidReason !== expectation.expectedVoidReason || account.status !== expectation.expectedRitualStatus || account.currentEventIndex !== expectation.expectedCurrentEventIndex || account.settledEventCount !== expectation.expectedSettledEventCount) mismatch()
  } else if ((account.status !== 'Completed' && account.status !== 'Cancelled') || !account.vaultsClosed) mismatch()
}

export class RitualConfirmationVerifier {
  readonly #reader: RitualsRpcReader
  readonly #confirm: RitualConfirmationTransport['confirmTransaction']
  constructor(reader: RitualsRpcReader, transport: RitualConfirmationTransport) {
    try { if (!(reader instanceof RitualsRpcReader)) fail('input', 'Ritual confirmation reader is invalid') } catch (error) {
      if (error instanceof RitualConfirmationError) throw error
      fail('input', 'Ritual confirmation reader is invalid')
    }
    if (transport === null || typeof transport !== 'object' || Array.isArray(transport)) fail('input', 'Ritual confirmation transport is invalid')
    let method: unknown
    try { method = transport.confirmTransaction } catch { fail('input', 'Ritual confirmation transport is invalid') }
    if (typeof method !== 'function') fail('input', 'Ritual confirmation transport is invalid')
    this.#reader = reader
    this.#confirm = (method as RitualConfirmationTransport['confirmTransaction']).bind(transport)
  }
  async confirmAndReadRitual(action: unknown): Promise<ConfirmedRitualAction> {
    const snapshot = snapshotAction(action)
    let confirmation: unknown
    try { confirmation = await this.#confirm(snapshot.strategy, 'confirmed') } catch (error) {
      if (expired(error)) fail('expired', 'transaction expired before confirmation')
      fail('confirmation', 'transaction confirmation failed')
    }
    if (!isRecord(confirmation)) fail('confirmation', 'transaction confirmation response is malformed')
    const context = readConfirmation<unknown>(confirmation as object, 'context'); const value = readConfirmation<unknown>(confirmation as object, 'value')
    if (!isRecord(context)) fail('confirmation', 'transaction confirmation context is malformed')
    const rawConfirmationSlot = readConfirmation<unknown>(context as object, 'slot')
    if (!safeSlot(rawConfirmationSlot)) fail('confirmation', 'transaction confirmation context is malformed')
    const confirmationSlot = rawConfirmationSlot as number
    if (confirmationSlot < snapshot.submittedContextSlot) fail('readback', 'transaction confirmation is stale')
    if (!isRecord(value) || !owns(value, 'err')) fail('confirmation', 'transaction confirmation value is malformed')
    if (readConfirmation<unknown>(value as object, 'err') !== null) fail('confirmation', 'transaction failed')
    let bundle!: RitualBundleRead
    try {
      bundle = ['event-initialized', 'claimed', 'approved', 'questioned', 'finalized'].includes(snapshot.expectation.kind)
        ? await this.#reader.getEventBundle(snapshot.ritualAddress, (snapshot.expectation as { eventIndex: number }).eventIndex, { minContextSlot: confirmationSlot })
        : await this.#reader.getRitualBundle(snapshot.ritualAddress, { minContextSlot: confirmationSlot })
    } catch (error) {
      if (error instanceof RitualRpcError) fail(error.category === 'rpc' ? 'rpc' : 'readback', 'Ritual authoritative readback failed')
      fail('readback', 'Ritual authoritative readback failed')
    }
    if (!bundle || !safeSlot(bundle.slot) || bundle.slot < confirmationSlot) fail('readback', 'Ritual authoritative readback is stale')
    verifyExpectation(bundle, snapshot.expectation)
    return Object.freeze({ signature: snapshot.strategy.signature, confirmationSlot, bundle, ...( ['event-initialized', 'claimed', 'approved', 'questioned', 'finalized'].includes(snapshot.expectation.kind) ? { indexedBundle: bundle } : {}), expectationKind: snapshot.expectation.kind })
  }
}

export function confirmAndReadRitual(reader: RitualsRpcReader, transport: RitualConfirmationTransport, action: SubmittedRitualAction): Promise<ConfirmedRitualAction> {
  return new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action)
}
/** Explicit-program local/test verifier factory; this does not authorize deployment or signing. */
export const createRitualConfirmationVerifier = (reader: RitualsRpcReader, transport: RitualConfirmationTransport): RitualConfirmationVerifier => new RitualConfirmationVerifier(reader, transport)
/** Current production deployment is deliberately unavailable; fails before inspecting dependencies. */
export function createCurrentRitualConfirmationVerifier(_reader: RitualsRpcReader, _transport: RitualConfirmationTransport): never {
  void _reader
  void _transport
  const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG
  if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured')
  return fail('deployment', 'Current Ritual confirmation verifier is unavailable')
}
