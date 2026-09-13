import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual, RitualAccountDecodeError } from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, envelope, hexToBytes } from './__fixtures__/accountVectors'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const source = () => hexToBytes(accountVectors.ritual.hex)
const decode = (bytes: Uint8Array, expectedMint?: unknown) => decodeRitual({ owner: programId, data: bytes }, programId, expectedMint as PublicKey | undefined)
const u32 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24
const u64 = (b: Uint8Array, o: number) => { let v = 0n; for (let i = 0; i < 8; i += 1) v |= BigInt(b[o + i]) << BigInt(i * 8); return v }
const putU64 = (b: Uint8Array, o: number, v: bigint) => { for (let i = 0; i < 8; i += 1) b[o + i] = Number((v >> BigInt(i * 8)) & 255n) }
const putI64 = putU64
const putKey = (b: Uint8Array, o: number, key: PublicKey) => b.set(key.toBytes(), o)
const expectReject = (action: () => unknown) => { expect(action).toThrowError(RitualAccountDecodeError) }

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
})
