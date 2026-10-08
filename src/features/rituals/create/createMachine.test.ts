import { describe, expect, it } from 'vitest'
import {
  createMachineInitialState,
  createMachineReducer,
  canSubmitCreate,
  isTerminalCreateState,
  createStatusCopy,
  type CreateMachineState,
} from './createMachine'

const PREPARED = {
  kind: 'create' as const,
  messageDigest: 'a'.repeat(64),
  ritualAddress: 'RitUaL1111111111111111111111111111111111111',
}
const HANDLE = { id: 'handle-1' }
const RESULT = { signature: 'sig-1'.padEnd(88, 'x'), messageDigest: 'a'.repeat(64) }

const reduce = (state: CreateMachineState, ...events: Parameters<typeof createMachineReducer>[1][]) =>
  events.reduce((current, event) => createMachineReducer(current, event), state)

describe('create machine: happy path', () => {
  it('recovers a read-back ritual without enabling a duplicate create or inventing a signature', () => {
    const error = reduce(createMachineInitialState(), { type: 'PREPARE' }, { type: 'PREPARED', prepared: PREPARED }, { type: 'FAILED', category: 'confirmation', message: 'unknown' })
    expect(createMachineReducer(error, { type: 'READBACK_OBSERVED', ritualAddress: 'other' })).toBe(error)
    const recovered = createMachineReducer(error, { type: 'READBACK_OBSERVED', ritualAddress: PREPARED.ritualAddress })
    expect(recovered).toEqual({ status: 'recovered', ritualAddress: PREPARED.ritualAddress })
    expect(createStatusCopy(recovered).title).toBe('Locked in.')
    expect(canSubmitCreate(recovered)).toBe(false)
    expect(isTerminalCreateState(recovered)).toBe(true)
    expect(createMachineReducer(recovered, { type: 'PREPARE' })).toBe(recovered)
  })

  it('recovers a ritual the chain shows after a cancelled sheet, even while Try again was open', () => {
    const cancelled = reduce(createMachineInitialState(), { type: 'PREPARE' }, { type: 'PREPARED', prepared: PREPARED }, { type: 'FAILED', category: 'wallet-rejected', message: 'x', unresolved: true })
    expect(canSubmitCreate(cancelled)).toBe(true)
    expect(createMachineReducer(cancelled, { type: 'READBACK_OBSERVED', ritualAddress: 'other' })).toBe(cancelled)
    expect(createMachineReducer(cancelled, { type: 'READBACK_OBSERVED', ritualAddress: PREPARED.ritualAddress })).toEqual({ status: 'recovered', ritualAddress: PREPARED.ritualAddress })
  })

  it('starts idle with nothing in flight', () => {
    const state = createMachineInitialState()
    expect(state.status).toBe('idle')
    expect(canSubmitCreate(state)).toBe(true)
    expect(isTerminalCreateState(state)).toBe(false)
  })

  it('walks idle -> preparing -> awaiting-wallet -> submitted -> confirming -> confirmed', () => {
    const states: string[] = []
    let state = createMachineInitialState()
    for (const event of [
      { type: 'PREPARE' } as const,
      { type: 'PREPARED', prepared: PREPARED } as const,
      { type: 'SUBMITTED', handle: HANDLE } as const,
      { type: 'CONFIRMING' } as const,
      { type: 'CONFIRMED', result: RESULT } as const,
    ]) {
      state = createMachineReducer(state, event)
      states.push(state.status)
    }
    expect(states).toEqual(['preparing', 'awaiting-wallet', 'submitted', 'confirming', 'confirmed'])
  })

  it('exposes the confirmed signature and ritual address', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'CONFIRMING' },
      { type: 'CONFIRMED', result: RESULT },
    )
    expect(state.status).toBe('confirmed')
    if (state.status !== 'confirmed') throw new Error('unreachable')
    expect(state.result.signature).toBe(RESULT.signature)
    expect(state.ritualAddress).toBe(PREPARED.ritualAddress)
  })

  it('treats confirmed as terminal and non-submittable', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'CONFIRMING' },
      { type: 'CONFIRMED', result: RESULT },
    )
    expect(isTerminalCreateState(state)).toBe(true)
    expect(canSubmitCreate(state)).toBe(false)
  })
})

describe('create machine: duplicate submission safety', () => {
  it('blocks submission while work is in flight', () => {
    let state = createMachineReducer(createMachineInitialState(), { type: 'PREPARE' })
    expect(canSubmitCreate(state)).toBe(false)
    state = createMachineReducer(state, { type: 'PREPARED', prepared: PREPARED })
    expect(canSubmitCreate(state)).toBe(false)
    state = createMachineReducer(state, { type: 'SUBMITTED', handle: HANDLE })
    expect(canSubmitCreate(state)).toBe(false)
    state = createMachineReducer(state, { type: 'CONFIRMING' })
    expect(canSubmitCreate(state)).toBe(false)
  })

  it('ignores a duplicate PREPARE while already preparing', () => {
    const first = createMachineReducer(createMachineInitialState(), { type: 'PREPARE' })
    const second = createMachineReducer(first, { type: 'PREPARE' })
    expect(second).toBe(first)
  })

  it('ignores a duplicate SUBMITTED for an in-flight action', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
    )
    const again = createMachineReducer(state, { type: 'SUBMITTED', handle: { id: 'handle-2' } })
    expect(again).toBe(state)
  })

  it('ignores events that do not belong to the current phase', () => {
    const idle = createMachineInitialState()
    expect(createMachineReducer(idle, { type: 'CONFIRMED', result: RESULT })).toBe(idle)
    expect(createMachineReducer(idle, { type: 'SUBMITTED', handle: HANDLE })).toBe(idle)
    expect(createMachineReducer(idle, { type: 'CONFIRMING' })).toBe(idle)
  })
})

describe('create machine: failures', () => {
  it('surfaces a preparation failure as a retryable error', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'FAILED', category: 'preparation', message: 'RPC unavailable' },
    )
    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('unreachable')
    expect(state.category).toBe('preparation')
    expect(state.retryable).toBe(true)
    expect(canSubmitCreate(state)).toBe(true)
  })

  it('treats a user wallet rejection as retryable and non-alarming', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'FAILED', category: 'wallet-rejected', message: 'User declined' },
    )
    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('unreachable')
    expect(state.retryable).toBe(true)
    expect(createStatusCopy(state).tone).toBe('neutral')
  })

  it('marks a post-submission confirmation failure as NOT retryable', () => {
    // The transaction may already be on-chain; blindly resubmitting could
    // create a second ritual.
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'CONFIRMING' },
      { type: 'FAILED', category: 'confirmation', message: 'Blockheight exceeded' },
    )
    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('unreachable')
    expect(state.retryable).toBe(false)
    expect(canSubmitCreate(state)).toBe(false)
    expect(state.submitted).toBe(true)
  })

  it('preserves the signature reference when confirmation fails after submission', () => {
    const state = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'FAILED', category: 'confirmation', message: 'timeout' },
    )
    if (state.status !== 'error') throw new Error('unreachable')
    expect(state.ritualAddress).toBe(PREPARED.ritualAddress)
  })

  it('allows an explicit reset from a retryable error', () => {
    const errored = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'FAILED', category: 'preparation', message: 'boom' },
    )
    const reset = createMachineReducer(errored, { type: 'RESET' })
    expect(reset.status).toBe('idle')
  })

  it('refuses to reset out of a non-retryable post-submission error', () => {
    const stuck = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'FAILED', category: 'confirmation', message: 'timeout' },
    )
    expect(createMachineReducer(stuck, { type: 'RESET' })).toBe(stuck)
  })

  it('refuses to reset a confirmed ritual', () => {
    const done = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'CONFIRMING' },
      { type: 'CONFIRMED', result: RESULT },
    )
    expect(createMachineReducer(done, { type: 'RESET' })).toBe(done)
  })
})

describe('create machine: user-facing copy', () => {
  it('never claims success before authoritative confirmation', () => {
    const submitted = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
    )
    const copy = createStatusCopy(submitted)
    expect(copy.title.toLowerCase()).not.toContain('created')
    expect(copy.title.toLowerCase()).not.toContain('success')
  })

  it('tells the user not to retry after an unconfirmed submission', () => {
    const stuck = reduce(
      createMachineInitialState(),
      { type: 'PREPARE' },
      { type: 'PREPARED', prepared: PREPARED },
      { type: 'SUBMITTED', handle: HANDLE },
      { type: 'FAILED', category: 'confirmation', message: 'timeout' },
    )
    expect(createStatusCopy(stuck).body.toLowerCase()).toMatch(/do not|don't|avoid/)
  })

  it('provides copy for every reachable status', () => {
    const statuses: CreateMachineState['status'][] = [
      'idle', 'preparing', 'awaiting-wallet', 'submitted', 'confirming', 'confirmed', 'error',
    ]
    for (const status of statuses) {
      const state = { status } as CreateMachineState
      const copy = createStatusCopy(state)
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.body.length).toBeGreaterThan(0)
    }
  })
})

describe('create machine: immutability', () => {
  it('returns frozen states', () => {
    const state = createMachineReducer(createMachineInitialState(), { type: 'PREPARE' })
    expect(Object.isFrozen(state)).toBe(true)
  })

  it('never mutates the previous state', () => {
    const before = createMachineInitialState()
    createMachineReducer(before, { type: 'PREPARE' })
    expect(before.status).toBe('idle')
  })

  it('ignores a malformed event without throwing', () => {
    const state = createMachineInitialState()
    // @ts-expect-error deliberate hostile event
    expect(createMachineReducer(state, { type: 'NOPE' })).toBe(state)
    // @ts-expect-error deliberate hostile event
    expect(createMachineReducer(state, null)).toBe(state)
  })
})

describe('create machine: starting again from a retryable error', () => {
  // Seeker 2026-09-25: the Create button stays enabled on a retryable error
  // (canSubmitCreate), but PREPARE was ignored in 'error', so a second attempt
  // that landed on devnet left the screen showing the old failure.
  const failed = () => reduce(createMachineInitialState(), { type: 'PREPARE' }, { type: 'PREPARED', prepared: PREPARED }, { type: 'FAILED', category: 'submission', message: 'x' })
  it('a retry started directly from a retryable error runs through to confirmed', () => {
    const start = failed(); expect(canSubmitCreate(start)).toBe(true)
    const state = reduce(start, { type: 'PREPARE' }, { type: 'PREPARED', prepared: PREPARED }, { type: 'SUBMITTED', handle: HANDLE }, { type: 'CONFIRMING' }, { type: 'CONFIRMED', result: RESULT })
    expect(state.status).toBe('confirmed')
  })
  it('a post-submission error still cannot be restarted', () => {
    const state = reduce(createMachineInitialState(), { type: 'PREPARE' }, { type: 'PREPARED', prepared: PREPARED }, { type: 'SUBMITTED', handle: HANDLE }, { type: 'FAILED', category: 'confirmation', message: 'x' })
    expect(canSubmitCreate(state)).toBe(false)
    expect(reduce(state, { type: 'PREPARE' })).toBe(state)
  })
})
