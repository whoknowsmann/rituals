import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeCompletionClaim, RitualAccountDecodeError } from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, hexToBytes } from './__fixtures__/accountVectors'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const source = () => hexToBytes(accountVectors.completionClaim.hex)
const decode = (bytes: Uint8Array) => decodeCompletionClaim({ owner: programId, data: bytes }, programId)
const putU8 = (bytes: Uint8Array, offset: number, value: number) => { bytes[offset] = value }
const putI64 = (bytes: Uint8Array, offset: number, value: bigint) => { for (let i = 0; i < 8; i += 1) bytes[offset + i] = Number((value >> BigInt(i * 8)) & 255n) }
const O = { schema: 8, ritual: 9, event: 41, eventIndex: 73, claimant: 74, memberIndex: 106, version: 107, status: 108, threshold: 109, approvals: 110, count: 111, claimedAt: 112, bump: 120 }
const expectCategory = (action: () => unknown, category: string) => {
  try { action(); throw new Error('expected decoder rejection') } catch (error) {
    expect(error).toBeInstanceOf(RitualAccountDecodeError)
    expect((error as RitualAccountDecodeError).category).toBe(category)
  }
}

describe('CompletionClaim exact reachable-state decoder matrix', () => {
  it('derives the 121-byte layout and decodes the source Pending claim', () => {
    const bytes = source(); expect(bytes).toHaveLength(121)
    const value = decode(bytes); expect(value.status).toBe('Pending'); expect(value.approvalCount).toBe(1); expect(value.claimedAt).toBe(150n); expect(Object.isFrozen(value)).toBe(true)
  })

  it.each([
    ['Pending threshold 2/count 1', 0, 2, 1, 1],
    ['Confirmed threshold 0', 1, 0, 0, 0], ['Confirmed exact threshold', 1, 2, 5, 2],
    ['Questioned no approvals', 2, 2, 0, 0], ['Questioned partial approvals', 2, 3, 1, 1],
  ])('%s is accepted', (_name, status, threshold, approvals, count) => {
    const bytes = source(); putU8(bytes, O.status, status); putU8(bytes, O.threshold, threshold); putU8(bytes, O.approvals, approvals); putU8(bytes, O.count, count)
    expect(decode(bytes).status).toBe(_name.startsWith('Confirmed') ? 'Confirmed' : _name.startsWith('Questioned') ? 'Questioned' : 'Pending')
  })

  it.each([
    ['schema 2', O.schema, 2, 'schema'], ['default ritual', O.ritual, 0, 'invariant'], ['default event', O.event, 0, 'invariant'], ['event index 16', O.eventIndex, 16, 'invariant'],
    ['default claimant', O.claimant, 0, 'invariant'], ['member index 6', O.memberIndex, 6, 'invariant'], ['claim version 1', O.version, 1, 'invariant'], ['invalid status', O.status, 3, 'invalid-enum'],
    ['threshold 6', O.threshold, 6, 'invariant'], ['approval bit 6', O.approvals, 64, 'invariant'], ['approval bit 7', O.approvals, 128, 'invariant'], ['claimant self approval', O.approvals, 2, 'invariant'],
    ['claimed at zero', O.claimedAt, 0, 'invariant'],
  ])('%s is fail-closed', (_name, offset, value, category) => {
    const bytes = source(); if (_name === 'default ritual' || _name === 'default event' || _name === 'default claimant') bytes.fill(0, offset, offset + 32); else putU8(bytes, offset, value); expectCategory(() => decode(bytes), category)
  })

  it('rejects a negative claimedAt', () => { const bytes = source(); putI64(bytes, O.claimedAt, -1n); expectCategory(() => decode(bytes), 'invariant') })

  it.each([
    ['approval count mismatch', (b: Uint8Array) => putU8(b, O.count, 2)], ['pending threshold zero', (b: Uint8Array) => { putU8(b, O.status, 0); putU8(b, O.threshold, 0); putU8(b, O.approvals, 0); putU8(b, O.count, 0) }], ['pending threshold met', (b: Uint8Array) => { putU8(b, O.threshold, 1); putU8(b, O.approvals, 1); putU8(b, O.count, 1) }],
    ['confirmed below threshold', (b: Uint8Array) => { putU8(b, O.status, 1); putU8(b, O.threshold, 2); putU8(b, O.approvals, 1); putU8(b, O.count, 1) }],
    ['confirmed above threshold', (b: Uint8Array) => { putU8(b, O.status, 1); putU8(b, O.threshold, 1); putU8(b, O.approvals, 3); putU8(b, O.count, 2) }],
    ['questioned threshold zero', (b: Uint8Array) => { putU8(b, O.status, 2); putU8(b, O.threshold, 0); putU8(b, O.approvals, 0); putU8(b, O.count, 0) }],
    ['questioned reached threshold', (b: Uint8Array) => { putU8(b, O.status, 2); putU8(b, O.threshold, 2); putU8(b, O.approvals, 3); putU8(b, O.count, 2) }],
  ])('%s is rejected as an invariant relation', (_name, mutate) => expectCategory(() => { const bytes = source(); mutate(bytes); decode(bytes) }, 'invariant'))

  it('preserves arbitrary structural bump values', () => { const bytes = source(); putU8(bytes, O.bump, 0); expect(decode(bytes).bump).toBe(0) })
})
