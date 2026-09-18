import { describe, expect, it, vi } from 'vitest'
import { createMachineInitialState, createMachineReducer, canSubmitCreate, isTerminalCreateState, createStatusCopy } from './createMachine'
import { runCreateRitual, type CreateRitualDeps } from './runCreateRitual'

/**
 * The hook is a thin shell over the reducer and orchestrator, both covered
 * directly. These tests pin the behaviours the hook itself adds: single-flight
 * guarding and correct derived flags.
 */

const PREPARED = { kind: 'create' as const, messageDigest: 'd'.repeat(64), ritualAddress: 'R'.repeat(43) }
const HANDLE = { id: 'h' }
const RESULT = { signature: 's'.repeat(88), messageDigest: 'd'.repeat(64) }

function deps(): CreateRitualDeps {
  return {
    prepare: vi.fn(async () => PREPARED),
    submit: vi.fn(async () => HANDLE),
    confirm: vi.fn(async () => RESULT),
  } as never
}

/** Mirrors the hook's single-flight guard without a renderer. */
function makeRunner() {
  let state = createMachineInitialState()
  let inFlight = false
  const dispatch = (event: Parameters<typeof createMachineReducer>[1]) => {
    state = createMachineReducer(state, event)
  }
  return {
    get state() { return state },
    reset() { dispatch({ type: 'RESET' }) },
    async start(d: CreateRitualDeps) {
      if (inFlight) return 'blocked' as const
      if (!canSubmitCreate(state)) return 'blocked' as const
      inFlight = true
      try { await runCreateRitual(d, dispatch); return 'ran' as const }
      finally { inFlight = false }
    },
  }
}

describe('useCreateRitual behaviour', () => {
  it('reaches confirmed through a full run', async () => {
    const runner = makeRunner()
    await runner.start(deps())
    expect(runner.state.status).toBe('confirmed')
  })

  it('blocks a second start once the machine is terminal', async () => {
    const runner = makeRunner()
    await runner.start(deps())
    const second = await runner.start(deps())
    expect(second).toBe('blocked')
  })

  it('blocks starting from a non-retryable post-submission error', async () => {
    const runner = makeRunner()
    const failing = { ...deps(), confirm: vi.fn(async () => { throw new Error('timeout') }) } as never
    await runner.start(failing)
    expect(runner.state.status).toBe('error')
    const second = await runner.start(deps())
    expect(second).toBe('blocked')
  })

  it('allows a retry after a pre-network failure', async () => {
    const runner = makeRunner()
    const failing = { ...deps(), prepare: vi.fn(async () => { throw new Error('rpc') }) } as never
    await runner.start(failing)
    expect(runner.state.status).toBe('error')
    // A pre-network failure stays retryable, which is what enables reset().
    expect(canSubmitCreate(runner.state)).toBe(true)
    runner.reset()
    expect(runner.state.status).toBe('idle')
    const second = await runner.start(deps())
    expect(second).toBe('ran')
    expect(runner.state.status).toBe('confirmed')
  })

  it('derives busy correctly across the journey', () => {
    let state = createMachineInitialState()
    const busy = () => !canSubmitCreate(state) && !isTerminalCreateState(state)
    expect(busy()).toBe(false)
    state = createMachineReducer(state, { type: 'PREPARE' })
    expect(busy()).toBe(true)
    state = createMachineReducer(state, { type: 'PREPARED', prepared: PREPARED })
    expect(busy()).toBe(true)
    state = createMachineReducer(state, { type: 'SUBMITTED', handle: HANDLE })
    expect(busy()).toBe(true)
    state = createMachineReducer(state, { type: 'CONFIRMING' })
    expect(busy()).toBe(true)
    state = createMachineReducer(state, { type: 'CONFIRMED', result: RESULT })
    expect(busy()).toBe(false)
  })

  it('never shows success copy before confirmation', () => {
    let state = createMachineInitialState()
    for (const event of [
      { type: 'PREPARE' } as const,
      { type: 'PREPARED', prepared: PREPARED } as const,
      { type: 'SUBMITTED', handle: HANDLE } as const,
      { type: 'CONFIRMING' } as const,
    ]) {
      state = createMachineReducer(state, event)
      expect(createStatusCopy(state).tone).not.toBe('success')
    }
    state = createMachineReducer(state, { type: 'CONFIRMED', result: RESULT })
    expect(createStatusCopy(state).tone).toBe('success')
  })
})
