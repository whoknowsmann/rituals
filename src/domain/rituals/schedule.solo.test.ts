import { describe, expect, it } from 'vitest'
import {
  DEMO_CADENCE,
  DEMO_SOLO_CADENCE,
  DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS,
  REAL_SOLO_CADENCE,
  WEEKLY_CADENCE,
  demoWeekMinutesLabel,
  describeCadence,
  firstEventStart,
  generateRitualSchedule,
  isDemoSpeedWindow,
} from './schedule'

const HOUR = 3600
const DAY = 24 * HOUR

/**
 * Solo demo cadence (single-blade plan §2): Phantom on a Seeker can take ~70 s
 * of a 90 s check-in, so a solo promise gets a 5-minute window. The group
 * lobby keeps DEMO_CADENCE.
 */
describe('DEMO_SOLO_CADENCE', () => {
  it('is a 2-minute week: 90 s to stamp, 20 s grace, 10 s before the next opens', () => {
    expect(DEMO_SOLO_CADENCE.claimWindowSeconds).toBe(90)
    expect(DEMO_SOLO_CADENCE.resolutionGraceSeconds).toBe(20)
    expect(DEMO_SOLO_CADENCE.periodSeconds).toBe(120)
    expect(DEMO_SOLO_CADENCE.accelerated).toBe(true)
    expect(DEMO_SOLO_CADENCE.periodSeconds).toBeGreaterThan(DEMO_SOLO_CADENCE.claimWindowSeconds + DEMO_SOLO_CADENCE.resolutionGraceSeconds)
  })

  it('leaves the group demo cadence unchanged', () => {
    expect(DEMO_CADENCE.claimWindowSeconds).toBe(90)
    expect(DEMO_CADENCE.periodSeconds).toBe(180)
  })

  it('builds a schedule the program accepts (opens < deadline < resolution < next opens)', () => {
    const now = 1_790_000_000
    const first = firstEventStart({ cadence: DEMO_SOLO_CADENCE, referenceSeconds: now, memberCount: 1 })
    // Week 1 opens 90 s after create: longer than a blockhash lives (~60-90 s),
    // so a create that lands at all lands before week 1 opens and can activate.
    expect(first - now).toBe(DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS)
    expect(DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS).toBe(90)
    const schedule = generateRitualSchedule({ firstEventAt: first, eventCount: 16, cadence: DEMO_SOLO_CADENCE })
    schedule.forEach((entry, index) => {
      expect(entry.claimOpensAt).toBeLessThan(entry.claimDeadlineAt)
      expect(entry.claimDeadlineAt).toBeLessThan(entry.resolutionDeadlineAt)
      if (index > 0) expect(entry.claimOpensAt).toBeGreaterThan(schedule[index - 1].resolutionDeadlineAt)
    })
    expect(schedule[0].claimDeadlineAt - schedule[0].claimOpensAt).toBe(90)
  })
})

/**
 * Real solo weeks ("stamp any day this week", approved 2026-10-04): week 1
 * opens ~2 min after create, check-in 6 days, 23 h grace, 7-day period.
 */
describe('REAL_SOLO_CADENCE', () => {
  const now = 1_790_000_000

  it('is a 7-day period with a 6-day check-in and 23 h grace, not accelerated', () => {
    expect(REAL_SOLO_CADENCE.periodSeconds).toBe(7 * DAY)
    expect(REAL_SOLO_CADENCE.claimWindowSeconds).toBe(6 * DAY)
    expect(REAL_SOLO_CADENCE.resolutionGraceSeconds).toBe(23 * HOUR)
    expect(REAL_SOLO_CADENCE.accelerated).toBe(false)
    expect(REAL_SOLO_CADENCE.label).toBe('Weekly')
  })

  it('opens week 1 90 s after create instead of next same weekday', () => {
    expect(firstEventStart({ cadence: REAL_SOLO_CADENCE, referenceSeconds: now, memberCount: 1 }) - now).toBe(90)
  })

  it('builds 1- and 16-week schedules the program accepts (opens < deadline < resolution < next opens)', () => {
    const first = firstEventStart({ cadence: REAL_SOLO_CADENCE, referenceSeconds: now, memberCount: 1 })
    for (const eventCount of [1, 16]) {
      const schedule = generateRitualSchedule({ firstEventAt: first, eventCount, cadence: REAL_SOLO_CADENCE })
      expect(schedule).toHaveLength(eventCount)
      schedule.forEach((entry, index) => {
        expect(entry.claimOpensAt).toBeLessThan(entry.claimDeadlineAt)
        expect(entry.claimDeadlineAt).toBeLessThan(entry.resolutionDeadlineAt)
        if (index > 0) expect(entry.claimOpensAt).toBeGreaterThan(schedule[index - 1].resolutionDeadlineAt)
      })
    }
  })

  it('is described as weekly, never as demo', () => {
    const text = describeCadence(REAL_SOLO_CADENCE).toLowerCase()
    expect(text).toContain('week')
    expect(text).not.toContain('demo')
  })

  it('leaves the other cadences where they were (no lead field; weekly still next same weekday)', () => {
    for (const cadence of [WEEKLY_CADENCE, DEMO_CADENCE, DEMO_SOLO_CADENCE]) expect(cadence.firstEventLeadSeconds).toBeUndefined()
    expect(firstEventStart({ cadence: WEEKLY_CADENCE, referenceSeconds: now, memberCount: 2 })).toBe(now + 7 * DAY)
    expect(firstEventStart({ cadence: DEMO_SOLO_CADENCE, referenceSeconds: now, memberCount: 1 })).toBe(now + DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS)
  })

  it('rejects a cadence with a non-positive lead', () => {
    expect(() => firstEventStart({ cadence: { ...REAL_SOLO_CADENCE, firstEventLeadSeconds: 0 }, referenceSeconds: now, memberCount: 1 })).toThrow()
  })
})

describe('demo speed from the on-chain schedule (no local record)', () => {
  it('a check-in window under a day is demo speed; six days is not', () => {
    expect(isDemoSpeedWindow(1_000, 1_300)).toBe(true)
    expect(isDemoSpeedWindow(1_000, 1_000 + 6 * DAY)).toBe(false)
  })

  it('names the demo week length in minutes from two openings, else the shipped solo period', () => {
    expect(demoWeekMinutesLabel([1_000, 1_390])).toBe('6.5')
    expect(demoWeekMinutesLabel([1_000, 1_180])).toBe('3')
    expect(demoWeekMinutesLabel([1_000, 1_120])).toBe('2')
    expect(demoWeekMinutesLabel([1_000])).toBe('2')
  })
})
