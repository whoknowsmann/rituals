import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual, RitualAccountDecodeError } from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, hexToBytes } from './__fixtures__/accountVectors'
import { feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const source = () => hexToBytes(accountVectors.ritual.hex)
const decode = (bytes: Uint8Array, expectedMint?: unknown, expectedRitual?: unknown) =>
  decodeRitual({ owner: programId, data: bytes }, programId, expectedMint as PublicKey | undefined, expectedRitual as PublicKey | undefined)
const u32 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24
const u64 = (b: Uint8Array, o: number) => { let v = 0n; for (let i = 0; i < 8; i += 1) v |= BigInt(b[o + i]) << BigInt(i * 8); return v }
const putU64 = (b: Uint8Array, o: number, v: bigint) => { for (let i = 0; i < 8; i += 1) b[o + i] = Number((v >> BigInt(i * 8)) & 255n) }
const putI64 = putU64
const putKey = (b: Uint8Array, o: number, key: PublicKey) => b.set(key.toBytes(), o)
const nonzeroWrong = new PublicKey(new Uint8Array(32).fill(99))
const expectCategory = (action: () => unknown, category: string) => {
  try { action(); throw new Error('expected decoder rejection') } catch (error) {
    expect(error).toBeInstanceOf(RitualAccountDecodeError)
    expect((error as RitualAccountDecodeError).category).toBe(category)
  }
}
const expectReject = (action: () => unknown) => expectCategory(action, 'invariant')

type Offsets = { schema: number; protocol: number; creator: number; digest: number; mint: number; membersLength: number; members: number; memberTotal: number; allocation: number; scheduleLength: number; windows: number; threshold: number; mode: number; fee: number; recipient: number; stakeVault: number; feeVault: number; bitmap: number; count: number; stake: number; fundedFee: number; status: number; current: number; settled: number; created: number; activated: number; cancelled: number; completed: number; closed: number; bump: number; stakeVaultBump: number; feeVaultBump: number }
function parseOffsets(bytes: Uint8Array): Offsets {
  let o = 8; const take = (n: number) => { const at = o; o += n; return at }
  const schema = take(1); const protocol = take(32); const creator = take(32); take(8); const digest = take(32); const mint = take(32)
  const membersLength = take(4); const memberCount = u32(bytes, membersLength); const members = take(memberCount * 32)
  const memberTotal = take(8); const allocation = take(8); const scheduleLength = take(4); const eventCount = u32(bytes, scheduleLength); const windows = take(eventCount * 24)
  const threshold = take(1); const mode = take(1); const fee = take(8); take(1); const recipient = take(32); const stakeVault = take(32); const feeVault = take(32)
  const stakeVaultBump = take(1); const feeVaultBump = take(1); const bitmap = take(1); const count = take(1); const stake = take(8); const fundedFee = take(8)
  const status = take(1); const current = take(1); const settled = take(1); const created = take(8); const activated = take(8); const cancelled = take(8); const completed = take(8); const closed = take(1); const bump = take(1)
  expect(o).toBeLessThanOrEqual(bytes.length)
  return { schema, protocol, creator, digest, mint, membersLength, members, memberTotal, allocation, scheduleLength, windows, threshold, mode, fee, recipient, stakeVault, feeVault, bitmap, count, stake, fundedFee, status, current, settled, created, activated, cancelled, completed, closed, bump, stakeVaultBump, feeVaultBump }
}
const offsets = parseOffsets(source())
const memberCount = () => u32(source(), offsets.membersLength)
const memberStake = () => u64(source(), offsets.memberTotal)
const creator = () => new PublicKey(source().slice(offsets.creator, offsets.creator + 32))
const activeBase = () => { const b = source(); expect(decode(b).status).toBe('Active'); return b }
const fundingBase = (mode: 'Host' | 'Split' = 'Host') => {
  const b = source(); expect(decode(b).status).toBe('Active')
  b[offsets.status] = 0; b[offsets.current] = 0; b[offsets.settled] = 0
  putI64(b, offsets.activated, 0n); putI64(b, offsets.cancelled, 0n); putI64(b, offsets.completed, 0n); b[offsets.closed] = 0
  b[offsets.mode] = mode === 'Host' ? 0 : 1
  if (mode === 'Split') putU64(b, offsets.fee, 778n)
  return b
}
const completedBase = (closed: boolean) => {
  const b = source(); expect(decode(b).status).toBe('Active')
  b[offsets.status] = 2; b[offsets.bitmap] = 7; b[offsets.count] = 3; b[offsets.current] = 2; b[offsets.settled] = 2; b[offsets.closed] = closed ? 1 : 0
  putU64(b, offsets.stake, 0n); putU64(b, offsets.fundedFee, 777n); putI64(b, offsets.activated, 20n); putI64(b, offsets.cancelled, 0n); putI64(b, offsets.completed, 20n)
  expect(() => decode(b)).not.toThrow()
  return b
}
const cancelledBase = (closed: boolean) => {
  const b = source(); expect(decode(b).status).toBe('Active')
  b[offsets.status] = 3; b[offsets.bitmap] = 0; b[offsets.count] = 0; b[offsets.current] = 0; b[offsets.settled] = 0; b[offsets.closed] = closed ? 1 : 0
  putU64(b, offsets.stake, 0n); putU64(b, offsets.fundedFee, 0n); putI64(b, offsets.activated, 0n); putI64(b, offsets.completed, 0n); putI64(b, offsets.cancelled, 10n)
  expect(() => decode(b)).not.toThrow()
  return b
}
const mutate = (builder: () => Uint8Array, change: (b: Uint8Array) => void) => { const b = builder(); change(b); return b }

// Every row starts from a freshly decoded, discriminating baseline. The offsets are parsed from the vector.
describe('Ritual exact lifecycle decoder matrices', () => {
  it.each([
    ['correct mint', new PublicKey(accountVectors.ritual.expected.stakeMint), undefined, undefined],
    ['wrong mint', nonzeroWrong, undefined, 'invariant'],
    ['non-PublicKey mint', 'not-a-key', undefined, 'invariant'],
  ])('expectedMint %s', (_name, key, _unused, category) => {
    if (category) expectCategory(() => decode(source(), key), category)
    else expect(decode(source(), key).status).toBe('Active')
  })
  it.each([
    ['canonical ritual', undefined, (() => { const b = source(); return ritualPda(creator(), u64(b, offsets.creator + 32), programId)[0] })(), undefined],
    ['wrong ritual', undefined, nonzeroWrong, 'invariant'],
    ['non-PublicKey ritual', undefined, 'not-a-key', 'input'],
  ])('expectedRitual %s', (_name, mint, ritual, category) => {
    if (category) expectCategory(() => decode(source(), mint, ritual), category)
    else expect(decode(source(), mint, ritual).status).toBe('Active')
  })

  it.each([
    ['protocol wrong', offsets.protocol, 'key'], ['stake vault wrong', offsets.stakeVault, 'key'], ['fee vault wrong', offsets.feeVault, 'key'],
    ['stake vault bump wrong', offsets.stakeVaultBump, 'bump'], ['fee vault bump wrong', offsets.feeVaultBump, 'bump'], ['ritual bump wrong', offsets.bump, 'bump'],
  ])('canonical PDA %s is an invariant rejection', (_name, offset, kind) => {
    const b = activeBase(); if (kind === 'key') putKey(b, offset, nonzeroWrong); else b[offset] ^= 1
    expectReject(() => decode(b))
  })

  it.each([
    ['bitmap0 count0 stake0 fee0', 0, 0, 0n, 0n], ['creator bit0', 1, 1, 200n, 777n], ['noncreator bit1', 2, 1, 200n, 0n], ['bits0+2', 5, 2, 400n, 777n], ['full bitmap', 7, 3, 600n, 777n],
  ])('HOST Funding %s decodes exactly', (_name, bitmap, count, stake, fee) => {
    const b = fundingBase(); b[offsets.bitmap] = bitmap; b[offsets.count] = count; putU64(b, offsets.stake, stake); putU64(b, offsets.fundedFee, fee)
    const value = decode(b); expect(value.status).toBe('Funding'); expect(value.feePayerMode).toBe('Host'); expect(value.fundedMembersBitmap).toBe(bitmap); expect(value.fundedMemberCount).toBe(count); expect(value.fundedStakeTotal).toBe(BigInt(stake)); expect(value.fundedFeeTotal).toBe(BigInt(fee))
  })
  it('HOST fee follows encoded member index, not creator field position', () => {
    const b = fundingBase(); const member0 = b.slice(offsets.members, offsets.members + 32); const member1 = b.slice(offsets.members + 32, offsets.members + 64); b.set(member1, offsets.members); b.set(member0, offsets.members + 32)
    const creatorAtOne = mutate(() => b.slice(), x => { x[offsets.bitmap] = 2; x[offsets.count] = 1; putU64(x, offsets.stake, 200n); putU64(x, offsets.fundedFee, 777n) })
    const noncreatorAtZero = mutate(() => b.slice(), x => { x[offsets.bitmap] = 1; x[offsets.count] = 1; putU64(x, offsets.stake, 200n); putU64(x, offsets.fundedFee, 0n) })
    expect(decode(creatorAtOne).fundedFeeTotal).toBe(777n); expect(decode(noncreatorAtZero).fundedFeeTotal).toBe(0n); expect(decode(creatorAtOne).stakeVault).toEqual(decode(noncreatorAtZero).stakeVault)
  })

  it.each([
    ['bitmap1', 1, 1, 200n, 260n], ['bitmap2', 2, 1, 200n, 259n], ['bitmap4', 4, 1, 200n, 259n], ['bitmap3', 3, 2, 400n, 519n], ['full bitmap', 7, 3, 600n, 778n],
  ])('SPLIT Funding %s decodes exact remainder fee', (_name, bitmap, count, stake, fee) => {
    const b = fundingBase('Split'); b[offsets.bitmap] = bitmap; b[offsets.count] = count; putU64(b, offsets.stake, stake); putU64(b, offsets.fundedFee, fee)
    const value = decode(b); expect(value.status).toBe('Funding'); expect(value.feePayerMode).toBe('Split'); expect(value.lockedActivationFee).toBe(778n); expect(value.fundedFeeTotal).toBe(BigInt(fee))
  })
  it('SPLIT Active full state accepts its exact fee and remaining stake', () => {
    const b = activeBase(); b[offsets.mode] = 1; putU64(b, offsets.fee, 778n); putU64(b, offsets.fundedFee, 778n); putU64(b, offsets.stake, 600n)
    const value = decode(b); expect(value.status).toBe('Active'); expect(value.feePayerMode).toBe('Split'); expect(value.fundedFeeTotal).toBe(778n)
  })

  it.each([
    ['bitmap out of mask', (b: Uint8Array) => { b[offsets.bitmap] = 8 }], ['count mismatch', (b: Uint8Array) => { b[offsets.count] = 2 }], ['stake -1', (b: Uint8Array) => putU64(b, offsets.stake, 199n)], ['stake +1', (b: Uint8Array) => putU64(b, offsets.stake, 201n)], ['fee -1', (b: Uint8Array) => putU64(b, offsets.fundedFee, 776n)], ['fee +1', (b: Uint8Array) => putU64(b, offsets.fundedFee, 778n)],
    ['current1', (b: Uint8Array) => { b[offsets.current] = 1 }], ['settled1', (b: Uint8Array) => { b[offsets.settled] = 1 }], ['activated1', (b: Uint8Array) => putI64(b, offsets.activated, 1n)], ['cancelled1', (b: Uint8Array) => putI64(b, offsets.cancelled, 1n)], ['completed1', (b: Uint8Array) => putI64(b, offsets.completed, 1n)], ['vaultClosed1', (b: Uint8Array) => { b[offsets.closed] = 1 }],
  ])('HOST Funding independently rejects %s', (_name, change) => {
    const b = fundingBase(); b[offsets.bitmap] = 1; b[offsets.count] = 1; putU64(b, offsets.stake, 200n); putU64(b, offsets.fundedFee, 777n); change(b); expectReject(() => decode(b))
  })
  it.each([['fee -1', 259n], ['fee +1', 261n]])('SPLIT Funding independently rejects %s', (_name, fee) => { const b = fundingBase('Split'); b[offsets.bitmap] = 1; b[offsets.count] = 1; putU64(b, offsets.stake, 200n); putU64(b, offsets.fundedFee, fee); expectReject(() => decode(b)) })

  it.each([
    ['current0 remaining600', 0, 0, 600n], ['current1 remaining300', 1, 1, 300n],
  ])('Active accepts sequential state %s', (_name, current, settled, stake) => { const b = activeBase(); b[offsets.current] = current; b[offsets.settled] = settled; putU64(b, offsets.stake, stake); expect(decode(b).status).toBe('Active') })
  it.each([
    ['partial bitmap', (b: Uint8Array) => { b[offsets.bitmap] = 3 }], ['count2', (b: Uint8Array) => { b[offsets.count] = 2 }], ['fundedFee776', (b: Uint8Array) => putU64(b, offsets.fundedFee, 776n)], ['stake599', (b: Uint8Array) => putU64(b, offsets.stake, 599n)], ['stake601', (b: Uint8Array) => putU64(b, offsets.stake, 601n)], ['current1 settled0', (b: Uint8Array) => { b[offsets.current] = 1; b[offsets.settled] = 0 }], ['current2 end', (b: Uint8Array) => { b[offsets.current] = 2; b[offsets.settled] = 2 }], ['settled1 current0', (b: Uint8Array) => { b[offsets.settled] = 1 }], ['activated0', (b: Uint8Array) => putI64(b, offsets.activated, 0n)], ['activated9', (b: Uint8Array) => putI64(b, offsets.activated, 9n)], ['cancelled1', (b: Uint8Array) => putI64(b, offsets.cancelled, 1n)], ['completed1', (b: Uint8Array) => putI64(b, offsets.completed, 1n)], ['vaultClosed1', (b: Uint8Array) => { b[offsets.closed] = 1 }],
  ])('Active independently rejects %s', (_name, change) => { const b = activeBase(); change(b); expectReject(() => decode(b)) })

  it.each([false, true])('Completed accepts vaultClosed=%s', closed => expect(decode(completedBase(closed)).status).toBe('Completed'))
  it.each([
    ['partial bitmap', (b: Uint8Array) => { b[offsets.bitmap] = 3 }], ['count2', (b: Uint8Array) => { b[offsets.count] = 2 }], ['fee776', (b: Uint8Array) => putU64(b, offsets.fundedFee, 776n)], ['current1', (b: Uint8Array) => { b[offsets.current] = 1 }], ['settled1', (b: Uint8Array) => { b[offsets.settled] = 1 }], ['stake1', (b: Uint8Array) => putU64(b, offsets.stake, 1n)], ['cancelled1', (b: Uint8Array) => putI64(b, offsets.cancelled, 1n)], ['activated0', (b: Uint8Array) => putI64(b, offsets.activated, 0n)], ['activated9', (b: Uint8Array) => putI64(b, offsets.activated, 9n)], ['completed0', (b: Uint8Array) => putI64(b, offsets.completed, 0n)], ['completed19', (b: Uint8Array) => putI64(b, offsets.completed, 19n)],
  ])('Completed independently rejects %s', (_name, change) => { const b = completedBase(false); change(b); expectReject(() => decode(b)) })

  it.each([false, true])('Cancelled accepts vaultClosed=%s', closed => expect(decode(cancelledBase(closed)).status).toBe('Cancelled'))
  it.each([
    ['current1', (b: Uint8Array) => { b[offsets.current] = 1 }], ['settled1', (b: Uint8Array) => { b[offsets.settled] = 1 }], ['bitmap1', (b: Uint8Array) => { b[offsets.bitmap] = 1 }], ['count1', (b: Uint8Array) => { b[offsets.count] = 1 }], ['stake1', (b: Uint8Array) => putU64(b, offsets.stake, 1n)], ['fee1', (b: Uint8Array) => putU64(b, offsets.fundedFee, 1n)], ['activated1', (b: Uint8Array) => putI64(b, offsets.activated, 1n)], ['completed1', (b: Uint8Array) => putI64(b, offsets.completed, 1n)], ['cancelled0', (b: Uint8Array) => putI64(b, offsets.cancelled, 0n)], ['cancelled9', (b: Uint8Array) => putI64(b, offsets.cancelled, 9n)],
  ])('Cancelled independently rejects %s', (_name, change) => { const b = cancelledBase(false); change(b); expectReject(() => decode(b)) })

  it.each([0, 2])('schema %s rejects with stable schema category', schema => { const b = source(); b[offsets.schema] = schema; expectCategory(() => decode(b), 'schema') })
  it.each([memberCount() - 1, memberCount()])('threshold %s is bounded by N-1', threshold => { const b = activeBase(); b[offsets.threshold] = threshold; if (threshold === memberCount()) expectReject(() => decode(b)); else expect(decode(b).additionalConfirmationThreshold).toBe(threshold) })
  it('accepts adjacent schedule at 301 and rejects overlap at 300', () => { const accepted = activeBase(); putI64(accepted, offsets.windows + 24, 301n); expect(decode(accepted).status).toBe('Active'); const rejected = activeBase(); putI64(rejected, offsets.windows + 24, 300n); expectReject(() => decode(rejected)) })
  it.each([
    ['member total mismatch', (b: Uint8Array) => putU64(b, offsets.memberTotal, 201n), 'invariant'], ['allocation mismatch', (b: Uint8Array) => putU64(b, offsets.allocation, 101n), 'invariant'], ['invalid status', (b: Uint8Array) => { b[offsets.status] = 4 }, 'invalid-enum'], ['invalid vault bool', (b: Uint8Array) => { b[offsets.closed] = 2 }, 'invalid-bool'],
  ])('common field %s is a stable category rejection', (_name, change, category) => { const b = activeBase(); change(b); expectCategory(() => decode(b), category) })
})
