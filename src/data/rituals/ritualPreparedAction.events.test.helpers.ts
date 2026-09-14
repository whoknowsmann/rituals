import { PublicKey } from '@solana/web3.js'
import { decodeRitual, decodeRitualEvent, decodeCompletionClaim } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { claimPda, eventPda } from './pdas'
import { lifecycleKey, lifecycleProgramId, lifecycleSource } from './lifecycleBuilderTestHelpers'
import type { RitualEventAccountContext, CompletionClaimAccountContext } from './instructionsEvents'

export const eventProgramId = lifecycleProgramId
export const eventSource = decodeRitual(envelope(accountVectors.ritual.hex), eventProgramId)
export const eventRitualAddress = new PublicKey(accountVectors.ritualEvent.expected.ritual)
export const eventKey = (n: number) => lifecycleKey(n)
export const eventBlockhash = eventKey(90).toBase58()

export class EventTransport {
  readonly rentLengths: number[] = []
  readonly calls: string[] = []
  async getLatestBlockhashAndContext() { this.calls.push('latest'); return { context: { slot: 12 }, value: { blockhash: eventBlockhash, lastValidBlockHeight: 100 } } }
  async getFeeForMessage() { this.calls.push('fee'); return { context: { slot: 12 }, value: 7 } }
  async getMinimumBalanceForRentExemption(length: number) { this.calls.push(`rent${length}`); this.rentLengths.push(length); return length }
}

export function ritualContext(overrides: Partial<typeof eventSource> = {}) {
  return { address: eventRitualAddress, account: { ...eventSource, status: 'Active' as const, currentEventIndex: 0, settledEventCount: 0, fundedMembersBitmap: (1 << eventSource.members.length) - 1, fundedMemberCount: eventSource.members.length, fundedStakeTotal: eventSource.memberTotalStake * BigInt(eventSource.members.length), fundedFeeTotal: eventSource.lockedActivationFee, activatedAt: 20n, ...overrides } }
}

export function eventContext(ritual = ritualContext(), overrides: Partial<ReturnType<typeof decodeRitualEvent>> = {}): RitualEventAccountContext {
  const index = overrides.eventIndex ?? ritual.account.currentEventIndex
  const [address, bump] = eventPda(ritual.address, index, eventProgramId)
  return { address, account: { schemaVersion: 1, ritual: ritual.address, eventIndex: index, window: ritual.account.schedule[index], memberCount: ritual.account.members.length, status: 'Scheduled', claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0, initializedAt: 100n, resolvedAt: 0n, settlementVersion: 0, voidReason: 'None', eventPool: 0n, forfeitedTotal: 0n, payoutTotal: 0n, refundedTotal: 0n, confirmedMemberCount: 0, remainderUnits: 0n, remainingStakeTotalAfter: 0n, bump, ...overrides } }
}

export function claimContext(ritual = ritualContext(), event = eventContext(ritual), memberIndex = 0, overrides: Partial<ReturnType<typeof decodeCompletionClaim>> = {}): CompletionClaimAccountContext {
  const claimant = ritual.account.members[memberIndex]
  const [address, bump] = claimPda(event.address, claimant, 0, eventProgramId)
  return { address, account: { schemaVersion: 1, ritual: ritual.address, event: event.address, eventIndex: event.account.eventIndex, claimant, memberIndex, claimVersion: 0, status: 'Pending', requiredAdditionalConfirmations: ritual.account.additionalConfirmationThreshold, approvalsBitmap: 0, approvalCount: 0, claimedAt: 150n, bump, ...overrides } }
}

export const sourceMemberCount = eventSource.members.length
export const sourceMembers = eventSource.members
export const sourceCreator = eventSource.creator
export const sourceMint = eventSource.stakeMint
export const sourceSchedule = eventSource.schedule
export const sourceLifecycleFixture = lifecycleSource
export const sourceKey = lifecycleKey
