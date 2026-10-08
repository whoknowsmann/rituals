import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { soloRitualModel, labelSoloDestination, demoSpeedNotice, type SoloRitualBundle } from './soloRitualModel'
import { confirmedStampAdvanced, confirmedStampNotYetRead, soloActionLanded, soloActionCanRetry, staleSoloActionError } from './actionReadback'
import { weekCellLabel } from '../../../../components/crew/weekStripLogic'
import { lifecycleReducer, lifecycleCanSubmit, lifecycleStatusCopy, type LifecycleState } from '../../lifecycleMachine'

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
  it('counts from chain windows and stops displaying stamp time outside an unstamped open week', () => {
    expect(soloRitualModel(bundle(), 68, me).nextOpensLabel).toBe('in 32s')
    expect(soloRitualModel(bundle(), 69, me).nextOpensLabel).toBe('in 31s')
    expect(soloRitualModel(bundle(), 99, me).stampTimeLeftLabel).toBeNull()
    expect(soloRitualModel(bundle(), 168, me).stampTimeLeftLabel).toBe('32s left')
    expect(soloRitualModel(bundle({}, event()), 169, me).stampTimeLeftLabel).toBe('31s left')
    expect(soloRitualModel(bundle(), 200, me).stampTimeLeftLabel).toBe('0s left')
    expect(soloRitualModel(bundle(), 201, me).stampTimeLeftLabel).toBeNull()
    expect(soloRitualModel(bundle({}, event(), [claim('Confirmed')]), 168, me).stampTimeLeftLabel).toBeNull()
    expect(soloRitualModel(bundle({ status: 'Completed' }), 168, me).stampTimeLeftLabel).toBeNull()
  })
  it('re-arms HOLD after each confirmed week advances, never for an uncertain send or stale read', () => {
    const confirmed: LifecycleState = { status: 'confirmed', ritualAddress: address.toBase58(), result: { signature: 's', messageDigest: 'd' } }
    for (let index = 0; index < 4; index++) {
      const target = { kind: 'claim' as const, ritualAddress: address.toBase58(), eventIndex: index, actor: me }
      expect(confirmedStampAdvanced(confirmed, target, bundle({ currentEventIndex: index }))).toBe(false)
      expect(confirmedStampAdvanced(confirmed, target, bundle({ currentEventIndex: index + 1 }))).toBe(true)
      expect(lifecycleCanSubmit(lifecycleReducer(confirmed, { type: 'RESET' }))).toBe(true)
      const unknown: LifecycleState = { status: 'error', category: 'confirmation', submitted: true, retryable: false, message: 'unknown', ritualAddress: address.toBase58() }
      expect(confirmedStampAdvanced(unknown, target, bundle({ currentEventIndex: index + 1 }))).toBe(false)
    }
  })
  it('keeps re-reading after a confirmed stamp until the read shows it (a lagging RPC node)', () => {
    const confirmed: LifecycleState = { status: 'confirmed', ritualAddress: address.toBase58(), result: { signature: 's', messageDigest: 'd' } }
    const target = { kind: 'claim' as const, ritualAddress: address.toBase58(), eventIndex: 0, actor: me }
    const stale = soloRitualModel(bundle(), 150, me)
    expect(stale.state).toBe('open-not-initialized')
    expect(confirmedStampNotYetRead(confirmed, target, stale)).toBe(true)
    expect(confirmedStampNotYetRead(confirmed, target, soloRitualModel(bundle({}, event({ status: 'Claiming' }), [claim('Confirmed')]), 150, me))).toBe(false)
    expect(confirmedStampNotYetRead(confirmed, { ...target, eventIndex: 1 }, stale)).toBe(false)
    expect(confirmedStampNotYetRead({ status: 'idle' }, target, stale)).toBe(false)
    expect(confirmedStampNotYetRead(confirmed, target, null)).toBe(false)
  })
  it('clears the non-retryable stamp warning only for the claimed week, even if the read arrived before the error', () => {
    const read = bundle({}, event({ status: 'Claiming' }), [claim('Confirmed')])
    const target = { kind: 'claim' as const, ritualAddress: address.toBase58(), eventIndex: 0, actor: me }
    expect(soloRitualModel(read, 150, me).showedUp).toBe(true)
    const error: LifecycleState = { status: 'error', category: 'confirmation', message: 'late expiry', submitted: true, retryable: false, ritualAddress: target.ritualAddress }
    expect(lifecycleReducer(error, { type: 'RESET' })).toBe(error)
    expect(soloActionLanded(read, { ...target, eventIndex: 1 })).toBe(false)
    expect(soloActionLanded(bundle({}, event(), [claim('Pending')]), target)).toBe(false)
    expect(soloActionLanded(read, { ...target, actor: witness })).toBe(false)
    expect(soloActionLanded(read, target)).toBe(true)
    const recovered = lifecycleReducer(error, { type: 'READBACK_OBSERVED', ritualAddress: target.ritualAddress })
    expect(recovered.status).toBe('recovered')
    expect(lifecycleCanSubmit(recovered)).toBe(false)
    expect(lifecycleStatusCopy(recovered).body).not.toContain('may already')
    expect(lifecycleReducer(error, { type: 'READBACK_OBSERVED', ritualAddress: 'another ritual' })).toBe(error)
    const advanced = { ...bundle({ currentEventIndex: 1, settledEventCount: 1 }), history: [read] }
    expect(soloActionLanded(advanced, target)).toBe(true)
    expect(soloActionLanded(advanced, { ...target, kind: 'finalize' })).toBe(true)
    expect(soloActionLanded(read, { ...target, kind: 'initialize-event' })).toBe(true)
    expect(soloActionLanded(bundle({ skipDeclared: true, skipEventIndex: 0 }), { ...target, kind: 'skip' })).toBe(true)
    expect(soloActionLanded(bundle(), { ...target, kind: 'skip' })).toBe(false)
  })

  it('never offers retry for a landed stamp or an expired stamp period, clearing only stale retryable errors', () => {
    const target = { kind: 'claim' as const, ritualAddress: address.toBase58(), eventIndex: 0, actor: me }
    const declined: LifecycleState = { status: 'error', category: 'wallet-rejected', message: 'Nothing was sent.', submitted: false, retryable: true, ritualAddress: target.ritualAddress }
    for (const now of [100, 199, 200]) expect(soloActionCanRetry(declined, target, soloRitualModel(bundle(), now, me), bundle())).toBe(true)
    for (const now of [99, 201, 300, 301]) {
      const model = soloRitualModel(bundle(), now, me)
      expect(soloActionCanRetry(declined, target, model, bundle())).toBe(false)
      expect(staleSoloActionError(declined, target, model)).toBe(true)
      expect(lifecycleReducer(declined, { type: 'RESET' }).status).toBe('idle')
    }
    const stamped = bundle({}, event(), [claim('Confirmed')])
    expect(soloActionCanRetry(declined, target, soloRitualModel(stamped, 150, me), stamped)).toBe(false)
    const recovered = lifecycleReducer(declined, { type: 'READBACK_OBSERVED', ritualAddress: target.ritualAddress })
    expect(lifecycleStatusCopy(recovered).tone).toBe('success')
    expect(confirmedStampNotYetRead(recovered, target, soloRitualModel(bundle(), 150, me))).toBe(true)
    expect(confirmedStampAdvanced(recovered, target, bundle({ currentEventIndex: 1 }))).toBe(true)
    expect(soloActionCanRetry(declined, target, soloRitualModel(bundle({ currentEventIndex: 1 }), 450, me), bundle())).toBe(false)
    const unknown: LifecycleState = { ...declined, submitted: true, retryable: false, category: 'confirmation' }
    expect(soloActionCanRetry(unknown, target, soloRitualModel(bundle(), 150, me), bundle())).toBe(false)
    expect(staleSoloActionError(unknown, target, soloRitualModel(bundle(), 201, me))).toBe(false)
    expect(lifecycleReducer(unknown, { type: 'RESET' })).toBe(unknown)
    // Landed but failed on chain: the same window rule as a decline.
    const failed = lifecycleReducer(unknown, { type: 'FAILURE_OBSERVED', ritualAddress: target.ritualAddress })
    expect(soloActionCanRetry(failed, target, soloRitualModel(bundle(), 150, me), bundle())).toBe(true)
    expect(soloActionCanRetry(failed, target, soloRitualModel(bundle(), 201, me), bundle())).toBe(false)
    expect(staleSoloActionError(failed, target, soloRitualModel(bundle(), 201, me))).toBe(true)
  })

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

  // Device run 2026-10-07 (ritual 6tbkhyp…): "Skip next week" tapped while
  // waiting for week 1 skipped WEEK 1 (declare_skip targets the current
  // week, now < opens); the screen kept offering HOLD, he stamped, and the
  // program voided the stamped week as DeclaredSkip.
  describe('declared skip (declare_skip: current week, now < opens)', () => {
    const DAY = 86_400n
    const realWeeks = [{ opens: 10_000n, deadline: 10_000n + 6n * DAY, resolution: 10_000n + 6n * DAY + 82_800n }, { opens: 10_000n + 7n * DAY, deadline: 10_000n + 13n * DAY, resolution: 10_000n + 13n * DAY + 82_800n }]
    const demoWeeks = [{ opens: 1_000n, deadline: 1_045n, resolution: 1_055n }, { opens: 1_060n, deadline: 1_105n, resolution: 1_115n }]

    it('offers it on real weeks only while an approval can land a minute before the week opens', () => {
      expect(soloRitualModel(bundle({ schedule: realWeeks }, null), 10_000 - 61, me).canSkip).toBe(true)
      expect(soloRitualModel(bundle({ schedule: realWeeks }, null), 10_000 - 60, me).canSkip).toBe(false)
      expect(soloRitualModel(bundle({ schedule: realWeeks, skipDeclared: true }, null), 5_000, me).canSkip).toBe(false)
      expect(soloRitualModel(bundle({ schedule: [realWeeks[0]] }, null), 5_000, me).canSkip).toBe(false)
    })

    it('never offers it at demo speed, where every skippable week opens within seconds', () => {
      for (const now of [0, 900, 939, 999]) expect(soloRitualModel(bundle({ schedule: demoWeeks }, null), now, me).canSkip).toBe(false)
      expect(soloRitualModel(bundle({ schedule: demoWeeks, currentEventIndex: 1 }, null), 1_056, me).canSkip).toBe(false)
    })

    it('shows the skipped week as skipped from the moment it is declared: no HOLD, no countdown, never NOW', () => {
      for (const schedule of [realWeeks, demoWeeks]) {
        const opens = Number(schedule[0].opens)
        for (const now of [opens - 30, opens, opens + 20, Number(schedule[0].deadline), Number(schedule[0].resolution)]) {
          const model = soloRitualModel(bundle({ schedule, skipDeclared: true, skipEventIndex: 0 }, null), now, me)
          expect(model.state).toBe('skipped')
          expect(model.weekSkipped).toBe(true)
          expect(model.weekCells[0]).toBe('current')
          expect(model.nextOpensLabel).toBeNull()
          expect(model.stampTimeLeftLabel).toBeNull()
        }
      }
    })

    it('does not count a stamp made on a skipped week (the program voids it)', () => {
      const stamped = bundle({ schedule: demoWeeks, skipDeclared: true, skipEventIndex: 0 }, event({ window: demoWeeks[0], status: 'Claiming', claimedMembersBitmap: 1, confirmedMembersBitmap: 1 }), [claim('Confirmed')])
      const model = soloRitualModel(stamped, 1_020, me)
      expect(model.state).toBe('skipped')
      expect(model.showedUp).toBe(false)
    })

    it('settles it after resolution like any closed week, opening the event first when nobody stamped', () => {
      const model = soloRitualModel(bundle({ schedule: demoWeeks, skipDeclared: true, skipEventIndex: 0 }, null), 1_056, me)
      expect(model.state).toBe('resolving/settle')
      expect(model.weekSkipped).toBe(true)
      expect(model.showedUp).toBe(false)
      expect(model.needsEventInit).toBe(true)
    })

    it('marks a settled skip neutral on the punch card, not kept', () => {
      const settled = {
        ...bundle({ schedule: demoWeeks, currentEventIndex: 1, settledEventCount: 1, skipDeclared: true, skipEventIndex: 0 }, null),
        history: [{ ritual: bundle().ritual, event: event({ status: 'Voided', voidReason: 'DeclaredSkip', eventIndex: 0 }), claims: [] }],
      } as unknown as SoloRitualBundle
      const model = soloRitualModel(settled, 1_057, me)
      expect(model.weekCells).toEqual(['closed', 'current'])
      expect(model.weekSkipped).toBe(false)
      expect(model.lastClosedOutcome).toBe('skipped')
    })
  })

  it('numbers a not-yet-open current week; NOW lasts only for the open stamp window', () => {
    expect(soloRitualModel(bundle(), 99, me).state).toBe('waiting')
    for (const [now, label] of [[99, '1'], [100, 'NOW'], [200, 'NOW'], [201, '1']] as const) {
      const model = soloRitualModel(bundle(), now, me)
      expect(weekCellLabel(model.weekCells[0], 0)).toBe(label)
      expect(model.weekCells[1]).toBe('future')
    }
  })

  it('keeps receipts reachable when historical outcome reads are unavailable', () => {
    expect(soloRitualModel(bundle({ currentEventIndex: 1 }), 450, me).weekCells).toEqual(['closed', 'now'])
    expect(soloRitualModel(bundle({ status: 'Completed', currentEventIndex: 2 }), 700, me).weekCells).toEqual(['closed', 'closed'])
  })

  it('labels the demo cause only for the exact configured destination', () => {
    expect(labelSoloDestination(destination, destination)).toContain('Northside Food Bank')
    expect(labelSoloDestination(destination, new PublicKey(new Uint8Array(32).fill(10)))).toContain('wallet you chose')
  })

  // DESIGN.md rule 5: demo timing is disclosed as "Demo speed" in muted text,
  // decided from the on-chain windows so no local record is needed.
  describe('demo speed notice', () => {
    const DAY = 86_400n
    const shipped = [{ opens: 1_000n, deadline: 1_300n }, { opens: 1_390n, deadline: 1_690n }]
    const real = [{ opens: 1_000n, deadline: 1_000n + 6n * DAY }, { opens: 1_000n + 7n * DAY, deadline: 1_000n + 13n * DAY }]

    it('reads the shipped solo demo schedule as 6.5-minute weeks and says so in every state', () => {
      expect(demoSpeedNotice(shipped)).toBe('Demo speed: a week here is 6.5 minutes.')
      expect(soloRitualModel(bundle({ schedule: shipped }), 50, me).demoSpeedNotice).toBe('Demo speed: a week here is 6.5 minutes.')
      expect(soloRitualModel(bundle({ schedule: shipped, status: 'Completed', currentEventIndex: 2 }), 5_000, me).demoSpeedNotice).toBe('Demo speed: a week here is 6.5 minutes.')
    })

    it('shows nothing for real weeks', () => {
      expect(demoSpeedNotice(real)).toBeNull()
      expect(soloRitualModel(bundle({ schedule: real }), 50, me).demoSpeedNotice).toBeNull()
    })
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
      expect(soloRitualModel(missedWeek0(), 450, me).lastClosedOutcome).toBe('missed')
      expect(soloRitualModel(missedWeek0({ status: 'Completed' }), 10_000, me).lastClosedOutcome).toBe('missed')
    })

    it('does the same after a declared skip', () => {
      expect(soloRitualModel(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null), 350, me).state).toBe('skipped')
      expect(soloRitualModel(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null), 450, me).state).toBe('open-not-initialized')
    })
  })
})
