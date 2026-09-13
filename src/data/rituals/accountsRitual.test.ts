import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual, RitualAccountDecodeError } from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, envelope, hexToBytes } from './__fixtures__/accountVectors'
import { feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const source = () => hexToBytes(accountVectors.ritual.hex)
const decode = (bytes: Uint8Array, expectedMint?: unknown, expectedRitual?: unknown) => decodeRitual({ owner: programId, data: bytes }, programId, expectedMint as PublicKey | undefined, expectedRitual as PublicKey | undefined)
const u32 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24
const u64 = (b: Uint8Array, o: number) => { let v = 0n; for (let i = 0; i < 8; i += 1) v |= BigInt(b[o + i]) << BigInt(i * 8); return v }
const putU64 = (b: Uint8Array, o: number, v: bigint) => { for (let i = 0; i < 8; i += 1) b[o + i] = Number((v >> BigInt(i * 8)) & 255n) }
const putI64 = putU64
const putKey = (b: Uint8Array, o: number, key: PublicKey) => b.set(key.toBytes(), o)
const expectReject = (action: () => unknown) => { expect(action).toThrowError(RitualAccountDecodeError) }
const expectCategory = (action: () => unknown, category: string) => {
  try { action(); throw new Error('expected decoder rejection') } catch (error) {
    expect(error).toBeInstanceOf(RitualAccountDecodeError)
    expect((error as RitualAccountDecodeError).category).toBe(category)
  }
}

type RitualOffsets = { protocol: number; creator: number; digest: number; mint: number; membersLength: number; members: number; memberTotal: number; allocation: number; scheduleLength: number; windows: number; threshold: number; mode: number; fee: number; recipient: number; stakeVault: number; feeVault: number; bitmap: number; count: number; stake: number; fundedFee: number; status: number; current: number; settled: number; created: number; activated: number; cancelled: number; completed: number; closed: number }
function parseOffsets(bytes: Uint8Array): RitualOffsets {
  let o = 8; const take = (n: number) => { const at = o; o += n; return at }
  take(1); const protocol = take(32); const creator = take(32); take(8); const digest = take(32); const mint = take(32)
  const membersLength = take(4); const count = u32(bytes, membersLength); const members = take(count * 32)
  const memberTotal = take(8); const allocation = take(8); const scheduleLength = take(4); const events = u32(bytes, scheduleLength); const windows = take(events * 24)
  const threshold = take(1); const mode = take(1); const fee = take(8); take(1); const recipient = take(32); const stakeVault = take(32); const feeVault = take(32); take(2)
  const bitmap = take(1); const fundedCount = take(1); const stake = take(8); const fundedFee = take(8); const status = take(1); const current = take(1); const settled = take(1); const created = take(8); const activated = take(8); const cancelled = take(8); const completed = take(8); const closed = take(1); take(1)
  expect(o).toBeLessThanOrEqual(bytes.length); for (let i = o; i < bytes.length; i += 1) expect(bytes[i]).toBe(0); return { protocol, creator, digest, mint, membersLength, members, memberTotal, allocation, scheduleLength, windows, threshold, mode, fee, recipient, stakeVault, feeVault, bitmap, count: fundedCount, stake, fundedFee, status, current, settled, created, activated, cancelled, completed, closed }
}
const offsets = parseOffsets(source())
const baseline = () => { const bytes = source(); expect(() => decode(bytes)).not.toThrow(); return bytes }

// Offsets are derived from the encoded vector lengths, not from allocation padding.
describe('Ritual lifecycle decoder mutation matrix', () => {
  it('decodes the source-generated Active 3-member/2-event vector and derives every offset', () => {
    const bytes = baseline(); const value = decode(bytes, new PublicKey(accountVectors.ritual.expected.stakeMint))
    expect(value.status).toBe('Active'); expect(value.members).toHaveLength(3); expect(value.schedule).toHaveLength(2)
    expect(offsets.windows).toBeGreaterThan(offsets.members); expect(offsets.closed + 2).toBeLessThanOrEqual(bytes.length)
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.members)).toBe(true); expect(Object.isFrozen(value.schedule)).toBe(true)
    const digestBefore = value.ruleDigest[0]; bytes[offsets.digest] ^= 255; expect(value.ruleDigest[0]).toBe(digestBefore)
  })

  it.each([
    ['protocol default', offsets.protocol, 'key'], ['creator default', offsets.creator, 'key'], ['mint default', offsets.mint, 'key'],
    ['fee recipient default', offsets.recipient, 'key'], ['stake vault default', offsets.stakeVault, 'key'], ['fee vault default', offsets.feeVault, 'key'],
    ['zero digest', offsets.digest, 'zeroDigest'], ['threshold too high', offsets.threshold, 'threshold'], ['invalid fee mode', offsets.mode, 'enum'],
  ])('%s is rejected', (_name, offset, kind) => {
    const bytes = source(); if (kind === 'key') bytes.fill(0, offset, offset + 32); else if (kind === 'zeroDigest') bytes.fill(0, offset, offset + 32); else if (kind === 'threshold') bytes[offset] = 255; else bytes[offset] = 2
    expectReject(() => decode(bytes))
  })

  it('rejects zero/one members, empty/oversized schedules, duplicates, absent creator, and strict chronology violations', () => {
    for (const length of [0, 1, 7]) { const bytes = source(); bytes[offsets.membersLength] = length; bytes.fill(0, offsets.membersLength + 1, offsets.membersLength + 4); expectReject(() => decode(bytes)) }
    const duplicate = source(); duplicate.set(duplicate.slice(offsets.members, offsets.members + 32), offsets.members + 32); expectReject(() => decode(duplicate))
    const absentCreator = source(); putKey(absentCreator, offsets.creator, new PublicKey(new Uint8Array(32).fill(99))); expectReject(() => decode(absentCreator))
    const equal = source(); const firstResolution = offsets.windows + 16; const secondOpens = offsets.windows + 24; putI64(equal, secondOpens, u64(equal, firstResolution)); expectReject(() => decode(equal))
    const negative = source(); putI64(negative, offsets.windows, 0xffffffffffffffffn); expectReject(() => decode(negative))
  })

  it('rejects Active member-count, fee, stake, and vault state mutations', () => {
    const bytes = source(); const memberCount = u32(bytes, offsets.membersLength); const mask = (1 << memberCount) - 1
    for (const [field, value] of [[offsets.count, memberCount - 1], [offsets.bitmap, mask - 1], [offsets.fundedFee, 0]] as const) { const mutated = source(); mutated[field] = value; expectReject(() => decode(mutated)) }
    const stake = source(); putU64(stake, offsets.stake, u64(stake, offsets.stake) + 1n); expectReject(() => decode(stake))
    const closed = source(); closed[offsets.closed] = 1; expectReject(() => decode(closed))
  })

  it('accepts coherent Funding, Completed (including closed vaults), and Cancelled variants', () => {
    const bytes = source(); const n = u32(bytes, offsets.membersLength); const events = u32(bytes, offsets.scheduleLength); const memberStake = u64(bytes, offsets.memberTotal); const fee = u64(bytes, offsets.fee)
    const funding = source(); funding[offsets.status] = 0; funding[offsets.bitmap] = 2; funding[offsets.count] = 1; putU64(funding, offsets.stake, memberStake); putU64(funding, offsets.fundedFee, 0n); putI64(funding, offsets.activated, 0n); putI64(funding, offsets.cancelled, 0n); putI64(funding, offsets.completed, 0n); funding[offsets.current] = 0; funding[offsets.settled] = 0; expect(decode(funding).status).toBe('Funding')
    const completed = source(); completed[offsets.status] = 2; completed[offsets.current] = events; completed[offsets.settled] = events; putU64(completed, offsets.stake, 0n); putI64(completed, offsets.completed, u64(completed, offsets.activated)); completed[offsets.closed] = 1; expect(decode(completed).status).toBe('Completed')
    const cancelled = source(); cancelled[offsets.status] = 3; cancelled[offsets.bitmap] = 0; cancelled[offsets.count] = 0; putU64(cancelled, offsets.stake, 0n); putU64(cancelled, offsets.fundedFee, 0n); putI64(cancelled, offsets.activated, 0n); putI64(cancelled, offsets.completed, 0n); putI64(cancelled, offsets.cancelled, u64(cancelled, offsets.created)); cancelled[offsets.current] = 0; cancelled[offsets.settled] = 0; cancelled[offsets.closed] = 1; expect(decode(cancelled).status).toBe('Cancelled'); expect(n).toBe(3)
  })

  it('accepts and verifies every canonical inner PDA and bump', () => {
    const b = source(); const creator = new PublicKey(b.slice(offsets.creator, offsets.creator + 32)); const nonce = u64(b, offsets.creator + 32)
    const [ritual, ritualBump] = ritualPda(creator, nonce, programId); const [protocol] = protocolConfigPda(programId); const [stake, stakeBump] = stakeVaultPda(ritual, programId); const [fee, feeBump] = feeVaultPda(ritual, programId)
    expect(new PublicKey(b.slice(offsets.protocol, offsets.protocol + 32)).equals(protocol)).toBe(true); expect(new PublicKey(b.slice(offsets.stakeVault, offsets.stakeVault + 32)).equals(stake)).toBe(true); expect(new PublicKey(b.slice(offsets.feeVault, offsets.feeVault + 32)).equals(fee)).toBe(true)
    expect(b[offsets.closed + 1]).toBe(ritualBump); expect(b[offsets.feeVault + 32]).toBe(stakeBump); expect(b[offsets.feeVault + 33]).toBe(feeBump)
    expect(decode(b, undefined, ritual).status).toBe('Active')
    for (const mutate of [
      (x: Uint8Array) => x.fill(0, offsets.protocol, offsets.protocol + 32),
      (x: Uint8Array) => x.fill(0, offsets.stakeVault, offsets.stakeVault + 32),
      (x: Uint8Array) => x.fill(0, offsets.feeVault, offsets.feeVault + 32),
      (x: Uint8Array) => { x[offsets.closed + 1] ^= 1 }, (x: Uint8Array) => { x[offsets.feeVault + 32] ^= 1 }, (x: Uint8Array) => { x[offsets.feeVault + 33] ^= 1 },
    ]) { const mutated = source(); mutate(mutated); expectCategory(() => decode(mutated), 'invariant') }
  })

  it.each([
    ['member length 0', 0], ['member length 1', 1], ['member length 7', 7],
  ])('%s rejects with a vector/invariant category', (_name, length) => { const b = source(); b[offsets.membersLength] = length; b.fill(0, offsets.membersLength + 1, offsets.membersLength + 4); expect(() => decode(b)).toThrow(RitualAccountDecodeError) })

  it.each([
    ['schedule length 0', 0], ['schedule length 17', 17],
  ])('%s rejects as a vector or invariant, without asserting shifted fields', (_name, length) => { const b = source(); b[offsets.scheduleLength] = length; b.fill(0, offsets.scheduleLength + 1, offsets.scheduleLength + 4); expect(() => decode(b)).toThrow(RitualAccountDecodeError) })

  it.each([
    ['opens negative', 0xffffffffffffffffn], ['opens equals deadline', 200n], ['opens after deadline', 201n], ['deadline equals resolution', 300n], ['deadline after resolution', 301n],
  ])('rejects window relation %s', (_name, value) => { const b = source(); putI64(b, offsets.windows + (_name.startsWith('deadline') ? 8 : 0), value); expectCategory(() => decode(b), 'invariant') })

  it('accepts exactly adjacent windows and rejects one-field common mutations', () => {
    const adjacent = source(); putI64(adjacent, offsets.windows + 24, 301n); expect(decode(adjacent).status).toBe('Active')
    const mutations: Array<[string, (b: Uint8Array) => void]> = [
      ['zero member total', b => putU64(b, offsets.memberTotal, 0n)], ['zero allocation', b => putU64(b, offsets.allocation, 0n)], ['zero locked fee', b => putU64(b, offsets.fee, 0n)],
      ['nondivisible total', b => putU64(b, offsets.memberTotal, 201n)], ['zero digest', b => b.fill(0, offsets.digest, offsets.digest + 32)], ['invalid fee enum', b => { b[offsets.mode] = 2 }], ['invalid status enum', b => { b[offsets.status] = 4 }], ['vault bool 2', b => { b[offsets.closed] = 2 }], ['created zero', b => putI64(b, offsets.created, 0n)], ['created negative', b => putI64(b, offsets.created, -1n)],
    ]
    for (const [_name, mutate] of mutations) { const b = source(); mutate(b); expect(() => decode(b)).toThrow(RitualAccountDecodeError) }
  })

  it.each([
    ['active current/settled zero', 0, 0, 600n], ['active current/settled one', 1, 1, 300n],
  ])('accepts coherent sequential Active state: %s', (_name, current, settled, stake) => { const b = source(); b[offsets.current] = current; b[offsets.settled] = settled; putU64(b, offsets.stake, stake); expect(decode(b).status).toBe('Active') })

  it.each([
    ['completed activated before created', (b: Uint8Array) => putI64(b, offsets.activated, u64(b, offsets.created) - 1n)],
    ['completed activated zero', b => putI64(b, offsets.activated, 0n)], ['completed completed zero', b => putI64(b, offsets.completed, 0n)],
  ])('rejects completed lifecycle mutation %s', (_name, mutate) => { const b = source(); b[offsets.status] = 2; b[offsets.current] = 2; b[offsets.settled] = 2; putU64(b, offsets.stake, 0n); mutate(b); expect(() => decode(b)).toThrow(RitualAccountDecodeError) })
})
