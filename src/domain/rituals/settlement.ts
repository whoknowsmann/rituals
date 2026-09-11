import { MAX_U64, splitAtomicUnits } from './money'
import { CLAIM_STATUSES } from './types'
import type { ClaimStatus, MemberIndex, PublicKeyText } from './types'

export interface MemberEventSettlementInput {
  readonly member: PublicKeyText
  readonly memberIndex: MemberIndex
  readonly claimStatus: ClaimStatus
}

export interface MemberPayout {
  readonly member: PublicKeyText
  readonly memberIndex: MemberIndex
  readonly principal: bigint
  readonly bonus: bigint
  readonly total: bigint
}

export interface MemberRefund {
  readonly member: PublicKeyText
  readonly memberIndex: MemberIndex
  readonly amount: bigint
}

export type VoidReason = 'NO_CONFIRMED_MEMBERS' | 'UNRESOLVED_CLAIMS'

export type SettlementPreview =
  | { readonly kind: 'SETTLED'; readonly payouts: readonly MemberPayout[]; readonly forfeited: bigint }
  | { readonly kind: 'VOIDED'; readonly refunds: readonly MemberRefund[]; readonly reason: VoidReason }

function assertAllocation(value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) {
    throw new RangeError('perEventAllocation must be an unsigned u64 atomic-unit amount')
  }
}

function assertMembers(members: readonly MemberEventSettlementInput[]): void {
  if (!Number.isInteger(members.length) || members.length < 2 || members.length > 6) {
    throw new RangeError('members must contain between 2 and 6 entries')
  }
  const keys = new Set<PublicKeyText>()
  const indices = new Set<number>()
  for (const entry of members) {
    if (keys.has(entry.member)) throw new RangeError('member keys must be unique')
    keys.add(entry.member)
    if (!Number.isSafeInteger(entry.memberIndex)) throw new RangeError('memberIndex must be a safe integer')
    if (indices.has(entry.memberIndex)) throw new RangeError('memberIndex values must be unique')
    indices.add(entry.memberIndex)
    if (!CLAIM_STATUSES.includes(entry.claimStatus)) throw new RangeError('claimStatus is invalid')
  }
  for (let index = 0; index < members.length; index += 1) {
    if (!indices.has(index)) throw new RangeError('memberIndex values must be contiguous from zero')
  }
}

export function previewEventSettlement(
  perEventAllocation: bigint,
  members: readonly MemberEventSettlementInput[],
): SettlementPreview {
  assertAllocation(perEventAllocation)
  assertMembers(members)
  const memberCount = BigInt(members.length)
  const pool = perEventAllocation * memberCount
  if (pool > MAX_U64) throw new RangeError('event pool exceeds unsigned u64 range')

  const orderedMembers = [...members].sort((left, right) => left.memberIndex - right.memberIndex)
  const refunds = orderedMembers.map(({ member, memberIndex }) => ({
    member,
    memberIndex,
    amount: perEventAllocation,
  }))
  if (orderedMembers.some(({ claimStatus }) => claimStatus === 'PENDING' || claimStatus === 'QUESTIONED')) {
    return { kind: 'VOIDED', refunds, reason: 'UNRESOLVED_CLAIMS' }
  }

  const confirmed = orderedMembers.filter(({ claimStatus }) => claimStatus === 'CONFIRMED')
  if (confirmed.length === 0) return { kind: 'VOIDED', refunds, reason: 'NO_CONFIRMED_MEMBERS' }

  const unclaimedCount = orderedMembers.filter(({ claimStatus }) => claimStatus === 'UNCLAIMED').length
  const forfeited = perEventAllocation * BigInt(unclaimedCount)
  const bonuses = splitAtomicUnits(forfeited, confirmed.map(({ member }) => member))

  return {
    kind: 'SETTLED',
    payouts: confirmed.map(({ member, memberIndex }) => {
      const bonus = bonuses.get(member) ?? 0n

      return { member, memberIndex, principal: perEventAllocation, bonus, total: perEventAllocation + bonus }
    }),
    forfeited,
  }
}
