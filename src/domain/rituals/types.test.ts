import { describe, expect, it } from 'vitest'
import {
  CLAIM_STATUSES,
  CONFIRMATION_MODES,
  EVENT_STATUSES,
  RITUAL_STATUSES,
  type ClaimStatus,
  type ConfirmationMode,
  type EventStatus,
  type RitualStatus,
  type TokenAtomicUnits,
} from './types'
import { DEVNET_CLUSTER, type RitualId } from './index'

describe('Rituals domain vocabulary', () => {
  it('exposes the canonical confirmation modes in order', () => {
    expect(CONFIRMATION_MODES).toEqual(['HONOR', 'ONE_FRIEND', 'MAJORITY', 'UNANIMOUS'])
  })

  it('exposes each canonical vocabulary as an ordered closed set', () => {
    expect(RITUAL_STATUSES).toEqual(['DRAFT', 'FUNDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
    expect(CLAIM_STATUSES).toEqual(['UNCLAIMED', 'PENDING', 'CONFIRMED', 'QUESTIONED'])
    expect(EVENT_STATUSES).toEqual(['SCHEDULED', 'CLAIMING', 'RESOLVING', 'SETTLED', 'VOIDED'])

    for (const vocabulary of [CONFIRMATION_MODES, RITUAL_STATUSES, CLAIM_STATUSES, EVENT_STATUSES]) {
      expect(new Set(vocabulary).size).toBe(vocabulary.length)
    }
  })

  it('keeps vocabulary types closed and token amounts bigint-only', () => {
    const mode: ConfirmationMode = 'HONOR'
    const ritualStatus: RitualStatus = 'ACTIVE'
    const claimStatus: ClaimStatus = 'CONFIRMED'
    const eventStatus: EventStatus = 'SETTLED'
    const ritualId: RitualId = 'ritual-id' as RitualId
    const atomicUnits: TokenAtomicUnits = 1n as TokenAtomicUnits

    expect([mode, ritualStatus, claimStatus, eventStatus, ritualId, atomicUnits]).toHaveLength(6)

    // @ts-expect-error arbitrary labels are not canonical domain statuses
    const invalidStatus: RitualStatus = 'UPCOMING'
    // @ts-expect-error token atomic units must never be represented by number
    const invalidAtomicUnits: TokenAtomicUnits = 1
    void invalidStatus
    void invalidAtomicUnits
  })

  it('exports the devnet-only cluster identity from the public barrel', () => {
    expect(DEVNET_CLUSTER).toBe('devnet')
  })
})
