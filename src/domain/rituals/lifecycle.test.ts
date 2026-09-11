import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  LifecycleGuardError, assertCanActivateRitual, assertCanCloseRitual, assertCanEditRitualTerms,
  assertCanFinalizeAsSettled, assertEventTransition, approveCompletionClaim,
  deriveSafeEventFinalizationKind, openCompletionClaim,
} from './lifecycle'
import type { ClaimStatus, PublicKeyText } from './types'

const key = (n: number): PublicKeyText => new PublicKey(new Uint8Array(32).fill(n)).toBase58() as PublicKeyText
const members = [key(1), key(2), key(3), key(4), key(5), key(6)]
const expectGuard = (fn: () => unknown) => expect(fn).toThrow(LifecycleGuardError)

describe('terms and activation', () => {
  it.each(['FUNDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const)('rejects term edits in %s', (status) => expectGuard(() => assertCanEditRitualTerms(status)))
  it.each([2, 3, 6] as const)('activates exactly fully funded groups of %s', (n) => expect(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount: n, fundedMemberCount: n })).not.toThrow())
  it.each(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const)('rejects activation from %s', (status) => expectGuard(() => assertCanActivateRitual({ status, acceptedMemberCount: 2, fundedMemberCount: 2 })))
  it.each([0, 1, 7, 2.5, Number.MAX_SAFE_INTEGER + 1] as const)('rejects accepted count %s', (n) => expectGuard(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount: n, fundedMemberCount: 0 })))
  it.each([0, 1, 2] as const)('rejects partial funding %s of 3', (n) => expectGuard(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount: 3, fundedMemberCount: n })))
})

describe('claim window', () => {
  const base = { ritualStatus: 'ACTIVE' as const, eventStatus: 'CLAIMING' as const, currentClaimStatus: 'UNCLAIMED' as const, now: 10, claimOpensAt: 10, claimDeadlineAt: 20, fundedMemberCount: 2 }
  it('opens inclusively and honors threshold zero', () => expect(openCompletionClaim({ ...base, requiredAdditionalConfirmations: 0 })).toBe('CONFIRMED'))
  it('opens pending for peer threshold and at deadline', () => expect(openCompletionClaim({ ...base, now: 20, requiredAdditionalConfirmations: 1 })).toBe('PENDING'))
  it.each([['DRAFT', 'CLAIMING'], ['ACTIVE', 'SCHEDULED'], ['ACTIVE', 'RESOLVING']] as const)('rejects wrong state %s/%s', (ritualStatus, eventStatus) => expectGuard(() => openCompletionClaim({ ...base, ritualStatus, eventStatus, requiredAdditionalConfirmations: 1 })))
  it.each([9, 21, -1, 1.1, Number.MAX_SAFE_INTEGER + 1] as const)('rejects now %s', (now) => expectGuard(() => openCompletionClaim({ ...base, now, requiredAdditionalConfirmations: 1 })))
  it.each([[-1, 2], [2, 2], [1.5, 2], [0, 1], [1, 7]] as const)('rejects threshold/count boundary %s/%s', (threshold, count) => expectGuard(() => openCompletionClaim({ ...base, requiredAdditionalConfirmations: threshold, fundedMemberCount: count })))
})

describe('approvals', () => {
  const input = { claimant: members[0], eligibleFundedMembers: members.slice(0, 3), existingApprovals: [] as PublicKeyText[], requiredAdditionalConfirmations: 2, claimStatus: 'PENDING' as const }
  it('confirms exactly on the threshold transition without mutation', () => {
    const first = approveCompletionClaim({ ...input, approver: members[1] })
    expect(first).toEqual({ claimStatus: 'PENDING', approvals: [members[1]], thresholdReachedNow: false })
    const second = approveCompletionClaim({ ...input, approver: members[2], existingApprovals: first.approvals })
    expect(second).toEqual({ claimStatus: 'CONFIRMED', approvals: [members[1], members[2]], thresholdReachedNow: true })
    expect(input.existingApprovals).toEqual([])
    expect(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: [members[1], members[2]] })).toThrow()
  })
  it.each([[members[0], 'self'], [key(9), 'nonmember']] as const)('rejects %s claimant/approver misuse', (approver, _label) => expectGuard(() => approveCompletionClaim({ ...input, approver })))
  it('rejects duplicate approvals, questioned/confirmed claims, and honor', () => {
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: [members[1]] }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], claimStatus: 'CONFIRMED' }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], claimStatus: 'QUESTIONED' }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], requiredAdditionalConfirmations: 0 }))
  })
  it('rejects claimant as an existing approval and malformed arrays', () => {
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: [members[0]] }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: [members[1], members[1]] }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: [,] as unknown as PublicKeyText[] }))
  })
})

describe('finalization and transitions', () => {
  it.each([
    [['CONFIRMED', 'UNCLAIMED'], 'SETTLE'], [['CONFIRMED', 'CONFIRMED'], 'SETTLE'], [['UNCLAIMED', 'UNCLAIMED'], 'VOID'],
    [['PENDING', 'CONFIRMED'], 'VOID'], [['QUESTIONED', 'UNCLAIMED'], 'VOID'],
  ] as const)('derives %s as %s', (claims, kind) => expect(deriveSafeEventFinalizationKind(claims)).toBe(kind))
  it.each([['PENDING', 'UNCLAIMED'], ['QUESTIONED', 'CONFIRMED'], ['UNCLAIMED', 'UNCLAIMED']] as const)('does not settle %s', (...claims) => expectGuard(() => assertCanFinalizeAsSettled(claims as ClaimStatus[])))
  it.each([['SCHEDULED', 'CLAIMING'], ['CLAIMING', 'RESOLVING'], ['RESOLVING', 'SETTLED'], ['RESOLVING', 'VOIDED']] as const)('allows exact transition %s to %s', (from, to) => expect(() => assertEventTransition(from, to)).not.toThrow())
  it.each([['SCHEDULED', 'RESOLVING'], ['CLAIMING', 'SCHEDULED'], ['SETTLED', 'CLAIMING'], ['VOIDED', 'SCHEDULED'], ['CLAIMING', 'CLAIMING']] as const)('rejects transition %s to %s', (from, to) => expectGuard(() => assertEventTransition(from, to)))
  it('rejects unknown statuses at runtime', () => expectGuard(() => assertEventTransition('BOGUS' as never, 'CLAIMING')))
})

describe('closure', () => {
  it('allows completed final event with empty vault', () => expect(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 16, eventCount: 16, vaultBalance: 0n })).not.toThrow())
  it.each([
    { ritualStatus: 'ACTIVE', settledEventCount: 2, eventCount: 2, vaultBalance: 0n },
    { ritualStatus: 'COMPLETED', settledEventCount: 1, eventCount: 2, vaultBalance: 0n },
    { ritualStatus: 'COMPLETED', settledEventCount: 2, eventCount: 2, vaultBalance: 1n },
    { ritualStatus: 'COMPLETED', settledEventCount: 2, eventCount: 2, vaultBalance: -1n },
    { ritualStatus: 'COMPLETED', settledEventCount: 2, eventCount: 2, vaultBalance: 18_446_744_073_709_551_616n },
  ] as const)('rejects unsafe close %#', (input) => expectGuard(() => assertCanCloseRitual(input)))
})
