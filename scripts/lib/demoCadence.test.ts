import { describe, expect, it } from 'vitest'
import { DEMO_CADENCE, generateRitualSchedule } from '../../src/domain/rituals/schedule'
import { demoCadenceFrom } from './demoCadence'

describe('demoCadenceFrom', () => {
  it('returns the unchanged demo cadence when nothing is overridden', () => {
    expect(demoCadenceFrom({})).toBe(DEMO_CADENCE)
    expect(DEMO_CADENCE).toMatchObject({ periodSeconds: 180, claimWindowSeconds: 90, resolutionGraceSeconds: 60 })
  })

  it('widens the check-in window and stretches the period to fit', () => {
    const cadence = demoCadenceFrom({ claimWindowSeconds: 300 })
    expect(cadence).toMatchObject({ claimWindowSeconds: 300, resolutionGraceSeconds: 60, periodSeconds: 390, accelerated: true })
    const schedule = generateRitualSchedule({ firstEventAt: 1_000_000, eventCount: 3, cadence })
    expect(schedule[0].claimDeadlineAt - schedule[0].claimOpensAt).toBe(300)
    for (let i = 1; i < schedule.length; i += 1) expect(schedule[i].claimOpensAt).toBeGreaterThan(schedule[i - 1].resolutionDeadlineAt)
  })

  it('keeps an explicit period that fits', () => {
    expect(demoCadenceFrom({ claimWindowSeconds: 240, graceSeconds: 60, periodSeconds: 420 }).periodSeconds).toBe(420)
  })

  it('rejects windows that do not fit or are out of range', () => {
    expect(() => demoCadenceFrom({ claimWindowSeconds: 300, periodSeconds: 300 })).toThrow(/period-seconds/)
    expect(() => demoCadenceFrom({ claimWindowSeconds: 10 })).toThrow(/claim-window-seconds/)
    expect(() => demoCadenceFrom({ graceSeconds: 5 })).toThrow(/grace-seconds/)
    expect(() => demoCadenceFrom({ claimWindowSeconds: 90.5 })).toThrow(/claim-window-seconds/)
  })
})
