import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { MAX_U64 } from './money'
import { previewEventSettlement } from './index'
import type { ClaimStatus, MemberEventSettlementInput, MemberIndex, PublicKeyText } from './index'

const key = (index: number): PublicKeyText => new PublicKey(new Uint8Array(32).fill(index + 1)).toBase58() as PublicKeyText

const member = (memberKey: string, index: number, claimStatus: ClaimStatus | string): MemberEventSettlementInput => ({
  member: memberKey as PublicKeyText,
  memberIndex: index as MemberIndex,
  claimStatus: claimStatus as ClaimStatus,
})

const membersFor = (statuses: readonly (ClaimStatus | string)[], order = statuses.map((_, index) => index)) =>
  order.map((index) => member(key(index), index, statuses[index]))

const payoutTotal = (result: Extract<ReturnType<typeof previewEventSettlement>, { kind: 'SETTLED' }>) =>
  result.payouts.reduce((sum, payout) => sum + payout.total, 0n)

const refundTotal = (result: Extract<ReturnType<typeof previewEventSettlement>, { kind: 'VOIDED' }>) =>
  result.refunds.reduce((sum, refund) => sum + refund.amount, 0n)

describe('previewEventSettlement', () => {
  it('splits a four-member event with deterministic index-first remainder allocation', () => {
    const result = previewEventSettlement(5n, [
      member(key(2), 2, 'CONFIRMED'),
      member(key(0), 0, 'CONFIRMED'),
      member(key(3), 3, 'UNCLAIMED'),
      member(key(1), 1, 'CONFIRMED'),
    ])

    expect(result).toEqual({
      kind: 'SETTLED',
      payouts: [
        { member: key(0), memberIndex: 0, principal: 5n, bonus: 2n, total: 7n },
        { member: key(1), memberIndex: 1, principal: 5n, bonus: 2n, total: 7n },
        { member: key(2), memberIndex: 2, principal: 5n, bonus: 1n, total: 6n },
      ],
      forfeited: 5n,
    })
    if (result.kind === 'SETTLED') expect(payoutTotal(result)).toBe(20n)
  })

  it('returns every member with principal and no bonus when all complete', () => {
    const result = previewEventSettlement(9n, membersFor(['CONFIRMED', 'CONFIRMED', 'CONFIRMED']))
    expect(result).toEqual({
      kind: 'SETTLED',
      payouts: [
        { member: key(0), memberIndex: 0, principal: 9n, bonus: 0n, total: 9n },
        { member: key(1), memberIndex: 1, principal: 9n, bonus: 0n, total: 9n },
        { member: key(2), memberIndex: 2, principal: 9n, bonus: 0n, total: 9n },
      ],
      forfeited: 0n,
    })
  })

  it('gives the entire event pool to the one confirmed member', () => {
    const result = previewEventSettlement(11n, membersFor(['UNCLAIMED', 'CONFIRMED', 'UNCLAIMED']))
    expect(result).toEqual({
      kind: 'SETTLED',
      payouts: [{ member: key(1), memberIndex: 1, principal: 11n, bonus: 22n, total: 33n }],
      forfeited: 22n,
    })
  })

  it('voids safely with refunds when nobody confirms', () => {
    expect(previewEventSettlement(7n, membersFor(['UNCLAIMED', 'UNCLAIMED']))).toEqual({
      kind: 'VOIDED',
      reason: 'NO_CONFIRMED_MEMBERS',
      refunds: [
        { member: key(0), memberIndex: 0, amount: 7n },
        { member: key(1), memberIndex: 1, amount: 7n },
      ],
    })
  })

  it.each(['PENDING', 'QUESTIONED'] as const)('voids all members for a %s claim', (unresolved) => {
    const result = previewEventSettlement(7n, membersFor(['CONFIRMED', unresolved, 'UNCLAIMED']))
    expect(result).toEqual({
      kind: 'VOIDED',
      reason: 'UNRESOLVED_CLAIMS',
      refunds: [
        { member: key(0), memberIndex: 0, amount: 7n },
        { member: key(1), memberIndex: 1, amount: 7n },
        { member: key(2), memberIndex: 2, amount: 7n },
      ],
    })
  })

  it('gives unresolved claims precedence over the no-confirmed reason', () => {
    expect(previewEventSettlement(3n, membersFor(['UNCLAIMED', 'PENDING']))).toMatchObject({
      kind: 'VOIDED',
      reason: 'UNRESOLVED_CLAIMS',
    })
  })

  it('assigns every remainder by confirmed memberIndex, not input order', () => {
    const result = previewEventSettlement(1n, [
      member(key(4), 4, 'CONFIRMED'),
      member(key(1), 1, 'UNCLAIMED'),
      member(key(3), 3, 'CONFIRMED'),
      member(key(0), 0, 'UNCLAIMED'),
      member(key(2), 2, 'CONFIRMED'),
    ])
    expect(result.kind).toBe('SETTLED')
    if (result.kind === 'SETTLED') {
      expect(result.payouts).toEqual([
        { member: key(2), memberIndex: 2, principal: 1n, bonus: 1n, total: 2n },
        { member: key(3), memberIndex: 3, principal: 1n, bonus: 1n, total: 2n },
        { member: key(4), memberIndex: 4, principal: 1n, bonus: 0n, total: 1n },
      ])
    }
  })

  it('covers every member count and confirmed-count policy combination', () => {
    for (let count = 2; count <= 6; count += 1) {
      for (let confirmedCount = 0; confirmedCount <= count; confirmedCount += 1) {
        const statuses = Array.from({ length: count }, (_, index) => index < confirmedCount ? 'CONFIRMED' : 'UNCLAIMED')
        const allocation = BigInt(count + 1)
        const result = previewEventSettlement(allocation, membersFor(statuses).reverse())
        if (confirmedCount === 0) {
          expect(result.kind).toBe('VOIDED')
          if (result.kind === 'VOIDED') {
            expect(result.refunds).toHaveLength(count)
            expect(refundTotal(result)).toBe(allocation * BigInt(count))
          }
        } else {
          expect(result.kind).toBe('SETTLED')
          if (result.kind === 'SETTLED') {
            expect(result.payouts).toHaveLength(confirmedCount)
            expect(result.forfeited).toBe(allocation * BigInt(count - confirmedCount))
            expect(payoutTotal(result)).toBe(allocation * BigInt(count))
          }
        }
      }
    }
  })

  it('rejects duplicate keys and duplicate, missing, or noncontiguous indices', () => {
    expect(() => previewEventSettlement(1n, [member(key(0), 0, 'CONFIRMED'), member(key(0), 1, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(1n, [member(key(0), 0, 'CONFIRMED'), member(key(1), 0, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(1n, [member(key(0), 0, 'CONFIRMED'), member(key(1), 2, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(1n, [member(key(0), -1, 'CONFIRMED'), member(key(1), 0, 'CONFIRMED')])).toThrow(RangeError)
  })

  it.each([
    ['empty string member key', ''],
    ['malformed member key', 'not-a-public-key'],
    ['non-string member key', 42],
    ['object member key', {}],
  ])('rejects %s with a stable RangeError', (_label, memberKey) => {
    expect(() => previewEventSettlement(1n, [
      { member: memberKey as PublicKeyText, memberIndex: 0 as MemberIndex, claimStatus: 'CONFIRMED' },
      member(key(1), 1, 'CONFIRMED'),
    ])).toThrow(new RangeError('member must be a canonical Solana public key'))
  })

  it.each([
    ['non-array members', null, 'members must be an array'],
    ['null member entry', [null, member(key(1), 1, 'CONFIRMED')], 'member entries must be non-null objects'],
    ['non-object member entry', ['entry', member(key(1), 1, 'CONFIRMED')], 'member entries must be non-null objects'],
    ['array member entry', [[member(key(0), 0, 'CONFIRMED')], member(key(1), 1, 'CONFIRMED')], 'member entries must be non-null objects'],
  ])('rejects %s with a stable RangeError', (_label, invalidMembers, message) => {
    expect(() => previewEventSettlement(1n, invalidMembers as never)).toThrow(new RangeError(message))
  })

  it('rejects invalid member sizes, allocation values, pool overflow, and runtime statuses', () => {
    expect(() => previewEventSettlement(1n, [member(key(0), 0, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(1n, Array.from({ length: 7 }, (_, index) => member(key(index), index, 'CONFIRMED')))).toThrow(RangeError)
    expect(() => previewEventSettlement(-1n, [member(key(0), 0, 'CONFIRMED'), member(key(1), 1, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(MAX_U64 + 1n, [member(key(0), 0, 'CONFIRMED'), member(key(1), 1, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(MAX_U64, [member(key(0), 0, 'CONFIRMED'), member(key(1), 1, 'CONFIRMED')])).toThrow(RangeError)
    expect(() => previewEventSettlement(1n, [member(key(0), 0, 'BOGUS'), member(key(1), 1, 'CONFIRMED')])).toThrow(RangeError)
  })

  it('rejects a zero allocation before planning a settlement', () => {
    const input = [member(key(1), 1, 'CONFIRMED'), member(key(0), 0, 'UNCLAIMED')]
    expect(() => previewEventSettlement(0n, input)).toThrow(
      new RangeError('perEventAllocation must be a positive unsigned u64 atomic-unit amount'),
    )
  })

  it('exports the preview API from the rituals barrel', () => {
    expect(typeof previewEventSettlement).toBe('function')
  })
})
