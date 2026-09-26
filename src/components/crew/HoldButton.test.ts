import { describe, expect, it } from 'vitest'
import { HOLD_DURATION_MS, holdProgress, shouldUseTapFallback } from './holdButtonLogic'

describe('HoldButton pure logic', () => {
  it('uses a short commitment hold duration', () => {
    expect(HOLD_DURATION_MS).toBe(700)
  })

  it.each([
    [0, 0],
    [350, 0.5],
    [700, 1],
    [1200, 1],
  ])('clamps %s ms to %s progress', (elapsed, expected) => {
    expect(holdProgress(elapsed, HOLD_DURATION_MS)).toBe(expected)
  })

  it('falls back to a tap only when accessibility reports a screen reader', () => {
    expect(shouldUseTapFallback(true)).toBe(true)
    expect(shouldUseTapFallback(false)).toBe(false)
  })
})
