import { describe, expect, it, vi } from 'vitest'
import { lifecycleCanSubmit, lifecycleInitialState, lifecycleReducer, lifecycleStatusCopy, type LifecycleEvent } from './lifecycleMachine'
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
  it.each(['wallet-rejected', 'submission', 'preparation'] as const)('never calls an unresolved %s outcome not sent', (category) => {
    const state = { status: 'error' as const, category, message: 'cancelled', submitted: false, retryable: true, unresolved: true, ritualAddress: 'ritual' }
    expect(lifecycleStatusCopy(state)).toMatchObject({ title: 'Checking', body: 'Checking whether it went through…', tone: 'neutral' })
  })
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

  it('classifies a blockhash that expires before signing as retryable and pre-submission', async () => {
    let state = lifecycleInitialState()
    const outcome = await runLifecycleAction(deps({ submit: vi.fn(async () => { throw Object.assign(new Error('expired'), { blockhashExpired: true }) }) }), (event) => { state = lifecycleReducer(state, event) })
    expect(outcome).toEqual({ ok: false, category: 'blockhash-expired' })
    expect(state).toMatchObject({ status: 'error', retryable: true, submitted: false, category: 'blockhash-expired' })
  })

  it('keeps wallet rejection retryable', async () => {
    let state = lifecycleInitialState()
    await runLifecycleAction(deps({ submit: vi.fn(async () => { throw new Error('User rejected the request') }) }), (event: LifecycleEvent) => { state = lifecycleReducer(state, event) })
    expect(state).toMatchObject({ status: 'error', category: 'wallet-rejected', retryable: true })
  })
})

describe('lifecycle machine: starting again from a retryable error', () => {
  it('PREPARE from a retryable error advances; from a post-submission error it does not', () => {
    const prepared = { kind: 'fund' as const, messageDigest: 'a'.repeat(64), ritualAddress: 'R' }
    const retryable = [{ type: 'PREPARE' as const }, { type: 'PREPARED' as const, prepared }, { type: 'FAILED' as const, category: 'submission' as const, message: 'x' }].reduce(lifecycleReducer, lifecycleInitialState())
    expect(lifecycleCanSubmit(retryable)).toBe(true)
    expect(lifecycleReducer(retryable, { type: 'PREPARE' }).status).toBe('preparing')
    const stuck = [{ type: 'PREPARE' as const }, { type: 'PREPARED' as const, prepared }, { type: 'SUBMITTED' as const, handle: { id: 'h' } }, { type: 'FAILED' as const, category: 'confirmation' as const, message: 'x' }].reduce(lifecycleReducer, lifecycleInitialState())
    expect(lifecycleReducer(stuck, { type: 'PREPARE' })).toBe(stuck)
  })
})

describe('lifecycle machine: a confirmed step can be cleared for the next step on the same screen', () => {
  it('RESET after confirmed returns to idle so the next action can start', () => {
    const confirmed = { status: 'confirmed' as const, ritualAddress: 'ritual', result }
    const next = lifecycleReducer(confirmed as never, { type: 'RESET' })
    expect(next.status).toBe('idle')
    expect(lifecycleCanSubmit(next)).toBe(true)
  })

  it('confirmed ignores every other event (no accidental resubmission)', () => {
    const confirmed = { status: 'confirmed' as const, ritualAddress: 'ritual', result }
    expect(lifecycleReducer(confirmed as never, { type: 'PREPARE' })).toBe(confirmed)
  })
})

