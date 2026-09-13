import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitualEvent, RitualAccountDecodeError } from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, hexToBytes } from './__fixtures__/accountVectors'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const source = () => hexToBytes(accountVectors.ritualEvent.hex)
const decode = (bytes: Uint8Array) => decodeRitualEvent({ owner: programId, data: bytes }, programId)
const putI64 = (bytes: Uint8Array, offset: number, value: bigint) => {
  for (let i = 0; i < 8; i += 1) bytes[offset + i] = Number((value >> BigInt(i * 8)) & 255n)
}
const putU8 = (bytes: Uint8Array, offset: number, value: number) => { bytes[offset] = value }
const expectCategory = (action: () => unknown, category: string) => {
  try { action(); throw new Error('expected decoder rejection') } catch (error) {
    expect(error).toBeInstanceOf(RitualAccountDecodeError)
    expect((error as RitualAccountDecodeError).category).toBe(category)
  }
}

// 8 discriminator + fields in the exact Anchor/Borsh order.
const O = { schema: 8, ritual: 9, eventIndex: 41, opens: 42, deadline: 50, resolution: 58, members: 66, status: 67, claimed: 68, confirmed: 69, questioned: 70, initialized: 71, resolved: 79, settlementVersion: 87, voidReason: 88, pool: 89, forfeited: 97, payout: 105, refunded: 113, count: 121, remainder: 122, remaining: 130, bump: 138 }

describe('RitualEvent exact reachable-state decoder matrix', () => {
  it('derives the 139-byte layout and accepts the source Claiming receipt', () => {
    const bytes = source()
    expect(bytes).toHaveLength(139)
    const value = decode(bytes)
    expect(value.window.opens).toBe(100n)
    expect(Array.from(bytes.slice(O.opens, O.opens + 8))).toEqual([100, 0, 0, 0, 0, 0, 0, 0])
    expect(value.status).toBe('Claiming')
    expect(Object.isFrozen(value)).toBe(true)
  })

  it.each([
    ['Scheduled', 0, 0, 0, 0, 0],
    ['Claiming pending', 1, 2, 0, 0, 0],
    ['Claiming confirmed receipt', 1, 2, 2, 0, 0],
    ['Resolving questioned', 2, 2, 0, 2, 0],
  ])('%s is accepted with only lifecycle-reachable receipt fields', (_name, status, claimed, confirmed, questioned, count) => {
    const bytes = source(); putU8(bytes, O.status, status); putU8(bytes, O.claimed, claimed); putU8(bytes, O.confirmed, confirmed); putU8(bytes, O.questioned, questioned); putU8(bytes, O.count, count)
    expect(decode(bytes).status).toBe(_name.startsWith('Scheduled') ? 'Scheduled' : _name.startsWith('Resolving') ? 'Resolving' : 'Claiming')
  })

  it('accepts settled one-confirmed and both void-reason terminal variants', () => {
    const settled = source(); putU8(settled, O.status, 3); putU8(settled, O.claimed, 2); putU8(settled, O.confirmed, 2); putU8(settled, O.count, 1); putU8(settled, O.settlementVersion, 1); putI64(settled, O.resolved, 301n); putU8(settled, O.voidReason, 0); putI64(settled, O.pool, 200n); putI64(settled, O.forfeited, 100n); putI64(settled, O.payout, 200n)
    expect(decode(settled).status).toBe('Settled')
    const unresolved = source(); putU8(unresolved, O.status, 4); putU8(unresolved, O.settlementVersion, 1); putU8(unresolved, O.voidReason, 2); putI64(unresolved, O.resolved, 301n); putI64(unresolved, O.pool, 200n); putI64(unresolved, O.refunded, 200n)
    expect(decode(unresolved).voidReason).toBe('UnresolvedClaims')
    const noConfirmed = source(); putU8(noConfirmed, O.status, 4); putU8(noConfirmed, O.claimed, 0); putU8(noConfirmed, O.settlementVersion, 1); putU8(noConfirmed, O.voidReason, 1); putI64(noConfirmed, O.resolved, 301n); putI64(noConfirmed, O.pool, 200n); putI64(noConfirmed, O.refunded, 200n)
    expect(decode(noConfirmed).voidReason).toBe('NoConfirmedMembers')
  })

  it('rejects negative opens after proving its exact i64 bytes and decoded baseline', () => {
    const baseline = source(); expect(decode(baseline).window.opens).toBe(100n)
    const mutated = source(); putI64(mutated, O.opens, -1n)
    expect(Array.from(mutated.slice(O.opens, O.opens + 8))).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
    expectCategory(() => decode(mutated), 'invariant')
  })

  it.each([
    ['invalid status', O.status, 5, 'invalid-enum'], ['invalid void reason', O.voidReason, 3, 'invalid-enum'], ['schema 2', O.schema, 2, 'schema'],
    ['default ritual', O.ritual, 0, 'invariant'], ['event index 16', O.eventIndex, 16, 'invariant'], ['member count 1', O.members, 1, 'invariant'],
    ['claimed bit outside mask', O.claimed, 8, 'invariant'], ['confirmed not claimed', O.confirmed, 1, 'invariant'], ['questioned not claimed', O.questioned, 1, 'invariant'],
 ])('%s is fail-closed', (_name, offset, value, category) => {
 const bytes = source(); if (_name === 'default ritual') bytes.fill(0, O.ritual, O.ritual + 32); else putU8(bytes, offset, value); expectCategory(() => decode(bytes), category)
 })

 it('rejects confirmed/questioned overlap', () => { const bytes = source(); putU8(bytes, O.confirmed, 2); putU8(bytes, O.questioned, 2); expectCategory(() => decode(bytes), 'invariant') })

  it('rejects every nonterminal receipt field when nonzero', () => {
    const cases: Array<[string, (b: Uint8Array) => void]> = [
      ['event pool', b => putI64(b, O.pool, 1n)], ['forfeited', b => putI64(b, O.forfeited, 1n)], ['payout', b => putI64(b, O.payout, 1n)],
      ['refunded', b => putI64(b, O.refunded, 1n)], ['confirmed member count', b => putU8(b, O.count, 1)], ['remainder', b => putI64(b, O.remainder, 1n)],
      ['remaining after', b => putI64(b, O.remaining, 1n)], ['settlement version', b => putU8(b, O.settlementVersion, 1)], ['resolved at', b => putI64(b, O.resolved, 301n)],
      ['void reason', b => putU8(b, O.voidReason, 1)],
    ]
    for (const [_name, mutate] of cases) expectCategory(() => { const b = source(); mutate(b); decode(b) }, 'invariant')
  })

  const settledBase = () => {
    const b = source(); putU8(b, O.members, 2); putU8(b, O.status, 3); putU8(b, O.claimed, 3); putU8(b, O.confirmed, 3); putU8(b, O.questioned, 0); putU8(b, O.count, 2); putU8(b, O.settlementVersion, 1); putI64(b, O.resolved, 301n); putI64(b, O.pool, 200n); putI64(b, O.forfeited, 0n); putI64(b, O.payout, 200n); return b
  }
  const voidedBase = () => {
    const b = source(); putU8(b, O.status, 4); putU8(b, O.claimed, 2); putU8(b, O.confirmed, 0); putU8(b, O.questioned, 0); putU8(b, O.count, 0); putU8(b, O.settlementVersion, 1); putU8(b, O.voidReason, 2); putI64(b, O.resolved, 301n); putI64(b, O.pool, 200n); putI64(b, O.refunded, 200n); return b
  }

  it.each([
    ['resolved at boundary', (b: Uint8Array) => putI64(b, O.resolved, 100n)], ['resolved before resolution', (b: Uint8Array) => putI64(b, O.resolved, 99n)],
    ['initialized after resolved', (b: Uint8Array) => putI64(b, O.initialized, 302n)], ['event pool zero', (b: Uint8Array) => putI64(b, O.pool, 0n)],
    ['claimed differs from confirmed', (b: Uint8Array) => putU8(b, O.claimed, 1)], ['questioned nonzero', (b: Uint8Array) => putU8(b, O.questioned, 1)],
    ['confirmed count zero', (b: Uint8Array) => putU8(b, O.count, 0)], ['confirmed count mismatch', (b: Uint8Array) => putU8(b, O.count, 1)],
    ['void reason nonzero', (b: Uint8Array) => putU8(b, O.voidReason, 1)], ['payout differs from pool', (b: Uint8Array) => putI64(b, O.payout, 199n)],
    ['refund nonzero', (b: Uint8Array) => putI64(b, O.refunded, 1n)], ['forfeited exceeds pool', (b: Uint8Array) => putI64(b, O.forfeited, 201n)],
    ['remainder reaches count', (b: Uint8Array) => putI64(b, O.remainder, 2n)], ['all confirmed with forfeiture', (b: Uint8Array) => putI64(b, O.forfeited, 1n)],
    ['all confirmed with remainder', (b: Uint8Array) => putI64(b, O.remainder, 1n)], ['partial confirmed without forfeiture', (b: Uint8Array) => { putU8(b, O.claimed, 3); putU8(b, O.confirmed, 1); putU8(b, O.count, 1) }],
  ])('settled %s is rejected', (_name, mutate) => expectCategory(() => { const b = settledBase(); mutate(b); decode(b) }, 'invariant'))

  it.each([
    ['payout', (b: Uint8Array) => putI64(b, O.payout, 1n)], ['refund mismatch', (b: Uint8Array) => putI64(b, O.refunded, 199n)],
    ['forfeited', (b: Uint8Array) => putI64(b, O.forfeited, 1n)], ['remainder', (b: Uint8Array) => putI64(b, O.remainder, 1n)],
    ['reason mismatch', (b: Uint8Array) => putU8(b, O.voidReason, 1)], ['count mismatch', (b: Uint8Array) => putU8(b, O.count, 1)],
    ['bitmap mismatch', (b: Uint8Array) => putU8(b, O.confirmed, 1)],
  ])('voided %s is rejected', (_name, mutate) => expectCategory(() => { const b = voidedBase(); mutate(b); decode(b) }, 'invariant'))

  it.each([
    ['Claiming', 1], ['Scheduled', 0], ['Resolving', 2],
  ])('%s rejects every terminal void reason', (_name, status) => {
    for (const reason of [1, 2]) expectCategory(() => { const b = source(); putU8(b, O.status, status); putU8(b, O.claimed, 0); putU8(b, O.confirmed, 0); putU8(b, O.questioned, 0); putU8(b, O.voidReason, reason); decode(b) }, 'invariant')
  })

  it.each([
    ['voided None with unresolved claims', (b: Uint8Array) => putU8(b, O.voidReason, 0)],
    ['voided NoConfirmedMembers with unresolved claims', (b: Uint8Array) => putU8(b, O.voidReason, 1)],
    ['voided UnresolvedClaims without unresolved claims', (b: Uint8Array) => { putU8(b, O.claimed, 0); putU8(b, O.voidReason, 2) }],
    ['voided None without unresolved claims', (b: Uint8Array) => { putU8(b, O.claimed, 0); putU8(b, O.voidReason, 0) }],
  ])('%s is rejected', (_name, mutate) => expectCategory(() => { const b = voidedBase(); mutate(b); decode(b) }, 'invariant'))
})
