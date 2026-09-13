import { PublicKey } from '@solana/web3.js'

export type AccountEnvelope = unknown
export type ProtocolConfigAccountView = Readonly<{ schemaVersion: number; authority: PublicKey; allowedStakeMint: PublicKey; feeRecipient: PublicKey; feeBasisPoints: number; minimumFee: bigint; maximumFee: bigint; maximumMemberStake: bigint; maxMembers: number; maxEvents: number; paused: boolean; bump: number }>
export type EventWindowView = Readonly<{ opens: bigint; deadline: bigint; resolution: bigint }>
export type RitualEventAccountView = Readonly<{ schemaVersion: number; ritual: PublicKey; eventIndex: number; window: EventWindowView; memberCount: number; status: 'Scheduled' | 'Claiming' | 'Resolving' | 'Settled' | 'Voided'; claimedMembersBitmap: number; confirmedMembersBitmap: number; questionedMembersBitmap: number; initializedAt: bigint; resolvedAt: bigint; settlementVersion: number; voidReason: 'None' | 'NoConfirmedMembers' | 'UnresolvedClaims'; eventPool: bigint; forfeitedTotal: bigint; payoutTotal: bigint; refundedTotal: bigint; confirmedMemberCount: number; remainderUnits: bigint; remainingStakeTotalAfter: bigint; bump: number }>
export type CompletionClaimAccountView = Readonly<{ schemaVersion: number; ritual: PublicKey; event: PublicKey; eventIndex: number; claimant: PublicKey; memberIndex: number; claimVersion: number; status: 'Pending' | 'Confirmed' | 'Questioned'; requiredAdditionalConfirmations: number; approvalsBitmap: number; approvalCount: number; claimedAt: bigint; bump: number }>
export type RitualAccountView = Readonly<{ schemaVersion: number; protocolConfig: PublicKey; creator: PublicKey; nonce: bigint; ruleDigest: Uint8Array; stakeMint: PublicKey; members: readonly PublicKey[]; memberTotalStake: bigint; perEventAllocation: bigint; schedule: readonly EventWindowView[]; additionalConfirmationThreshold: number; feePayerMode: 'Host' | 'Split'; lockedActivationFee: bigint; stakeDecimals: number; lockedFeeRecipient: PublicKey; stakeVault: PublicKey; feeVault: PublicKey; stakeVaultBump: number; feeVaultBump: number; fundedMembersBitmap: number; fundedMemberCount: number; fundedStakeTotal: bigint; fundedFeeTotal: bigint; status: 'Funding' | 'Active' | 'Completed' | 'Cancelled'; currentEventIndex: number; settledEventCount: number; createdAt: bigint; activatedAt: bigint; cancelledAt: bigint; completedAt: bigint; vaultsClosed: boolean; bump: number }>

export const ACCOUNT_DISCRIMINATORS = {
  ProtocolConfig: Uint8Array.from([207, 91, 250, 28, 152, 179, 215, 209]),
  Ritual: Uint8Array.from([59, 144, 213, 109, 22, 234, 192, 75]),
  RitualEvent: Uint8Array.from([20, 35, 155, 231, 156, 20, 94, 160]),
  CompletionClaim: Uint8Array.from([233, 130, 153, 175, 66, 45, 112, 112]),
} as const

export const ACCOUNT_DATA_LENGTHS = {
  ProtocolConfig: 135,
  Ritual: 909,
  RitualEvent: 139,
  CompletionClaim: 121,
} as const

const CURRENT_CLAIM_VERSION = 0

export class RitualAccountDecodeError extends Error {
  readonly category: string
  constructor(category: string, message: string) {
    super(`${category}: ${message}`)
    this.name = 'RitualAccountDecodeError'
    this.category = category
  }
}

const MAX_U64 = 0xffffffffffffffffn
const MIN_I64 = -0x8000000000000000n
const MAX_I64 = 0x7fffffffffffffffn
const zero = PublicKey.default

class Reader {
  offset = 0
  constructor(readonly bytes: Uint8Array) {}
  need(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || this.offset > this.bytes.length - size) throw new RitualAccountDecodeError('truncated', 'account data ends unexpectedly')
  }
  u8(): number { this.need(1); return this.bytes[this.offset++] }
  bool(): boolean { const value = this.u8(); if (value > 1) throw new RitualAccountDecodeError('invalid-bool', 'boolean is not 0 or 1'); return value === 1 }
  u16(): number { this.need(2); const value = this.bytes[this.offset] | (this.bytes[this.offset + 1] << 8); this.offset += 2; return value }
  u32(): number { this.need(4); const value = this.bytes[this.offset] | (this.bytes[this.offset + 1] << 8) | (this.bytes[this.offset + 2] << 16) | (this.bytes[this.offset + 3] << 24); this.offset += 4; return value >>> 0 }
  u64(): bigint { this.need(8); let value = 0n; for (let i = 0; i < 8; i += 1) value |= BigInt(this.bytes[this.offset + i]) << BigInt(i * 8); this.offset += 8; return value }
  i64(): bigint { const value = this.u64(); return value > MAX_I64 ? value - (MAX_U64 + 1n) : value }
  pubkey(): PublicKey { this.need(32); const value = new PublicKey(this.bytes.slice(this.offset, this.offset + 32)); this.offset += 32; return value }
  bytesFixed(size: number): Uint8Array { this.need(size); const value = this.bytes.slice(this.offset, this.offset + size); this.offset += size; return value }
  vecLength(max: number): number { const value = this.u32(); if (value > max) throw new RitualAccountDecodeError('invalid-vector', `length ${value} exceeds ${max}`); return value }
  enum<T>(values: readonly T[]): T { const value = this.u8(); if (value >= values.length) throw new RitualAccountDecodeError('invalid-enum', `variant ${value} is not recognized`); return values[value] }
  finish(): void { while (this.offset < this.bytes.length) if (this.bytes[this.offset++] !== 0) throw new RitualAccountDecodeError('nonzero-padding', 'trailing allocation bytes must be zero') }
}

function popcount(value: number): number { let count = 0; for (let bits = value; bits !== 0; bits &= bits - 1) count += 1; return count }
function maskFor(count: number): number { return (1 << count) - 1 }
function ensureU64(value: bigint, name: string): void { if (value < 0n || value > MAX_U64) throw new RitualAccountDecodeError('overflow', `${name} is outside u64`) }
function ensureWindow(window: EventWindowView): void {
  if (window.opens < 0n || !(window.opens < window.deadline && window.deadline < window.resolution)) throw new RitualAccountDecodeError('invariant', 'event window ordering is invalid')
}
function readWindow(reader: Reader): EventWindowView { const value = Object.freeze({ opens: reader.i64(), deadline: reader.i64(), resolution: reader.i64() }); ensureWindow(value); return value }

function begin(input: AccountEnvelope, expectedProgramId: PublicKey, account: keyof typeof ACCOUNT_DISCRIMINATORS): Reader {
  try {
    if (!(expectedProgramId instanceof PublicKey)) throw new RitualAccountDecodeError('input', 'expected program id must be a PublicKey')
    if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new RitualAccountDecodeError('input', 'envelope must be an object')
    let owner: unknown
    try { owner = (input as { readonly owner: unknown }).owner } catch { throw new RitualAccountDecodeError('owner', 'account owner could not be read') }
    if (!(owner instanceof PublicKey) || !owner.equals(expectedProgramId)) throw new RitualAccountDecodeError('owner', 'account owner does not match program')
    let data: unknown
    try { data = (input as { readonly data: unknown }).data } catch { throw new RitualAccountDecodeError('input', 'account data could not be read') }
    if (!(data instanceof Uint8Array)) throw new RitualAccountDecodeError('input', 'account data must be Uint8Array')
    if (data.length !== ACCOUNT_DATA_LENGTHS[account]) throw new RitualAccountDecodeError('size', `expected ${ACCOUNT_DATA_LENGTHS[account]} bytes`)
    const reader = new Reader(data)
    const discriminator = reader.bytesFixed(8)
    const expected = ACCOUNT_DISCRIMINATORS[account]
    if (!expected.every((byte, index) => discriminator[index] === byte)) throw new RitualAccountDecodeError('discriminator', `invalid ${account} discriminator`)
    return reader
  } catch (error) {
    if (error instanceof RitualAccountDecodeError) throw error
    throw new RitualAccountDecodeError('input', 'account envelope could not be read')
  }
}
function finish<T>(reader: Reader, output: T): T { reader.finish(); return output }
function checkSchema(version: number): void { if (version !== 1) throw new RitualAccountDecodeError('schema', `unsupported schema ${version}`) }

export function decodeProtocolConfig(input: AccountEnvelope, expectedProgramId: PublicKey): ProtocolConfigAccountView {
  const reader = begin(input, expectedProgramId, 'ProtocolConfig')
  const schemaVersion = reader.u8(); checkSchema(schemaVersion)
  const authority = reader.pubkey(); const allowedStakeMint = reader.pubkey(); const feeRecipient = reader.pubkey()
  const feeBasisPoints = reader.u16(); const minimumFee = reader.u64(); const maximumFee = reader.u64(); const maximumMemberStake = reader.u64()
  const maxMembers = reader.u8(); const maxEvents = reader.u8(); const paused = reader.bool(); const bump = reader.u8()
  ensureU64(minimumFee, 'minimumFee'); ensureU64(maximumFee, 'maximumFee'); ensureU64(maximumMemberStake, 'maximumMemberStake')
  if (authority.equals(zero) || allowedStakeMint.equals(zero) || feeRecipient.equals(zero)) throw new RitualAccountDecodeError('unusable', 'ProtocolConfig contains a default public key')
  if (feeBasisPoints < 1 || feeBasisPoints > 10000 || minimumFee === 0n || maximumFee === 0n || minimumFee > maximumFee || maximumMemberStake === 0n || maxMembers !== 6 || maxEvents !== 16) throw new RitualAccountDecodeError('invariant', 'ProtocolConfig limits are invalid')
  return finish(reader, Object.freeze({ schemaVersion, authority, allowedStakeMint, feeRecipient, feeBasisPoints, minimumFee, maximumFee, maximumMemberStake, maxMembers, maxEvents, paused, bump }))
}

export function decodeRitual(input: AccountEnvelope, expectedProgramId: PublicKey, expectedMint?: PublicKey): RitualAccountView {
  const reader = begin(input, expectedProgramId, 'Ritual')
  const schemaVersion = reader.u8(); checkSchema(schemaVersion)
  const protocolConfig = reader.pubkey(); const creator = reader.pubkey(); const nonce = reader.u64(); const ruleDigest = reader.bytesFixed(32); const stakeMint = reader.pubkey()
  if (expectedMint !== undefined && (!(expectedMint instanceof PublicKey) || !stakeMint.equals(expectedMint))) throw new RitualAccountDecodeError('invariant', 'stake mint mismatch')
  const memberLength = reader.vecLength(6); if (memberLength < 2) throw new RitualAccountDecodeError('invariant', 'member count must be 2..6')
  const members = Array.from({ length: memberLength }, () => reader.pubkey())
  const memberTotalStake = reader.u64(); const perEventAllocation = reader.u64()
  const scheduleLength = reader.vecLength(16); if (scheduleLength < 1) throw new RitualAccountDecodeError('invariant', 'schedule must not be empty')
  const schedule = Array.from({ length: scheduleLength }, () => readWindow(reader))
  const additionalConfirmationThreshold = reader.u8(); const feePayerMode = reader.enum(['Host', 'Split'] as const); const lockedActivationFee = reader.u64(); const stakeDecimals = reader.u8(); const lockedFeeRecipient = reader.pubkey(); const stakeVault = reader.pubkey(); const feeVault = reader.pubkey(); const stakeVaultBump = reader.u8(); const feeVaultBump = reader.u8(); const fundedMembersBitmap = reader.u8(); const fundedMemberCount = reader.u8(); const fundedStakeTotal = reader.u64(); const fundedFeeTotal = reader.u64(); const status = reader.enum(['Funding', 'Active', 'Completed', 'Cancelled'] as const); const currentEventIndex = reader.u8(); const settledEventCount = reader.u8(); const createdAt = reader.i64(); const activatedAt = reader.i64(); const cancelledAt = reader.i64(); const completedAt = reader.i64(); const vaultsClosed = reader.bool(); const bump = reader.u8()
  const memberMask = maskFor(memberLength); const events = BigInt(scheduleLength)
  if (protocolConfig.equals(zero) || creator.equals(zero) || stakeMint.equals(zero) || lockedFeeRecipient.equals(zero) || stakeVault.equals(zero) || feeVault.equals(zero) || members.some(member => member.equals(zero)) || new Set(members.map(member => member.toBase58())).size !== members.length || !members.some(member => member.equals(creator)) || ruleDigest.every(byte => byte === 0) || memberTotalStake === 0n || perEventAllocation === 0n || memberTotalStake % events !== 0n || perEventAllocation !== memberTotalStake / events || lockedActivationFee === 0n || additionalConfirmationThreshold > memberLength - 1 || (fundedMembersBitmap & ~memberMask) !== 0 || fundedMemberCount !== popcount(fundedMembersBitmap) || currentEventIndex > scheduleLength || settledEventCount > currentEventIndex || createdAt <= 0n) throw new RitualAccountDecodeError('invariant', 'Ritual common state is inconsistent')
  for (let index = 1; index < schedule.length; index += 1) if (schedule[index - 1].resolution >= schedule[index].opens) throw new RitualAccountDecodeError('invariant', 'schedule windows overlap')
  for (const value of [memberTotalStake, perEventAllocation, lockedActivationFee, fundedStakeTotal, fundedFeeTotal]) ensureU64(value, 'Ritual amount')
  const expectedFee = (bitmap: number): bigint => { let total = 0n; const count = BigInt(memberLength); const base = lockedActivationFee / count; const remainder = lockedActivationFee % count; for (let index = 0; index < memberLength; index += 1) if (bitmap & (1 << index)) total += feePayerMode === 'Host' ? (members[index].equals(creator) ? lockedActivationFee : 0n) : base + (BigInt(index) < remainder ? 1n : 0n); ensureU64(total, 'expected fee'); return total }
  const expectedFundingStake = memberTotalStake * BigInt(fundedMemberCount); ensureU64(expectedFundingStake, 'funded stake')
  const expectedActiveStake = (events - BigInt(settledEventCount)) * perEventAllocation * BigInt(memberLength); ensureU64(expectedActiveStake, 'active stake')
  if (lockedActivationFee !== expectedFee(memberMask)) throw new RitualAccountDecodeError('invariant', 'locked activation fee is inconsistent')
  if (status === 'Funding' && (activatedAt !== 0n || cancelledAt !== 0n || completedAt !== 0n || currentEventIndex !== 0 || settledEventCount !== 0 || fundedStakeTotal !== expectedFundingStake || fundedFeeTotal !== expectedFee(fundedMembersBitmap) || vaultsClosed)) throw new RitualAccountDecodeError('invariant', 'Funding state is inconsistent')
  if (status === 'Active' && (fundedMembersBitmap !== memberMask || fundedMemberCount !== memberLength || fundedFeeTotal !== expectedFee(memberMask) || currentEventIndex === scheduleLength || settledEventCount !== currentEventIndex || activatedAt < createdAt || activatedAt <= 0n || cancelledAt !== 0n || completedAt !== 0n || vaultsClosed || fundedStakeTotal !== expectedActiveStake)) throw new RitualAccountDecodeError('invariant', 'Active state is inconsistent')
  if (status === 'Completed' && (fundedMembersBitmap !== memberMask || fundedMemberCount !== memberLength || fundedFeeTotal !== lockedActivationFee || currentEventIndex !== scheduleLength || settledEventCount !== scheduleLength || fundedStakeTotal !== 0n || cancelledAt !== 0n || activatedAt <= 0n || completedAt < activatedAt || completedAt <= 0n)) throw new RitualAccountDecodeError('invariant', 'Completed state is inconsistent')
  if (status === 'Cancelled' && (currentEventIndex !== 0 || settledEventCount !== 0 || fundedMembersBitmap !== 0 || fundedMemberCount !== 0 || fundedStakeTotal !== 0n || fundedFeeTotal !== 0n || activatedAt !== 0n || completedAt !== 0n || cancelledAt <= 0n || cancelledAt < createdAt)) throw new RitualAccountDecodeError('invariant', 'Cancelled state is inconsistent')
  const output = Object.freeze({ schemaVersion, protocolConfig, creator, nonce, ruleDigest, stakeMint, members: Object.freeze(members), memberTotalStake, perEventAllocation, schedule: Object.freeze(schedule), additionalConfirmationThreshold, feePayerMode, lockedActivationFee, stakeDecimals, lockedFeeRecipient, stakeVault, feeVault, stakeVaultBump, feeVaultBump, fundedMembersBitmap, fundedMemberCount, fundedStakeTotal, fundedFeeTotal, status, currentEventIndex, settledEventCount, createdAt, activatedAt, cancelledAt, completedAt, vaultsClosed, bump })
  return finish(reader, output)
}

export function decodeRitualEvent(input: AccountEnvelope, expectedProgramId: PublicKey): RitualEventAccountView {
  const reader = begin(input, expectedProgramId, 'RitualEvent')
  const schemaVersion = reader.u8(); checkSchema(schemaVersion)
  const ritual = reader.pubkey(); const eventIndex = reader.u8(); const window = readWindow(reader)
  const memberCount = reader.u8(); const status = reader.enum(['Scheduled', 'Claiming', 'Resolving', 'Settled', 'Voided'] as const)
  const claimedMembersBitmap = reader.u8(); const confirmedMembersBitmap = reader.u8(); const questionedMembersBitmap = reader.u8()
  const initializedAt = reader.i64(); const resolvedAt = reader.i64(); const settlementVersion = reader.u8(); const voidReason = reader.enum(['None', 'NoConfirmedMembers', 'UnresolvedClaims'] as const)
  const eventPool = reader.u64(); const forfeitedTotal = reader.u64(); const payoutTotal = reader.u64(); const refundedTotal = reader.u64(); const confirmedMemberCount = reader.u8(); const remainderUnits = reader.u64(); const remainingStakeTotalAfter = reader.u64(); const bump = reader.u8()
  const mask = memberCount >= 1 && memberCount <= 6 ? maskFor(memberCount) : 0
  const terminal = status === 'Settled' || status === 'Voided'
  const zeroReceipt = eventPool === 0n && forfeitedTotal === 0n && payoutTotal === 0n && refundedTotal === 0n && confirmedMemberCount === 0 && remainderUnits === 0n && remainingStakeTotalAfter === 0n
  const structuralInvalid = ritual.equals(zero) || memberCount < 2 || memberCount > 6 || eventIndex > 15 || (claimedMembersBitmap & ~mask) !== 0 || (confirmedMembersBitmap & ~claimedMembersBitmap) !== 0 || (questionedMembersBitmap & ~claimedMembersBitmap) !== 0 || (confirmedMembersBitmap & questionedMembersBitmap) !== 0 || (terminal && confirmedMemberCount !== popcount(confirmedMembersBitmap)) || settlementVersion > 1 || initializedAt <= 0n
  if (structuralInvalid) throw new RitualAccountDecodeError('invariant', 'RitualEvent state is inconsistent')
  const invalidLifecycle = !terminal && (!zeroReceipt || settlementVersion !== 0 || resolvedAt !== 0n || voidReason !== 'None')
  const invalidStage = (status === 'Scheduled' && (claimedMembersBitmap !== 0 || confirmedMembersBitmap !== 0 || questionedMembersBitmap !== 0)) || (status === 'Claiming' && questionedMembersBitmap !== 0)
  if (invalidLifecycle || invalidStage) throw new RitualAccountDecodeError('invariant', 'RitualEvent lifecycle state is inconsistent')
  if (terminal && (settlementVersion !== 1 || resolvedAt <= window.resolution || resolvedAt < initializedAt || eventPool === 0n)) throw new RitualAccountDecodeError('invariant', 'RitualEvent terminal state is inconsistent')
  const invalidSettlement = claimedMembersBitmap !== confirmedMembersBitmap || questionedMembersBitmap !== 0 || confirmedMemberCount === 0 || voidReason !== 'None' || payoutTotal !== eventPool || refundedTotal !== 0n || forfeitedTotal > eventPool || remainderUnits >= BigInt(confirmedMemberCount) || (confirmedMemberCount === memberCount && (forfeitedTotal !== 0n || remainderUnits !== 0n)) || (confirmedMemberCount < memberCount && forfeitedTotal === 0n)
  if (status === 'Settled' && invalidSettlement) throw new RitualAccountDecodeError('invariant', 'Settled receipt is inconsistent')
  const pending = claimedMembersBitmap & ~(confirmedMembersBitmap | questionedMembersBitmap)
  const invalidVoid = payoutTotal !== 0n || refundedTotal !== eventPool || forfeitedTotal !== 0n || remainderUnits !== 0n || (pending !== 0 || questionedMembersBitmap !== 0 ? voidReason !== 'UnresolvedClaims' : voidReason !== 'NoConfirmedMembers' || confirmedMemberCount !== 0)
  if (status === 'Voided' && invalidVoid) throw new RitualAccountDecodeError('invariant', 'Voided receipt is inconsistent')
  const output = Object.freeze({ schemaVersion, ritual, eventIndex, window, memberCount, status, claimedMembersBitmap, confirmedMembersBitmap, questionedMembersBitmap, initializedAt, resolvedAt, settlementVersion, voidReason, eventPool, forfeitedTotal, payoutTotal, refundedTotal, confirmedMemberCount, remainderUnits, remainingStakeTotalAfter, bump })
  return finish(reader, output)
}

export function decodeCompletionClaim(input: AccountEnvelope, expectedProgramId: PublicKey): CompletionClaimAccountView {
  const reader = begin(input, expectedProgramId, 'CompletionClaim')
  const schemaVersion = reader.u8(); checkSchema(schemaVersion)
  const ritual = reader.pubkey(); const event = reader.pubkey(); const eventIndex = reader.u8(); const claimant = reader.pubkey(); const memberIndex = reader.u8(); const claimVersion = reader.u8(); const status = reader.enum(['Pending', 'Confirmed', 'Questioned'] as const)
  const requiredAdditionalConfirmations = reader.u8(); const approvalsBitmap = reader.u8(); const approvalCount = reader.u8(); const claimedAt = reader.i64(); const bump = reader.u8()
  const claimantBit = 1 << memberIndex
  const validPending = requiredAdditionalConfirmations > 0 && approvalCount < requiredAdditionalConfirmations
  const validConfirmed = requiredAdditionalConfirmations === 0 ? approvalCount === 0 : approvalCount === requiredAdditionalConfirmations
  const validQuestioned = requiredAdditionalConfirmations > 0 && approvalCount < requiredAdditionalConfirmations
  const invalidClaim = ritual.equals(zero) || event.equals(zero) || claimant.equals(zero) || eventIndex > 15 || memberIndex > 5 || claimVersion !== CURRENT_CLAIM_VERSION || requiredAdditionalConfirmations > 5 || (approvalsBitmap & ~0x3f) !== 0 || (approvalsBitmap & claimantBit) !== 0 || approvalCount !== popcount(approvalsBitmap) || (status === 'Pending' && !validPending) || (status === 'Confirmed' && !validConfirmed) || (status === 'Questioned' && !validQuestioned) || claimedAt <= 0n
  if (invalidClaim) throw new RitualAccountDecodeError('invariant', 'CompletionClaim state is inconsistent')
  return finish(reader, Object.freeze({ schemaVersion, ritual, event, eventIndex, claimant, memberIndex, claimVersion, status, requiredAdditionalConfirmations, approvalsBitmap, approvalCount, claimedAt, bump }))
}

export type { ProtocolConfigAccountView as ProtocolConfigView, RitualAccountView as RitualView, RitualEventAccountView as RitualEventView, CompletionClaimAccountView as CompletionClaimView }
