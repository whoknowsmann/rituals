import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { RitualsRpcReader, type RitualBundleRead } from './ritualsRpc'
import { RitualConfirmationVerifier } from './ritualConfirmation'
import { lifecycleContext, lifecycleSource } from './lifecycleBuilderTestHelpers'
import { action, FakeConfirm, validSignatures, blockhash, address } from './ritualConfirmation.adversarial.helpers'

const member = lifecycleSource.members[0]
const eventAccount = (status: 'Scheduled' | 'Claiming' | 'Resolving' | 'Settled' | 'Voided' = 'Claiming', overrides: Record<string, unknown> = {}) => ({
  eventIndex: 0, ritual: address, memberCount: lifecycleSource.members.length, window: lifecycleSource.schedule[0], status, voidReason: status === 'Voided' ? 'NoConfirmedMembers' : 'None', claimedMembersBitmap: 1, confirmedMembersBitmap: 0, questionedMembersBitmap: 0, bump: 1, ...overrides,
})
const claimAccount = (status: 'Pending' | 'Confirmed' | 'Questioned', overrides: Record<string, unknown> = {}) => ({
  ritual: address, event: address, eventIndex: 0, claimant: member, memberIndex: 0, claimVersion: 0, requiredAdditionalConfirmations: lifecycleSource.additionalConfirmationThreshold, approvalsBitmap: 0, approvalCount: 0, claimedAt: lifecycleSource.schedule[0].opens, bump: 1, status, ...overrides,
})
const bundle = (claimStatus: 'Pending' | 'Confirmed' | 'Questioned' = 'Pending', ritualOverrides: Record<string, unknown> = {}, eventOverrides: Record<string, unknown> = {}, claimOverrides: Record<string, unknown> = {}): RitualBundleRead => Object.freeze({
  slot: 50, ritual: Object.freeze({ slot: 50, address, protocolConfigAddress: address, protocolConfig: {} as never, account: Object.freeze(lifecycleContext({ status: 'Active', currentEventIndex: 0, ...ritualOverrides }).account) }),
  event: Object.freeze({ slot: 50, address, ritualAddress: address, protocolConfigAddress: address, protocolConfig: {} as never, ritual: undefined as never, account: Object.freeze(eventAccount('Claiming', eventOverrides)) }),
  claims: Object.freeze([{ memberIndex: 0, member, address, account: Object.freeze(claimAccount(claimStatus, claimOverrides)) }]),
}) as unknown as RitualBundleRead
class EventReader extends RitualsRpcReader {
  calls: Array<{ index: number; options: unknown }> = []
  constructor(private readonly result: RitualBundleRead) { super({ getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 1 }, value: [] }) }, new PublicKey(new Uint8Array(32).fill(9))) }
  override async getEventBundle(_address: PublicKey, index: number, options?: { minContextSlot?: number }) { this.calls.push({ index, options }); return this.result }
}

describe('indexed event confirmation contracts', () => {
  it('confirms event initialization through the indexed reader at the confirmation slot', async () => {
    const reader = new EventReader(bundle('Pending'))
    const result = await new RitualConfirmationVerifier(reader, new FakeConfirm()).confirmAndReadRitual(action({ kind: 'event-initialized', eventIndex: 0 }))
    expect(reader.calls).toEqual([{ index: 0, options: { minContextSlot: 50 } }])
    expect(result.indexedBundle).toBe(result.bundle)
    expect(Object.keys(result)).toEqual(['signature', 'confirmationSlot', 'bundle', 'indexedBundle', 'expectationKind'])
  })
  it.each(['Pending', 'Confirmed', 'Questioned'] as const)('accepts a Pending claim expectation at later status %s', async (status) => {
    const result = await new RitualConfirmationVerifier(new EventReader(bundle(status)), new FakeConfirm()).confirmAndReadRitual(action({ kind: 'claimed', claimant: member, eventIndex: 0, expectedClaimStatus: 'Pending' }))
    expect(result.bundle.claims[0].account?.status).toBe(status)
  })
  it('rejects Questioned when the submitted claim expectation is Confirmed', async () => {
    const reader = new EventReader(bundle('Questioned'))
    await expect(new RitualConfirmationVerifier(reader, new FakeConfirm()).confirmAndReadRitual(action({ kind: 'claimed', claimant: member, eventIndex: 0, expectedClaimStatus: 'Confirmed' }))).rejects.toMatchObject({ category: 'readback' })
  })
  it('requires the exact funded approver bit and accepts approval progression', async () => {
    const account = lifecycleContext({ status: 'Active', currentEventIndex: 0, fundedMembersBitmap: 7, fundedMemberCount: 3 }).account
    const result = await new RitualConfirmationVerifier(new EventReader(bundle('Pending', account, {}, { approvalsBitmap: 2, approvalCount: 1 })), new FakeConfirm()).confirmAndReadRitual(action({ kind: 'approved', claimant: member, approver: lifecycleSource.members[1], eventIndex: 0, expectedApprovalCount: 1, expectedClaimStatus: 'Pending' }))
    expect(result.bundle.claims[0].account?.approvalsBitmap).toBe(2)
  })
  it('rejects missing approver bits and insufficient approval count', async () => {
    const account = lifecycleContext({ status: 'Active', currentEventIndex: 0, fundedMembersBitmap: 7, fundedMemberCount: 3 }).account
    const verifier = (claimOverrides: Record<string, unknown>, expectedApprovalCount: number) => new RitualConfirmationVerifier(new EventReader(bundle('Pending', account, {}, claimOverrides)), new FakeConfirm()).confirmAndReadRitual(action({ kind: 'approved', claimant: member, approver: lifecycleSource.members[1], eventIndex: 0, expectedApprovalCount, expectedClaimStatus: 'Pending' }))
    await expect(verifier({ approvalsBitmap: 0, approvalCount: 0 }, 1)).rejects.toMatchObject({ category: 'readback' })
    await expect(verifier({ approvalsBitmap: 2, approvalCount: 1 }, 2)).rejects.toMatchObject({ category: 'readback' })
  })

  it('confirms Questioned claimant state without exposing questioner verification', async () => {
    const result = new RitualConfirmationVerifier(new EventReader(bundle('Questioned', {}, { questionedMembersBitmap: 1 })), new FakeConfirm()).confirmAndReadRitual(action({ kind: 'questioned', claimant: member, questioner: lifecycleSource.members[1], eventIndex: 0 }))
    const confirmed = await result
    expect(confirmed.bundle.claims[0].account?.status).toBe('Questioned')
    expect(Object.keys(confirmed)).not.toContain('questioner')
  })
  it.each(['Settled', 'Voided'] as const)('confirms finalized historical %s state and counters', async (status) => {
    const reason = status === 'Settled' ? 'None' : 'NoConfirmedMembers'
    const result = await new RitualConfirmationVerifier(new EventReader(bundle('Pending', { status: 'Active', currentEventIndex: 1, settledEventCount: 1 }, { status, voidReason: reason })), new FakeConfirm()).confirmAndReadRitual(action({ kind: 'finalized', eventIndex: 0, expectedEventStatus: status, expectedVoidReason: reason, expectedRitualStatus: 'Active', expectedCurrentEventIndex: 1, expectedSettledEventCount: 1 }))
    expect(result.indexedBundle?.event?.account.status).toBe(status)
  })

  it.each([
    ['event-initialized', { kind: 'event-initialized', eventIndex: 16 }],
    ['claimed', { kind: 'claimed', claimant: member, eventIndex: 16, expectedClaimStatus: 'Pending' }],
    ['approved', { kind: 'approved', claimant: member, approver: lifecycleSource.members[1], eventIndex: 0, expectedApprovalCount: 7, expectedClaimStatus: 'Pending' }],
    ['finalized status/reason', { kind: 'finalized', eventIndex: 0, expectedEventStatus: 'Settled', expectedVoidReason: 'NoConfirmedMembers', expectedRitualStatus: 'Active', expectedCurrentEventIndex: 1, expectedSettledEventCount: 1 }],
    ['finalized counters', { kind: 'finalized', eventIndex: 0, expectedEventStatus: 'Settled', expectedVoidReason: 'None', expectedRitualStatus: 'Active', expectedCurrentEventIndex: 0, expectedSettledEventCount: 0 }],
  ])('rejects invalid %s expectation before confirmation', async (_name, expectation) => {
    const transport = new FakeConfirm()
    await expect(new RitualConfirmationVerifier(new EventReader(bundle()), transport).confirmAndReadRitual(action(expectation))).rejects.toMatchObject({ category: 'input' })
    expect(transport.calls).toHaveLength(0)
  })
})
