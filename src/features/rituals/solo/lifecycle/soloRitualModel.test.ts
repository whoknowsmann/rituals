import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { soloRitualModel, labelSoloDestination, type SoloRitualBundle } from './soloRitualModel'

const me = new PublicKey(new Uint8Array(32).fill(7))
const witness = new PublicKey(new Uint8Array(32).fill(8))
const destination = new PublicKey(new Uint8Array(32).fill(9))
const address = new PublicKey(new Uint8Array(32).fill(6))
const window = { opens: 100n, deadline: 200n, resolution: 300n }
const ritual = (overrides: Record<string, unknown> = {}) => ({
  kind: 'Solo', status: 'Active', members: [me], creator: me, witness: null, season: null,
  schedule: [window, { opens: 400n, deadline: 500n, resolution: 600n }], currentEventIndex: 0,
  skipDeclared: false, skipEventIndex: 0, forfeitDestination: destination,
  perEventAllocation: 5_000_000n, stakeDecimals: 6, ...overrides,
})
const bundle = (overrides: Record<string, unknown> = {}, event: Record<string, unknown> | null = null, claims: readonly unknown[] = []) => ({
  ritual: { account: ritual(overrides), address }, event, claims,
}) as unknown as SoloRitualBundle & RitualBundleRead
const event = (overrides: Record<string, unknown> = {}) => ({ account: {
  eventIndex: 0, window, status: 'Scheduled', claimedMembersBitmap: 0, confirmedMembersBitmap: 0,
  questionedMembersBitmap: 0, voidReason: 'None', forfeitedTotal: 0n, payoutTotal: 0n,
  refundedTotal: 0n, eventPool: 0n, ...overrides,
} })
const claim = (status: 'Pending' | 'Confirmed' | 'Questioned') => ({ member: me, account: { status } })

describe('soloRitualModel', () => {
  it.each([
    ['funding', { status: 'Funding' }, null, []],
    ['waiting', {}, null, []],
    ['open-not-initialized', {}, null, []],
    ['claimable', {}, event(), []],
    ['awaiting-witness', { additionalConfirmationThreshold: 1, witness }, event({ status: 'Claiming', claimedMembersBitmap: 1 }), [claim('Pending')]],
    ['closing', {}, event({ status: 'Resolving' }), []],
    ['skipped', { skipDeclared: true, skipEventIndex: 0 }, event({ status: 'Voided', voidReason: 'DeclaredSkip' }), []],
    ['missed', {}, event({ status: 'Settled', forfeitedTotal: 5_000_000n, eventPool: 5_000_000n, payoutTotal: 5_000_000n }), []],
    ['completed', { status: 'Completed', currentEventIndex: 2 }, event({ status: 'Settled', eventIndex: 1 }), []],
  ] as const)('maps %s to one UI state', (state, ritualOverrides, currentEvent, claims) => {
    const now = state === 'waiting' ? 50 : 150
    expect(soloRitualModel(bundle(ritualOverrides, currentEvent, claims), now, me).state).toBe(state)
  })

  it('does not offer a declared skip at the exact claim opening boundary', () => {
    const model = soloRitualModel(bundle({}, null), 100, me)
    expect(model.state).toBe('open-not-initialized')
    expect(model.canSkip).toBe(false)
  })

  it('offers a declared skip only before claim opens and when unused', () => {
    expect(soloRitualModel(bundle({}, null), 99, me).canSkip).toBe(true)
    expect(soloRitualModel(bundle({ skipDeclared: true }, null), 99, me).canSkip).toBe(false)
  })

  it('labels the demo cause only for the exact configured destination', () => {
    expect(labelSoloDestination(destination, destination)).toContain('Northside Food Bank')
    expect(labelSoloDestination(destination, new PublicKey(new Uint8Array(32).fill(10)))).toContain('person you picked')
  })

  describe('closing a week (chain rules: finalize only after resolution)', () => {
    // window: opens 100, deadline 200, resolution 300
    it('never offers settle before the resolution time, even after the deadline', () => {
      expect(soloRitualModel(bundle({}, event({ status: 'Claiming' }), [claim('Confirmed')]), 250, me).state).toBe('closing')
      expect(soloRitualModel(bundle({}, event({ status: 'Resolving' }), []), 250, me).state).toBe('closing')
    })

    it('offers settle once the resolution time has passed', () => {
      expect(soloRitualModel(bundle({}, event({ status: 'Claiming' }), [claim('Confirmed')]), 301, me).state).toBe('resolving/settle')
    })

    it('a missed week with no check-in (no event account) can still be settled, and never offers the stamp', () => {
      expect(soloRitualModel(bundle({}, null), 250, me).state).toBe('closing')
      const model = soloRitualModel(bundle({}, null), 301, me)
      expect(model.state).toBe('resolving/settle')
      expect(model.needsEventInit).toBe(true)
    })

    it('does not ask to open the week when the event already exists', () => {
      expect(soloRitualModel(bundle({}, event({ status: 'Resolving' }), []), 301, me).needsEventInit).toBe(false)
    })

    it('points at the latest closed week for its receipt', () => {
      const closed = {
        ...bundle({ currentEventIndex: 1 }, null),
        history: [{ ritual: bundle().ritual, event: event({ status: 'Settled', eventIndex: 0 }), claims: [claim('Confirmed')] }],
      } as unknown as SoloRitualBundle
      expect(soloRitualModel(closed, 350, me).lastClosedEventIndex).toBe(0)
      expect(soloRitualModel(bundle({}, null), 50, me).lastClosedEventIndex).toBeNull()
    })
  })

  // Phone run 2026-10-03: after a missed week the screen stayed on MISSED for
  // the whole next week, with no HOLD, so the next week could not be stamped.
  describe('the week after a missed or skipped week', () => {
    const missedWeek0 = (overrides: Record<string, unknown> = {}) => ({
      ...bundle({ currentEventIndex: 1, ...overrides }, null),
      history: [{ ritual: bundle().ritual, event: event({ status: 'Settled', eventIndex: 0, forfeitedTotal: 5_000_000n, eventPool: 5_000_000n }), claims: [] }],
    } as unknown as SoloRitualBundle)

    it('shows the missed result until the next week opens, then offers the stamp', () => {
      expect(soloRitualModel(missedWeek0(), 350, me).state).toBe('missed')
      expect(soloRitualModel(missedWeek0(), 450, me).state).toBe('open-not-initialized')
    })

    it('does the same after a declared skip', () => {
      expect(soloRitualModel(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null), 350, me).state).toBe('skipped')
      expect(soloRitualModel(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null), 450, me).state).toBe('open-not-initialized')
    })
  })
})
