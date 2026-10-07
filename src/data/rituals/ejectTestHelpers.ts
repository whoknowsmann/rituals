import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js'
import { ACCOUNT_DATA_LENGTHS, ACCOUNT_DISCRIMINATORS, decodeRitual, type RitualAccountView, type RitualEventAccountView } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'
import { eventPda, feeVaultPda, ritualPda, stakeVaultPda } from './pdas'
import type { RitualRpcAccountInfo, RitualRpcTransport } from './ritualsRpc'

/** Test-only Borsh writers for solo accounts, so decoders and readers see real bytes. */
export const ejectProgramId = VECTOR_PROGRAM_ID
const groupVector = decodeRitual(envelope(accountVectors.ritual.hex), ejectProgramId)
export const ejectKey = (value: number) => new PublicKey(new Uint8Array(32).fill(value))
export const ejectCreator = groupVector.creator
export const ejectDestination = ejectKey(33)
export const ejectRitualAddress = ritualPda(groupVector.creator, groupVector.nonce, ejectProgramId)[0]
export const ALLOCATION = 5_000_000n

/** Three 60-second weeks: opens 1000/1060/1120, deadline +45, resolution +55. */
export const ejectSchedule = Object.freeze([0, 1, 2].map((index) => Object.freeze({ opens: 1000n + 60n * BigInt(index), deadline: 1045n + 60n * BigInt(index), resolution: 1055n + 60n * BigInt(index) })))

export function soloAccount(overrides: Partial<RitualAccountView> = {}): RitualAccountView {
  return Object.freeze({
    ...groupVector,
    members: Object.freeze([groupVector.creator]), kind: 'Solo' as const, witness: null, season: null, forfeitDestination: ejectDestination,
    additionalConfirmationThreshold: 0, feePayerMode: 'Host' as const, lockedActivationFee: 0n, schedule: ejectSchedule,
    memberTotalStake: ALLOCATION * 3n, perEventAllocation: ALLOCATION, status: 'Active' as const, fundedMembersBitmap: 1, fundedMemberCount: 1,
    fundedStakeTotal: ALLOCATION * 3n, fundedFeeTotal: 0n, currentEventIndex: 0, settledEventCount: 0, createdAt: 900n, activatedAt: 900n,
    cancelledAt: 0n, completedAt: 0n, vaultsClosed: false, skipDeclared: false, skipEventIndex: 0, ...overrides,
  })
}

class Writer {
  readonly bytes: Uint8Array
  offset = 8
  constructor(size: number, discriminator: readonly number[]) { this.bytes = new Uint8Array(size); this.bytes.set(discriminator, 0) }
  u8(value: number) { this.bytes[this.offset++] = value }
  u32(value: number) { for (let i = 0; i < 4; i += 1) this.bytes[this.offset++] = (value >>> (8 * i)) & 255 }
  u64(value: bigint) { const v = value < 0n ? value + (1n << 64n) : value; for (let i = 0; i < 8; i += 1) this.bytes[this.offset++] = Number((v >> BigInt(8 * i)) & 255n) }
  key(value: PublicKey) { this.bytes.set(value.toBytes(), this.offset); this.offset += 32 }
}

const hexBytes = (hex: string) => Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16))

export function ritualBytes(account: RitualAccountView): Uint8Array {
  const w = new Writer(ACCOUNT_DATA_LENGTHS.Ritual, ACCOUNT_DISCRIMINATORS.Ritual)
  w.u8(account.schemaVersion); w.key(account.protocolConfig); w.key(account.creator); w.u64(account.nonce); hexBytes(account.ruleDigest).forEach((byte) => w.u8(byte)); w.key(account.stakeMint)
  w.u32(account.members.length); account.members.forEach((member) => w.key(member)); w.u64(account.memberTotalStake); w.u64(account.perEventAllocation)
  w.u32(account.schedule.length); account.schedule.forEach((window) => { w.u64(window.opens); w.u64(window.deadline); w.u64(window.resolution) })
  w.u8(account.additionalConfirmationThreshold); w.u8(account.feePayerMode === 'Host' ? 0 : 1); w.u64(account.lockedActivationFee); w.u8(account.stakeDecimals)
  w.key(account.lockedFeeRecipient); w.key(account.stakeVault); w.key(account.feeVault); w.u8(account.stakeVaultBump); w.u8(account.feeVaultBump)
  w.u8(account.fundedMembersBitmap); w.u8(account.fundedMemberCount); w.u64(account.fundedStakeTotal); w.u64(account.fundedFeeTotal)
  w.u8(['Funding', 'Active', 'Completed', 'Cancelled', 'Ended'].indexOf(account.status)); w.u8(account.currentEventIndex); w.u8(account.settledEventCount)
  w.u64(account.createdAt); w.u64(account.activatedAt); w.u64(account.cancelledAt); w.u64(account.completedAt); w.u8(account.vaultsClosed ? 1 : 0); w.u8(account.kind === 'Group' ? 0 : 1)
  w.u8(account.witness ? 1 : 0); if (account.witness) w.key(account.witness); w.u8(account.season ? 1 : 0); if (account.season) w.key(account.season)
  w.key(account.forfeitDestination); w.u8(account.skipDeclared ? 1 : 0); w.u8(account.skipEventIndex); w.u8(account.bump)
  return w.bytes
}

export function soloEvent(index: number, overrides: Partial<RitualEventAccountView> = {}): RitualEventAccountView {
  return Object.freeze({
    schemaVersion: 1, ritual: ejectRitualAddress, eventIndex: index, window: ejectSchedule[index], memberCount: 1, status: 'Claiming' as const,
    claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0, initializedAt: ejectSchedule[index].opens, resolvedAt: 0n, settlementVersion: 0,
    voidReason: 'None' as const, eventPool: 0n, forfeitedTotal: 0n, payoutTotal: 0n, refundedTotal: 0n, confirmedMemberCount: 0, remainderUnits: 0n,
    remainingStakeTotalAfter: 0n, bump: eventPda(ejectRitualAddress, index, ejectProgramId)[1], ...overrides,
  })
}

/** A settled receipt as finalize_event or eject_ritual writes it. */
export function settledEvent(index: number, outcome: 'kept' | 'missed' | 'skipped', resolvedAt: bigint, remainingAfter: bigint): RitualEventAccountView {
  const stamped = outcome === 'kept' ? 1 : 0
  return soloEvent(index, { status: outcome === 'skipped' ? 'Voided' : 'Settled', voidReason: outcome === 'skipped' ? 'DeclaredSkip' : 'None', claimedMembersBitmap: stamped, confirmedMembersBitmap: stamped, confirmedMemberCount: stamped,
    initializedAt: outcome === 'missed' ? resolvedAt : ejectSchedule[index].opens, resolvedAt, settlementVersion: 1, eventPool: ALLOCATION, payoutTotal: outcome === 'kept' ? ALLOCATION : 0n,
    forfeitedTotal: outcome === 'missed' ? ALLOCATION : 0n, refundedTotal: outcome === 'skipped' ? ALLOCATION : 0n, remainingStakeTotalAfter: remainingAfter })
}

export function eventBytes(event: RitualEventAccountView): Uint8Array {
  const w = new Writer(ACCOUNT_DATA_LENGTHS.RitualEvent, ACCOUNT_DISCRIMINATORS.RitualEvent)
  w.u8(event.schemaVersion); w.key(event.ritual); w.u8(event.eventIndex); w.u64(event.window.opens); w.u64(event.window.deadline); w.u64(event.window.resolution)
  w.u8(event.memberCount); w.u8(['Scheduled', 'Claiming', 'Resolving', 'Settled', 'Voided'].indexOf(event.status)); w.u8(event.claimedMembersBitmap); w.u8(event.confirmedMembersBitmap); w.u8(event.questionedMembersBitmap)
  w.u64(event.initializedAt); w.u64(event.resolvedAt); w.u8(event.settlementVersion); w.u8(['None', 'NoConfirmedMembers', 'UnresolvedClaims', 'DeclaredSkip'].indexOf(event.voidReason))
  w.u64(event.eventPool); w.u64(event.forfeitedTotal); w.u64(event.payoutTotal); w.u64(event.refundedTotal); w.u8(event.confirmedMemberCount); w.u64(event.remainderUnits); w.u64(event.remainingStakeTotalAfter); w.u8(event.bump)
  return w.bytes
}

export function tokenAccountBytes(mint: PublicKey, owner: PublicKey, amount: bigint): Uint8Array {
  const data = new Uint8Array(AccountLayout.span)
  AccountLayout.encode({ mint, owner, amount, delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data)
  return data
}

export function clockBytes(unixTimestamp: bigint): Uint8Array {
  const data = new Uint8Array(40)
  const value = unixTimestamp < 0n ? unixTimestamp + (1n << 64n) : unixTimestamp
  for (let i = 0; i < 8; i += 1) data[32 + i] = Number((value >> BigInt(8 * i)) & 255n)
  return data
}

/** An in-memory chain for RitualsRpcReader: unknown addresses read as absent. */
export function memoryChain(slot = 50) {
  const accounts = new Map<string, RitualRpcAccountInfo>()
  const put = (address: PublicKey, owner: PublicKey, data: Uint8Array) => { accounts.set(address.toBase58(), Object.freeze({ owner, data, executable: false })) }
  const transport: RitualRpcTransport = { getMultipleAccountsInfoAndContext: async (keys) => ({ context: { slot }, value: keys.map((key) => accounts.get(key.toBase58()) ?? null) }) }
  return {
    transport,
    accounts,
    remove: (address: PublicKey) => accounts.delete(address.toBase58()),
    putRitual: (account: RitualAccountView) => put(ejectRitualAddress, ejectProgramId, ritualBytes(account)),
    putEvent: (event: RitualEventAccountView) => put(eventPda(ejectRitualAddress, event.eventIndex, ejectProgramId)[0], ejectProgramId, eventBytes(event)),
    putToken: (address: PublicKey, mint: PublicKey, owner: PublicKey, amount: bigint) => put(address, TOKEN_PROGRAM_ID, tokenAccountBytes(mint, owner, amount)),
    putClock: (now: bigint) => put(SYSVAR_CLOCK_PUBKEY, new PublicKey('Sysvar1111111111111111111111111111111111111'), clockBytes(now)),
    putRaw: put,
  }
}

export const ejectVaults = Object.freeze({ stake: stakeVaultPda(ejectRitualAddress, ejectProgramId)[0], fee: feeVaultPda(ejectRitualAddress, ejectProgramId)[0] })
