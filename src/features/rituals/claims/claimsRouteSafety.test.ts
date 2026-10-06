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

  it('uses one own-key snapshot when a proxy changes its route shape', () => {
    const makeHostile = (route: Record<string, unknown>) => {
      let ownKeysCalls = 0
      let getCalls = 0
      const proxy = new Proxy(route, {
        get: () => { getCalls += 1; throw new Error('get') },
        ownKeys: () => {
          ownKeysCalls += 1
          return ownKeysCalls === 1 ? [...Object.keys(route), 'extra'] : Object.keys(route)
        },
        getOwnPropertyDescriptor: (_target, key) => typeof key === 'string' && key in route
          ? { value: route[key], enumerable: true, configurable: true, writable: true }
          : { value: true, enumerable: true, configurable: true, writable: true },
      })
      return { proxy, calls: () => ({ ownKeysCalls, getCalls }) }
    }
    const ritual = makeHostile({ ritualId: 'ritual-weekly-run' })
    const event = makeHostile({ ritualId: 'ritual-weekly-run', eventIndex: 0 })

    expect(parseRitualRouteParams(ritual.proxy)).toBeNull()
    expect(parseEventRouteParams(event.proxy)).toBeNull()
    expect(ritual.calls()).toEqual({ ownKeysCalls: 1, getCalls: 0 })
    expect(event.calls()).toEqual({ ownKeysCalls: 1, getCalls: 0 })
  })

  it('deep-freezes canonical fixture lookup data', () => {
    const fixture = getClaimFixture('ritual-book-club', 0) as ClaimFixture

    expect(Object.isFrozen(claimFixtures)).toBe(true)
    expect(Object.isFrozen(fixture)).toBe(true)
    expect(Object.isFrozen(fixture.detail)).toBe(true)
    expect(Object.isFrozen(fixture.receipt)).toBe(true)
    expect(Object.isFrozen(fixture.receipt.settlement)).toBe(true)
    expect(Reflect.set(fixture.detail as object, 'title', 'tampered')).toBe(false)
    expect(Reflect.set(fixture.receipt.settlement as object, 'kind', 'VOIDED')).toBe(false)
    expect(getClaimFixture('ritual-book-club', 0)?.detail.title).toBe('February book club')
    expect(getClaimFixture('ritual-book-club', 0)?.receipt.settlement.kind).toBe('SETTLED')
  })

  it('enables claim preview without wallet signing', () => {
    expect(buildClaimCompletionViewModel({ claimant: 'You', friendConfirmations: 0, threshold: 1 }).canClaim).toBe(true)
  })

  it('runs local confirmation actions and prevents duplicate actions', () => {
    const idle = { action: 'idle' as const }
    expect(confirmationInboxReducer(idle, { type: 'CONFIRM' }).action).toBe('idle')
    expect(confirmationInboxReducer(idle, { type: 'QUESTION' }).action).toBe('idle')
    expect(confirmationInboxReducer(idle, { type: 'START' }).action).toBe('in-flight')
    expect(confirmationInboxReducer({ action: 'in-flight' }, { type: 'CONFIRM' }).action).toBe('confirmed')
    expect(confirmationInboxReducer({ action: 'in-flight' }, { type: 'QUESTION' }).action).toBe('questioned')
    expect(confirmationInboxReducer({ action: 'confirmed' }, { type: 'START' }).action).toBe('confirmed')
  })

  it('returns exact principal for voided receipts and zeroes bonus and forfeiture', () => {
    const fixture = getClaimFixture('ritual-unresolved', 0) as ClaimFixture
    const view = buildSettlementReceiptViewModel(fixture.receipt)
    expect(view.status).toBe('voided')
    expect(view.lines).toEqual(expect.arrayContaining([
      ['Principal returned', '3.000000 tSKR'], ['Bonus', '0 tSKR'], ['Forfeiture', '0 tSKR'], ['Platform share', '0 tSKR'],
    ]))
  })

  it('rejects malformed financial inputs safely', () => {
    expect(buildSettlementReceiptViewModel(null as never).status).toBe('invalid')
    expect(buildSettlementReceiptViewModel({
      ...claimFixtures[1].receipt,
      principal: -1n,
    }).status).toBe('invalid')
  })

  it.each([
    { memberOutcome: 'CONFIRMED' as const, principal: 0n, bonus: 1n, forfeiture: 3n },
    { memberOutcome: 'UNCLAIMED' as const, principal: 3n, bonus: 1n, forfeiture: 0n },
    { memberOutcome: 'CONFIRMED' as const, principal: 3n, bonus: 1n, forfeiture: 1n },
  ])('rejects contradictory settled member accounting', (change) => {
    const fixture = getClaimFixture('ritual-book-club', 0) as ClaimFixture
    expect(buildSettlementReceiptViewModel({ ...fixture.receipt, ...change }).status).toBe('invalid')
  })

  it('formats zero-decimal receipt totals without a decimal point', () => {
    const fixture = getClaimFixture('ritual-book-club', 0) as ClaimFixture
    const view = buildSettlementReceiptViewModel({ ...fixture.receipt, tokenDecimals: 0, eventAllocation: 3n as never, principal: 3n, bonus: 1n })
    expect(view.lines.find(([label]) => label === 'Total received')?.[1]).toBe('4 tSKR')
  })
})
