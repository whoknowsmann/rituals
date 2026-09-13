import type { ClaimStatus, EventIndex, EventStatus, RitualId, RitualStatus, TokenAtomicUnits } from '../../../domain/rituals/types'
import type { RitualDetailInput, SettlementReceiptInput } from './viewModels'

const ritualId = (value: string) => value as RitualId
const eventIndex = (value: number) => value as EventIndex
const units = (value: bigint) => value as TokenAtomicUnits

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value)
    }
    Object.freeze(value)
  }
  return value
}

export interface ClaimFixture {
  readonly ritualId: RitualId
  readonly eventIndex: EventIndex
  readonly detail: RitualDetailInput
  readonly claimant: string
  readonly eventLabel: string
  readonly claimStatus: ClaimStatus
  readonly confirmations: number
  readonly threshold: number
  readonly viewer: string
  readonly receipt: SettlementReceiptInput
}

const money = { tokenDecimals: 6, tokenSymbol: 'TEST' } as const
const activeDetail: RitualDetailInput = {
  ritualId: ritualId('ritual-weekly-run'), title: 'Saturday morning miles', status: 'ACTIVE' as RitualStatus,
  requirement: 'Run or walk 5 km together before Sunday evening.', nextClaimWindow: 'Saturday · 9:00 AM',
  stakeAtomicUnits: units(1_250_000_000n), ...money, confirmationMode: 'ONE_FRIEND',
}

export const claimFixtures: readonly ClaimFixture[] = deepFreeze([
  {
    ritualId: ritualId('ritual-weekly-run'), eventIndex: eventIndex(0), detail: activeDetail, claimant: 'bob', eventLabel: 'Event 1',
    claimStatus: 'PENDING', confirmations: 1, threshold: 2, viewer: 'friend',
    receipt: { status: 'CLAIMING', eventAllocation: units(1_250_000n), memberOutcome: 'CONFIRMED', principal: units(1_250_000n), bonus: units(0n), forfeiture: units(0n), futureStake: units(1_250_000n), activationFee: units(50_000n), ...money, settlement: { kind: 'SETTLED' } },
  },
  {
    ritualId: ritualId('ritual-book-club'), eventIndex: eventIndex(0),
    detail: { ...activeDetail, ritualId: ritualId('ritual-book-club'), title: 'February book club', status: 'COMPLETED' as RitualStatus, requirement: 'Read and discuss one book together.', confirmationMode: 'MAJORITY' },
    claimant: 'alice', eventLabel: 'Event 1', claimStatus: 'CONFIRMED', confirmations: 2, threshold: 2, viewer: 'friend',
    receipt: { status: 'SETTLED', eventAllocation: units(1_250_000_000n), memberOutcome: 'CONFIRMED', principal: units(1_250_000_000n), bonus: units(250_000_000n), forfeiture: units(0n), futureStake: units(1_250_000_000n), activationFee: units(50_000n), ...money, settlement: { kind: 'SETTLED' } },
  },
  {
    ritualId: ritualId('ritual-unresolved'), eventIndex: eventIndex(0),
    detail: { ...activeDetail, ritualId: ritualId('ritual-unresolved'), title: 'Unresolved check-in', status: 'COMPLETED' as RitualStatus, requirement: 'Check in with the group.', confirmationMode: 'ONE_FRIEND' },
    claimant: 'casey', eventLabel: 'Event 1', claimStatus: 'QUESTIONED', confirmations: 0, threshold: 1, viewer: 'friend',
    receipt: { status: 'VOIDED', eventAllocation: units(3_000_000n), memberOutcome: 'UNCLAIMED', principal: units(3_000_000n), bonus: units(0n), forfeiture: units(0n), futureStake: units(0n), activationFee: units(50_000n), ...money, settlement: { kind: 'VOIDED', reason: 'UNRESOLVED_CLAIMS' } },
  },
])

const byKey = new Map(claimFixtures.map((fixture) => [`${fixture.ritualId}:${fixture.eventIndex}`, fixture]))
export function getClaimFixture(id: string, index: number): ClaimFixture | undefined { return byKey.get(`${id}:${index}`) }
export function getRitualFixture(id: string): ClaimFixture | undefined { return claimFixtures.find((fixture) => fixture.ritualId === id) }
export function getCanonicalCompletedReceipt(): ClaimFixture['receipt'] { return claimFixtures[1].receipt }
export function fixtureReceiptStatus(status: EventStatus): boolean { return status === 'SETTLED' || status === 'VOIDED' }
