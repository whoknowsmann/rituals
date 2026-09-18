import { describe, expect, it, vi } from 'vitest'
import { runCreateRitual, type CreateRitualDeps } from './runCreateRitual'
import { canSubmitCreate, createMachineInitialState, createMachineReducer, type CreateMachineEvent } from './createMachine'

const PREPARED = {
  kind: 'create' as const,
  messageDigest: 'd'.repeat(64),
  ritualAddress: 'RitUaL1111111111111111111111111111111111111',
}
const HANDLE = Object.freeze({ id: 'handle-1' })
const RESULT = {
  signature: 's'.repeat(88),
  messageDigest: 'd'.repeat(64),
  actionKind: 'create' as const,
}

function deps(overrides: Partial<CreateRitualDeps> = {}): CreateRitualDeps {
  return {
    prepare: vi.fn(async () => PREPARED),
    submit: vi.fn(async () => HANDLE),
    confirm: vi.fn(async () => RESULT),
    ...overrides,
  } as CreateRitualDeps
}

const collect = () => {
  const events: CreateMachineEvent[] = []
  return { events, dispatch: (event: CreateMachineEvent) => { events.push(event) } }
}

describe('runCreateRitual: success', () => {
  it('dispatches the full lifecycle in order', async () => {
    const { events, dispatch } = collect()
    await runCreateRitual(deps(), dispatch)
    expect(events.map((event) => event.type)).toEqual([
      'PREPARE', 'PREPARED', 'SUBMITTED', 'CONFIRMING', 'CONFIRMED',
    ])
  })

  it('returns the confirmed result', async () => {
    const { dispatch } = collect()
    const outcome = await runCreateRitual(deps(), dispatch)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error('unreachable')
    expect(outcome.result.signature).toBe(RESULT.signature)
  })

  it('passes the prepared action to submit, and the handle to confirm', async () => {
    const d = deps()
    const { dispatch } = collect()
    await runCreateRitual(d, dispatch)
    expect(d.submit).toHaveBeenCalledWith(PREPARED)
    expect(d.confirm).toHaveBeenCalledWith(HANDLE)
  })

  it('calls each step exactly once', async () => {
    const d = deps()
    const { dispatch } = collect()
    await runCreateRitual(d, dispatch)
    expect(d.prepare).toHaveBeenCalledTimes(1)
    expect(d.submit).toHaveBeenCalledTimes(1)
    expect(d.confirm).toHaveBeenCalledTimes(1)
  })

  it('drives a real machine to confirmed', async () => {
    let state = createMachineInitialState()
    await runCreateRitual(deps(), (event: CreateMachineEvent) => { state = createMachineReducer(state, event) })
    expect(state.status).toBe('confirmed')
  })
})

describe('runCreateRitual: failures', () => {
  it('reports a preparation failure as retryable and never submits', async () => {
    const d = deps({ prepare: vi.fn(async () => { throw new Error('rpc down') }) })
    const { events, dispatch } = collect()
    const outcome = await runCreateRitual(d, dispatch)
    expect(outcome.ok).toBe(false)
    expect(d.submit).not.toHaveBeenCalled()
    const failure = events.at(-1)
    expect(failure?.type).toBe('FAILED')
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.category).toBe('preparation')
  })

  it('classifies a user rejection as wallet-rejected', async () => {
    const d = deps({ submit: vi.fn(async () => { throw new Error('User rejected the request') }) })
    const { events, dispatch } = collect()
    await runCreateRitual(d, dispatch)
    const failure = events.at(-1)
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.category).toBe('wallet-rejected')
  })

  it('classifies a declined authorization as wallet-rejected', async () => {
    const d = deps({ submit: vi.fn(async () => { throw new Error('authorization declined by user') }) })
    const { events, dispatch } = collect()
    await runCreateRitual(d, dispatch)
    const failure = events.at(-1)
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.category).toBe('wallet-rejected')
  })

  it('classifies other submission errors as submission failures', async () => {
    const d = deps({ submit: vi.fn(async () => { throw new Error('blockhash not found') }) })
    const { events, dispatch } = collect()
    await runCreateRitual(d, dispatch)
    const failure = events.at(-1)
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.category).toBe('submission')
  })

  it('classifies a post-submission failure as confirmation', async () => {
    const d = deps({ confirm: vi.fn(async () => { throw new Error('block height exceeded') }) })
    const { events, dispatch } = collect()
    await runCreateRitual(d, dispatch)
    const failure = events.at(-1)
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.category).toBe('confirmation')
  })

  it('leaves a real machine non-retryable after a confirmation failure', async () => {
    let state = createMachineInitialState()
    const d = deps({ confirm: vi.fn(async () => { throw new Error('timeout') }) })
    await runCreateRitual(d, (event: CreateMachineEvent) => { state = createMachineReducer(state, event) })
    expect(state.status).toBe('error')
    expect(canSubmitCreate(state)).toBe(false)
  })

  it('never leaks a raw error message into the dispatched failure', async () => {
    const secret = 'https://internal-rpc.example/secret-key-abc123'
    const d = deps({ prepare: vi.fn(async () => { throw new Error(`failed fetching ${secret}`) }) })
    const { events, dispatch } = collect()
    await runCreateRitual(d, dispatch)
    const failure = events.at(-1)
    if (failure?.type !== 'FAILED') throw new Error('unreachable')
    expect(failure.message).not.toContain(secret)
  })

  it('handles a non-Error thrown value without crashing', async () => {
    const d = deps({ prepare: vi.fn(async () => { throw 'plain string' }) })
    const { dispatch } = collect()
    const outcome = await runCreateRitual(d, dispatch)
    expect(outcome.ok).toBe(false)
  })
})
