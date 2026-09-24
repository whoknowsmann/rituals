import { describe, expect, it, vi } from 'vitest'
import { lifecycleInitialState, lifecycleReducer, type LifecycleEvent } from './lifecycleMachine'
import { runLifecycleAction, type LifecycleActionDeps } from './runLifecycleAction'

const prepared = { kind: 'fund' as const, messageDigest: 'a'.repeat(64), ritualAddress: 'ritual' }
const handle = { id: 'a'.repeat(64) }
const result = { signature: '1'.repeat(64), messageDigest: 'a'.repeat(64) }
const deps = (overrides: Partial<LifecycleActionDeps> = {}): LifecycleActionDeps => ({
  prepare: vi.fn(async () => prepared),
  submit: vi.fn(async () => handle),
  confirm: vi.fn(async () => result),
  ...overrides,
})

describe('runLifecycleAction', () => {
  it('drives review through wallet and authoritative confirmation', async () => {
    let state = lifecycleInitialState()
    const events: LifecycleEvent[] = []
    const outcome = await runLifecycleAction(deps(), (event) => { events.push(event); state = lifecycleReducer(state, event) })
    expect(outcome).toEqual({ ok: true, result })
    expect(state.status).toBe('confirmed')
    expect(events.map((event) => event.type)).toEqual(['PREPARE', 'PREPARED', 'SUBMITTED', 'CONFIRMING', 'CONFIRMED'])
  })

  it('makes post-submission failures non-retryable', async () => {
    let state = lifecycleInitialState()
    const outcome = await runLifecycleAction(deps({ confirm: vi.fn(async () => { throw new Error('expired') }) }), (event) => { state = lifecycleReducer(state, event) })
    expect(outcome).toEqual({ ok: false, category: 'confirmation' })
    expect(state).toMatchObject({ status: 'error', retryable: false, submitted: true })
  })

  it('keeps wallet rejection retryable', async () => {
    let state = lifecycleInitialState()
    await runLifecycleAction(deps({ submit: vi.fn(async () => { throw new Error('User rejected the request') }) }), (event) => { state = lifecycleReducer(state, event) })
    expect(state).toMatchObject({ status: 'error', category: 'wallet-rejected', retryable: true })
  })
})
