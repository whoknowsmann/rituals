import { describe, expect, it } from 'vitest'
import { shouldReturnToFirstCreateStep } from './navigationGuard'

describe('solo create navigation guard', () => {
  it('intercepts leaving a later step while idle', () => {
    expect(shouldReturnToFirstCreateStep({ step: 2, isBusy: false, isConfirmed: false })).toBe(true)
    expect(shouldReturnToFirstCreateStep({ step: 3, isBusy: false, isConfirmed: false })).toBe(true)
  })

  it('allows leaving step one, a busy action, or a confirmed create', () => {
    expect(shouldReturnToFirstCreateStep({ step: 1, isBusy: false, isConfirmed: false })).toBe(false)
    expect(shouldReturnToFirstCreateStep({ step: 2, isBusy: true, isConfirmed: false })).toBe(false)
    expect(shouldReturnToFirstCreateStep({ step: 2, isBusy: false, isConfirmed: true })).toBe(false)
    expect(shouldReturnToFirstCreateStep({ step: 2, isBusy: false, isConfirmed: false, actionType: 'NAVIGATE' })).toBe(false)
  })
})
