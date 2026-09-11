import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  LifecycleGuardError, assertCanActivateRitual, assertCanCloseRitual, assertCanEditRitualTerms,
  assertCanFinalizeAsSettled, assertEventTransition, approveCompletionClaim,
  deriveSafeEventFinalizationKind, openCompletionClaim,
} from './lifecycle'
import * as barrel from './index'
import type { ClaimStatus, PublicKeyText } from './types'

const key = (n: number): PublicKeyText => new PublicKey(new Uint8Array(32).fill(n)).toBase58() as PublicKeyText
const members = [key(1), key(2), key(3), key(4), key(5), key(6)]
const expectGuard = (fn: () => unknown) => expect(fn).toThrow(LifecycleGuardError)
const unknownValue = (value: string): never => value as never
const malformedArray = <T>(kind: 'hole' | 'named' | 'symbol' | 'accessor', values?: T[]): T[] => {
  const source = values ?? ([members[0], members[1]] as unknown as T[])
  const result = source.slice()
  if (kind === 'hole') delete result[0]
  if (kind === 'named') Object.defineProperty(result, 'extra', { value: true, enumerable: true })
  if (kind === 'symbol') Object.defineProperty(result, Symbol('extra'), { value: true })
  if (kind === 'accessor') Object.defineProperty(result, '0', { get: () => source[0], enumerable: true })
  return result
}

const ritualStatuses = ['DRAFT', 'FUNDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const
const claimStatuses = ['UNCLAIMED', 'PENDING', 'CONFIRMED', 'QUESTIONED'] as const
const eventStatuses = ['SCHEDULED', 'CLAIMING', 'RESOLVING', 'SETTLED', 'VOIDED'] as const

 describe('terms and activation', () => {
  it('allows only DRAFT terms', () => {
    expect(() => assertCanEditRitualTerms('DRAFT')).not.toThrow()
    for (const status of ritualStatuses.filter((value) => value !== 'DRAFT')) expectGuard(() => assertCanEditRitualTerms(status))
    expectGuard(() => assertCanEditRitualTerms(unknownValue('UNKNOWN')))
  })

  it.each([2, 3, 4, 5, 6] as const)('activates exactly fully funded groups of %s', (n) => {
    expect(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount: n, fundedMemberCount: n })).not.toThrow()
  })

  it('rejects every non-FUNDING and unknown activation status', () => {
    for (const status of ritualStatuses.filter((value) => value !== 'FUNDING')) expectGuard(() => assertCanActivateRitual({ status, acceptedMemberCount: 2, fundedMemberCount: 2 }))
    expectGuard(() => assertCanActivateRitual({ status: unknownValue('UNKNOWN'), acceptedMemberCount: 2, fundedMemberCount: 2 }))
  })

  it.each([0, 1, 7, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects accepted count %s', (acceptedMemberCount) => {
    expectGuard(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount, fundedMemberCount: 0 }))
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects funded count %s', (fundedMemberCount) => {
    expectGuard(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount: 2, fundedMemberCount }))
  })

  it.each([[2, 0], [3, 1], [4, 3], [5, 4], [6, 5]] as const)('rejects partial funding %s/%s', (acceptedMemberCount, fundedMemberCount) => {
    expectGuard(() => assertCanActivateRitual({ status: 'FUNDING', acceptedMemberCount, fundedMemberCount }))
  })
})

describe('claim window', () => {
  const base = { ritualStatus: 'ACTIVE' as const, eventStatus: 'CLAIMING' as const, currentClaimStatus: 'UNCLAIMED' as const, now: 10, claimOpensAt: 10, claimDeadlineAt: 20, fundedMemberCount: 2 }

  it('accepts both inclusive window boundaries and returns threshold outcomes', () => {
    expect(openCompletionClaim({ ...base, now: 10, requiredAdditionalConfirmations: 0 })).toBe('CONFIRMED')
    expect(openCompletionClaim({ ...base, now: 20, requiredAdditionalConfirmations: 1 })).toBe('PENDING')
    expect(openCompletionClaim({ ...base, requiredAdditionalConfirmations: 1 })).toBe('PENDING')
  })

  it.each([2, 3, 4, 5, 6] as const)('accepts threshold boundaries for funded count %s', (fundedMemberCount) => {
    expect(openCompletionClaim({ ...base, fundedMemberCount, requiredAdditionalConfirmations: 0 })).toBe('CONFIRMED')
    expect(openCompletionClaim({ ...base, fundedMemberCount, requiredAdditionalConfirmations: fundedMemberCount - 1 })).toBe('PENDING')
  })

  it('rejects every wrong ritual, event, and current claim status', () => {
    for (const status of ritualStatuses.filter((value) => value !== 'ACTIVE')) expectGuard(() => openCompletionClaim({ ...base, ritualStatus: status, requiredAdditionalConfirmations: 1 }))
    for (const status of eventStatuses.filter((value) => value !== 'CLAIMING')) expectGuard(() => openCompletionClaim({ ...base, eventStatus: status, requiredAdditionalConfirmations: 1 }))
    for (const status of claimStatuses.filter((value) => value !== 'UNCLAIMED')) expectGuard(() => openCompletionClaim({ ...base, currentClaimStatus: status, requiredAdditionalConfirmations: 1 }))
    expectGuard(() => openCompletionClaim({ ...base, ritualStatus: unknownValue('UNKNOWN'), requiredAdditionalConfirmations: 1 }))
    expectGuard(() => openCompletionClaim({ ...base, eventStatus: unknownValue('UNKNOWN'), requiredAdditionalConfirmations: 1 }))
    expectGuard(() => openCompletionClaim({ ...base, currentClaimStatus: unknownValue('UNKNOWN'), requiredAdditionalConfirmations: 1 }))
  })

  it.each([9, 21] as const)('rejects one second outside the window: %s', (now) => expectGuard(() => openCompletionClaim({ ...base, now, requiredAdditionalConfirmations: 1 })))
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects invalid now %s', (now) => expectGuard(() => openCompletionClaim({ ...base, now, requiredAdditionalConfirmations: 1 })))
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects invalid claim opens %s', (claimOpensAt) => expectGuard(() => openCompletionClaim({ ...base, claimOpensAt, requiredAdditionalConfirmations: 1 })))
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects invalid claim deadline %s', (claimDeadlineAt) => expectGuard(() => openCompletionClaim({ ...base, claimDeadlineAt, requiredAdditionalConfirmations: 1 })))
  it('rejects equal or reversed claim windows', () => {
    expectGuard(() => openCompletionClaim({ ...base, claimOpensAt: 10, claimDeadlineAt: 10, requiredAdditionalConfirmations: 1 }))
    expectGuard(() => openCompletionClaim({ ...base, claimOpensAt: 20, claimDeadlineAt: 10, requiredAdditionalConfirmations: 1 }))
  })

  it.each([[-1, 2], [0.5, 2], [Number.NaN, 2], [Number.POSITIVE_INFINITY, 2], [Number.NEGATIVE_INFINITY, 2], [Number.MAX_SAFE_INTEGER + 1, 2], [1, 0], [1, 1], [1, 7]] as const)('rejects threshold/funded boundary %s/%s', (requiredAdditionalConfirmations, fundedMemberCount) => {
    expectGuard(() => openCompletionClaim({ ...base, requiredAdditionalConfirmations, fundedMemberCount }))
  })
})

describe('approvals', () => {
  const input = { claimant: members[0], eligibleFundedMembers: members.slice(0, 3), existingApprovals: [] as PublicKeyText[], requiredAdditionalConfirmations: 2, claimStatus: 'PENDING' as const }

  it('returns exactly one approval, confirms exactly at threshold, and does not mutate or alias inputs', () => {
    const existing = [] as PublicKeyText[]
    const first = approveCompletionClaim({ ...input, existingApprovals: existing, approver: members[1] })
    expect(first).toEqual({ claimStatus: 'PENDING', approvals: [members[1]], thresholdReachedNow: false })
    const second = approveCompletionClaim({ ...input, existingApprovals: first.approvals, approver: members[2] })
    expect(second).toEqual({ claimStatus: 'CONFIRMED', approvals: [members[1], members[2]], thresholdReachedNow: true })
    expect(existing).toEqual([])
    expect(second.approvals).not.toBe(first.approvals)
    expect(() => approveCompletionClaim({ ...input, existingApprovals: [members[1], members[2]], approver: members[1] })).toThrow()
  })

  it('rejects duplicate and malformed eligible member arrays', () => {
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], eligibleFundedMembers: [members[0], members[0]] }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], eligibleFundedMembers: ['not-a-key', members[1]] as never }))
    for (const kind of ['hole', 'named', 'symbol', 'accessor'] as const) expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], eligibleFundedMembers: malformedArray(kind) }))
  })

  it('rejects claimant and approver membership violations', () => {
    expectGuard(() => approveCompletionClaim({ ...input, claimant: key(9), approver: members[1] }))
    expectGuard(() => approveCompletionClaim({ ...input, claimant: members[1], approver: members[1] }))
    expectGuard(() => approveCompletionClaim({ ...input, approver: key(9) }))
  })

  it('rejects malformed, duplicate, claimant, and already-threshold existing approvals', () => {
    const cases: PublicKeyText[][] = [[members[0]], [members[1], members[1]], [key(9)], [members[1], members[2]]]
    for (const existingApprovals of cases) expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals }))
    for (const kind of ['hole', 'named', 'symbol', 'accessor'] as const) expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], existingApprovals: malformedArray(kind, [members[1]]) }))
  })

  it.each(claimStatuses.filter((value) => value !== 'PENDING'))('rejects claim status %s', (claimStatus) => expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], claimStatus })))
  it('rejects unknown status, zero and invalid thresholds', () => {
    expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], claimStatus: unknownValue('UNKNOWN') }))
    for (const requiredAdditionalConfirmations of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) expectGuard(() => approveCompletionClaim({ ...input, approver: members[1], requiredAdditionalConfirmations }))
  })
})

describe('finalization', () => {
  it.each([2, 3, 4, 5, 6] as const)('settles confirmed plus unclaimed claims of length %s', (length) => {
    const claims = Array.from({ length }, (_, index) => index === 0 ? 'CONFIRMED' : 'UNCLAIMED') as ClaimStatus[]
    expect(deriveSafeEventFinalizationKind(claims)).toBe('SETTLE')
    expect(() => assertCanFinalizeAsSettled(claims)).not.toThrow()
  })

  it.each([2, 3, 4, 5, 6] as const)('voids pending/questioned claims of length %s', (length) => {
    for (const bad of ['PENDING', 'QUESTIONED'] as const) {
      const claims = Array.from({ length }, (_, index) => index === 0 ? bad : 'UNCLAIMED') as ClaimStatus[]
      expect(deriveSafeEventFinalizationKind(claims)).toBe('VOID')
      expectGuard(() => assertCanFinalizeAsSettled(claims))
    }
  })

  it('voids all-unclaimed claims and rejects all malformed status values', () => {
    expect(deriveSafeEventFinalizationKind(['UNCLAIMED', 'UNCLAIMED'])).toBe('VOID')
    expectGuard(() => deriveSafeEventFinalizationKind(['UNKNOWN', 'UNCLAIMED'] as never))
    for (const kind of ['hole', 'named', 'symbol', 'accessor'] as const) expectGuard(() => deriveSafeEventFinalizationKind(malformedArray(kind) as ClaimStatus[]))
  })

  it.each([[], ['CONFIRMED'], Array(7).fill('CONFIRMED')])('rejects claim list length %s', (claims) => expectGuard(() => deriveSafeEventFinalizationKind(claims as ClaimStatus[])))
  it('rejects non-array claim lists', () => expectGuard(() => deriveSafeEventFinalizationKind('CONFIRMED' as never)))
})

describe('event transitions', () => {
  const valid = [['SCHEDULED', 'CLAIMING'], ['CLAIMING', 'RESOLVING'], ['RESOLVING', 'SETTLED'], ['RESOLVING', 'VOIDED']] as const
  it.each(valid)('allows %s to %s', (from, to) => expect(() => assertEventTransition(from, to)).not.toThrow())
  it('enforces the exhaustive canonical 5x5 transition matrix', () => {
    for (const from of eventStatuses) for (const to of eventStatuses) {
      const allowed = valid.some(([validFrom, validTo]) => validFrom === from && validTo === to)
      if (allowed) expect(() => assertEventTransition(from, to)).not.toThrow()
      else expectGuard(() => assertEventTransition(from, to))
    }
    expectGuard(() => assertEventTransition(unknownValue('UNKNOWN'), 'CLAIMING'))
    expectGuard(() => assertEventTransition('SCHEDULED', unknownValue('UNKNOWN')))
    for (const terminal of ['SETTLED', 'VOIDED'] as const) for (const to of eventStatuses) expectGuard(() => assertEventTransition(terminal, to))
  })
})

describe('closure', () => {
  it.each([1, 16] as const)('allows completed ritual with %s settled events and zero vault', (eventCount) => {
    expect(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: eventCount, eventCount, vaultBalance: 0n })).not.toThrow()
  })
  it.each([0, 17, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects event count %s', (eventCount) => expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 1, eventCount, vaultBalance: 0n })))
  it('rejects a fully settled event count above the maximum', () => expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 17, eventCount: 17, vaultBalance: 0n })))
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1] as const)('rejects settled event count %s', (settledEventCount) => expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount, eventCount: 2, vaultBalance: 0n })))
  it('rejects settled counts below or above event count', () => {
    expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 1, eventCount: 2, vaultBalance: 0n }))
    expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 3, eventCount: 2, vaultBalance: 0n }))
  })
  it('rejects every non-completed and unknown ritual status', () => {
    for (const ritualStatus of ritualStatuses.filter((value) => value !== 'COMPLETED')) expectGuard(() => assertCanCloseRitual({ ritualStatus, settledEventCount: 1, eventCount: 1, vaultBalance: 0n }))
    expectGuard(() => assertCanCloseRitual({ ritualStatus: unknownValue('UNKNOWN'), settledEventCount: 1, eventCount: 1, vaultBalance: 0n }))
  })
  it.each([1n, -1n, 18_446_744_073_709_551_616n, 1, '0'] as const)('rejects nonzero or non-bigint vault %s', (vaultBalance) => expectGuard(() => assertCanCloseRitual({ ritualStatus: 'COMPLETED', settledEventCount: 1, eventCount: 1, vaultBalance: vaultBalance as never })))
})

describe('barrel exports', () => {
  it('exports the lifecycle API and same guard behavior', () => {
    expect(barrel.LifecycleGuardError).toBe(LifecycleGuardError)
    expect(() => barrel.assertCanEditRitualTerms('DRAFT')).not.toThrow()
    expectGuard(() => barrel.assertCanEditRitualTerms('ACTIVE'))
    expect(barrel.deriveSafeEventFinalizationKind(['CONFIRMED', 'UNCLAIMED'])).toBe('SETTLE')
  })
})
