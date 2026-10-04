import { describe, expect, it } from 'vitest'
import { HOLD_DURATION_MS, holdProgress, quartersCrossed, shouldUseTapFallback } from './holdButtonLogic'

describe('HoldButton pure logic', () => {
  it('holds long enough to watch it fill', () => {
    expect(HOLD_DURATION_MS).toBe(1400)
  })

  it.each([
    [0, 0],
    [700, 0.5],
    [1400, 1],
    [2000, 1],
  ])('clamps %s ms to %s progress', (elapsed, expected) => {
    expect(holdProgress(elapsed, HOLD_DURATION_MS)).toBe(expected)
  })

  it('ticks once per quarter mark, never while draining', () => {
    expect(quartersCrossed(0.2, 0.3)).toBe(1)
    expect(quartersCrossed(0.1, 0.8)).toBe(3)
    expect(quartersCrossed(0.3, 0.4)).toBe(0)
    expect(quartersCrossed(0.8, 0.1)).toBe(0)
  })

  it('falls back to a tap only when accessibility reports a screen reader', () => {
    expect(shouldUseTapFallback(true)).toBe(true)
    expect(shouldUseTapFallback(false)).toBe(false)
  })
})
