import { describe, expect, it } from 'vitest'
import {
  claimFixtures,
  getClaimFixture,
  getRitualFixture,
  type ClaimFixture,
} from './fixtures'
import { parseEventRouteParams, parseRitualRouteParams } from './routeHelpers'
import { buildClaimCompletionViewModel, buildSettlementReceiptViewModel, confirmationInboxReducer } from './viewModels'

describe('canonical claims fixtures and route safety', () => {
  it('has active pending, settled book club, and voided unresolved fixtures', () => {
    expect(claimFixtures.find((fixture) => fixture.ritualId === 'ritual-weekly-run')?.claimStatus).toBe('PENDING')
    expect(getClaimFixture('ritual-book-club', 0)?.receipt.status).toBe('SETTLED')
    expect(getClaimFixture('ritual-unresolved', 0)?.receipt.settlement.kind).toBe('VOIDED')
  })

  it.each([
    [{ ritualId: 'ritual-weekly-run' }, { ritualId: 'ritual-weekly-run' }],
    [{ ritualId: 'ritual-weekly-run', eventIndex: 0 }, { ritualId: 'ritual-weekly-run', eventIndex: 0 }],
  ] as const)('parses canonical route descriptors', (input, expected) => {
    expect('eventIndex' in input ? parseEventRouteParams(input) : parseRitualRouteParams(input)).toEqual(expected)
  })

  it('fails closed for missing, extra, accessors, proxies, and unsafe indices', () => {
    expect(parseRitualRouteParams({})).toBeNull()
    expect(parseEventRouteParams({ ritualId: 'ritual-weekly-run', eventIndex: -1 })).toBeNull()
    expect(parseEventRouteParams({ ritualId: 'ritual-weekly-run', eventIndex: Number.MAX_SAFE_INTEGER + 1 })).toBeNull()
    expect(parseRitualRouteParams({ ritualId: 'ritual-weekly-run', extra: true })).toBeNull()
    expect(parseRitualRouteParams(Object.create({ ritualId: 'ritual-weekly-run' }))).toBeNull()
    expect(parseRitualRouteParams(Object.defineProperty({}, 'ritualId', { get: () => { throw new Error('get') } }))).toBeNull()
    const hostile = new Proxy({ ritualId: 'ritual-weekly-run' }, { get: () => { throw new Error('get') } })
    expect(parseRitualRouteParams(hostile)).toEqual({ ritualId: 'ritual-weekly-run' })
    expect(getClaimFixture('unknown', 0)).toBeUndefined()
  })

  it('enables claim preview without wallet signing', () => {
    expect(buildClaimCompletionViewModel({ claimant: 'You', friendConfirmations: 0, threshold: 1 }).canClaim).toBe(true)
  })

  it('runs local confirmation actions and prevents duplicate actions', () => {
    const idle = { action: 'idle' as const }
    expect(confirmationInboxReducer(idle, { type: 'CONFIRM' }).action).toBe('confirmed')
    expect(confirmationInboxReducer(idle, { type: 'QUESTION' }).action).toBe('questioned')
    expect(confirmationInboxReducer({ action: 'in-flight' }, { type: 'CONFIRM' }).action).toBe('in-flight')
  })

  it('returns exact principal for voided receipts and zeroes bonus and forfeiture', () => {
    const fixture = getClaimFixture('ritual-unresolved', 0) as ClaimFixture
    const view = buildSettlementReceiptViewModel(fixture.receipt)
    expect(view.status).toBe('voided')
    expect(view.lines).toEqual(expect.arrayContaining([
      ['Principal returned', '3.000000 TEST'], ['Bonus', '0 TEST'], ['Forfeiture', '0 TEST'], ['Platform share', '0 TEST'],
    ]))
  })

  it('rejects malformed financial inputs safely', () => {
    expect(buildSettlementReceiptViewModel(null as never).status).toBe('invalid')
    expect(buildSettlementReceiptViewModel({
      ...claimFixtures[1].receipt,
      principal: -1n,
    }).status).toBe('invalid')
  })
})
