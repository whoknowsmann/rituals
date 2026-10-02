import { describe, expect, it } from 'vitest'
import { DEMO_CADENCE, DEMO_SOLO_CADENCE, DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS, firstEventStart, generateRitualSchedule } from './schedule'

/**
 * Solo demo cadence (single-blade plan §2): Phantom on a Seeker can take ~70 s
 * of a 90 s check-in, so a solo promise gets a 5-minute window. The group
 * lobby keeps DEMO_CADENCE.
 */
describe('DEMO_SOLO_CADENCE', () => {
  it('has a 300 s check-in window and leaves 30 s between a week resolving and the next opening', () => {
    expect(DEMO_SOLO_CADENCE.claimWindowSeconds).toBe(300)
    expect(DEMO_SOLO_CADENCE.accelerated).toBe(true)
    expect(DEMO_SOLO_CADENCE.periodSeconds).toBeGreaterThanOrEqual(
      DEMO_SOLO_CADENCE.claimWindowSeconds + DEMO_SOLO_CADENCE.resolutionGraceSeconds + 30,
    )
  })

  it('leaves the group demo cadence unchanged', () => {
    expect(DEMO_CADENCE.claimWindowSeconds).toBe(90)
    expect(DEMO_CADENCE.periodSeconds).toBe(180)
  })

  it('builds a schedule the program accepts (opens < deadline < resolution < next opens)', () => {
    const now = 1_790_000_000
    const first = firstEventStart({ cadence: DEMO_SOLO_CADENCE, referenceSeconds: now, memberCount: 1 })
    // Week 1 opens within ~2 minutes of create; the create's blockhash expires
    // well before that, so a create that lands can always still activate.
    expect(first - now).toBe(DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS)
    expect(DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS).toBeLessThanOrEqual(120)
    const schedule = generateRitualSchedule({ firstEventAt: first, eventCount: 16, cadence: DEMO_SOLO_CADENCE })
    schedule.forEach((entry, index) => {
      expect(entry.claimOpensAt).toBeLessThan(entry.claimDeadlineAt)
      expect(entry.claimDeadlineAt).toBeLessThan(entry.resolutionDeadlineAt)
      if (index > 0) expect(entry.claimOpensAt).toBeGreaterThan(schedule[index - 1].resolutionDeadlineAt)
    })
    expect(schedule[0].claimDeadlineAt - schedule[0].claimOpensAt).toBe(300)
  })
})
