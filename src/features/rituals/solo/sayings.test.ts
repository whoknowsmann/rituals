import { describe, expect, it } from 'vitest'
import { KEPT_SAYINGS, keptSaying, pickSaying, startedSaying, STARTED_SAYINGS } from './sayings'

describe('stamp sayings', () => {
  it.each([1, 2, 16])('does not suggest next week on a %s-week final stamp or receipt', (weeks) => {
    const lines = Array.from({ length: 100 }, (_, index) => keptSaying(`ritual-${index}`, weeks - 1, weeks))
    expect(lines).not.toContain('Same time next week.')
    expect(lines.every((line) => KEPT_SAYINGS.includes(line))).toBe(true)
  })
  it('is stable for a seed, so a stamp and its receipt say the same thing', () => {
    expect(keptSaying('abc', 2)).toBe(keptSaying('abc', 2))
    expect(KEPT_SAYINGS).toContain(keptSaying('abc', 2))
    expect(STARTED_SAYINGS).toContain(startedSaying('abc'))
  })

  it('varies across weeks', () => {
    const lines = new Set(Array.from({ length: 12 }, (_, week) => keptSaying('ritual-address', week)))
    expect(lines.size).toBeGreaterThan(4)
  })

  it('never repeats a line inside one ritual, up to the 16-week maximum (Jack, 2026-10-09)', () => {
    expect(new Set(KEPT_SAYINGS).size).toBe(KEPT_SAYINGS.length)
    expect(KEPT_SAYINGS.length).toBeGreaterThanOrEqual(17)
    for (let ritual = 0; ritual < 300; ritual += 1) {
      for (const weeks of [2, 6, 8, 16]) {
        const lines = Array.from({ length: weeks }, (_, week) => keptSaying(`ritual-${ritual}`, week, weeks))
        expect(new Set(lines).size).toBe(weeks)
      }
    }
  })

  it('handles any seed', () => {
    expect(pickSaying(['only'], '')).toBe('only')
  })
})
