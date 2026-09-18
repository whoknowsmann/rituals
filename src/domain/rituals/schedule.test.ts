import { describe, expect, it } from 'vitest'
import {
  DEMO_CADENCE,
  WEEKLY_CADENCE,
  CLAIM_WINDOW_SECONDS,
  RESOLUTION_GRACE_SECONDS,
  DEMO_EVENT_PERIOD_SECONDS,
  DEMO_CLAIM_WINDOW_SECONDS,
  DEMO_RESOLUTION_GRACE_SECONDS,
  WEEKDAYS,
  nextWeekdayOccurrence,
  generateRitualSchedule,
  describeCadence,
  localOffsetLabel,
} from './schedule'

const MONDAY = 1
const SUNDAY = 0
const DAY = 86_400
const WEEK = 7 * DAY

describe('cadence constants', () => {
  it('locks the P0 weekly cadence to seven days', () => {
    expect(WEEKLY_CADENCE.periodSeconds).toBe(WEEK)
    expect(WEEKLY_CADENCE.claimWindowSeconds).toBe(CLAIM_WINDOW_SECONDS)
    expect(WEEKLY_CADENCE.resolutionGraceSeconds).toBe(RESOLUTION_GRACE_SECONDS)
  })

  it('locks the claim window to 48 hours and grace to 24 hours', () => {
    expect(CLAIM_WINDOW_SECONDS).toBe(48 * 3600)
    expect(RESOLUTION_GRACE_SECONDS).toBe(24 * 3600)
  })

  it('keeps the demo cadence strictly shorter than the real cadence', () => {
    expect(DEMO_CADENCE.periodSeconds).toBe(DEMO_EVENT_PERIOD_SECONDS)
    expect(DEMO_CADENCE.claimWindowSeconds).toBe(DEMO_CLAIM_WINDOW_SECONDS)
    expect(DEMO_CADENCE.resolutionGraceSeconds).toBe(DEMO_RESOLUTION_GRACE_SECONDS)
    expect(DEMO_CADENCE.periodSeconds).toBeLessThan(WEEKLY_CADENCE.periodSeconds)
    expect(DEMO_CADENCE.claimWindowSeconds).toBeLessThan(WEEKLY_CADENCE.claimWindowSeconds)
    expect(DEMO_CADENCE.resolutionGraceSeconds).toBeLessThan(WEEKLY_CADENCE.resolutionGraceSeconds)
  })

  it('keeps every demo window long enough to be observed and signed', () => {
    expect(DEMO_CADENCE.claimWindowSeconds).toBeGreaterThanOrEqual(30)
    expect(DEMO_CADENCE.resolutionGraceSeconds).toBeGreaterThanOrEqual(30)
  })

  it('preserves claim-before-resolution ordering in both cadences', () => {
    for (const cadence of [WEEKLY_CADENCE, DEMO_CADENCE]) {
      expect(cadence.claimWindowSeconds + cadence.resolutionGraceSeconds)
        .toBeLessThanOrEqual(cadence.periodSeconds)
    }
  })

  it('marks only the demo cadence as accelerated', () => {
    expect(WEEKLY_CADENCE.accelerated).toBe(false)
    expect(DEMO_CADENCE.accelerated).toBe(true)
  })
})

describe('nextWeekdayOccurrence', () => {
  it('returns a strictly future timestamp for the same weekday', () => {
    // 2026-09-21 is a Monday, 12:00:00 UTC
    const monday = Date.UTC(2026, 8, 21, 12, 0, 0) / 1000
    const next = nextWeekdayOccurrence(monday, MONDAY)
    expect(next).toBeGreaterThan(monday)
    expect(new Date(next * 1000).getUTCDay()).toBe(MONDAY)
  })

  it('advances to the next week when the weekday already passed today', () => {
    const monday = Date.UTC(2026, 8, 21, 12, 0, 0) / 1000
    const next = nextWeekdayOccurrence(monday, MONDAY)
    expect(next - monday).toBeLessThanOrEqual(WEEK)
  })

  it('finds the nearest future occurrence of a later weekday', () => {
    const monday = Date.UTC(2026, 8, 21, 12, 0, 0) / 1000
    const wednesday = nextWeekdayOccurrence(monday, 3)
    expect(new Date(wednesday * 1000).getUTCDay()).toBe(3)
    expect(wednesday - monday).toBeLessThan(WEEK)
  })

  it('handles the week wrap from Saturday to Sunday', () => {
    const saturday = Date.UTC(2026, 8, 26, 12, 0, 0) / 1000
    const sunday = nextWeekdayOccurrence(saturday, SUNDAY)
    expect(new Date(sunday * 1000).getUTCDay()).toBe(SUNDAY)
    expect(sunday).toBeGreaterThan(saturday)
  })

  it('rejects an out-of-range weekday', () => {
    const now = Date.UTC(2026, 8, 21, 12, 0, 0) / 1000
    expect(() => nextWeekdayOccurrence(now, -1)).toThrow()
    expect(() => nextWeekdayOccurrence(now, 7)).toThrow()
    expect(() => nextWeekdayOccurrence(now, 1.5)).toThrow()
  })

  it('rejects a non-finite or negative reference time', () => {
    expect(() => nextWeekdayOccurrence(Number.NaN, MONDAY)).toThrow()
    expect(() => nextWeekdayOccurrence(-1, MONDAY)).toThrow()
  })

  it('exposes exactly seven named weekdays in index order', () => {
    expect(WEEKDAYS).toHaveLength(7)
    expect(WEEKDAYS[0]).toBe('Sunday')
    expect(WEEKDAYS[6]).toBe('Saturday')
  })
})

describe('generateRitualSchedule', () => {
  const start = Date.UTC(2026, 8, 21, 12, 0, 0) / 1000

  it('generates one entry per event with contiguous indices', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 4, cadence: WEEKLY_CADENCE })
    expect(schedule).toHaveLength(4)
    schedule.forEach((entry, index) => expect(entry.eventIndex).toBe(index))
  })

  it('spaces events by exactly one cadence period', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 3, cadence: WEEKLY_CADENCE })
    expect(schedule[0].claimOpensAt).toBe(start)
    expect(schedule[1].claimOpensAt).toBe(start + WEEK)
    expect(schedule[2].claimOpensAt).toBe(start + 2 * WEEK)
  })

  it('applies the claim window and resolution grace to every entry', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 2, cadence: WEEKLY_CADENCE })
    for (const entry of schedule) {
      expect(entry.claimDeadlineAt - entry.claimOpensAt).toBe(CLAIM_WINDOW_SECONDS)
      expect(entry.resolutionDeadlineAt - entry.claimDeadlineAt).toBe(RESOLUTION_GRACE_SECONDS)
    }
  })

  it('keeps every entry internally ordered', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 16, cadence: WEEKLY_CADENCE })
    for (const entry of schedule) {
      expect(entry.claimOpensAt).toBeLessThan(entry.claimDeadlineAt)
      expect(entry.claimDeadlineAt).toBeLessThan(entry.resolutionDeadlineAt)
    }
  })

  it('keeps events strictly chronological with no overlap', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 16, cadence: WEEKLY_CADENCE })
    for (let index = 1; index < schedule.length; index += 1) {
      expect(schedule[index].claimOpensAt).toBeGreaterThan(schedule[index - 1].resolutionDeadlineAt)
    }
  })

  it('produces a non-overlapping chronological demo schedule too', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 4, cadence: DEMO_CADENCE })
    for (let index = 1; index < schedule.length; index += 1) {
      expect(schedule[index].claimOpensAt).toBeGreaterThan(schedule[index - 1].resolutionDeadlineAt)
    }
  })

  it('accepts the 1 and 16 event boundaries', () => {
    expect(generateRitualSchedule({ firstEventAt: start, eventCount: 1, cadence: WEEKLY_CADENCE })).toHaveLength(1)
    expect(generateRitualSchedule({ firstEventAt: start, eventCount: 16, cadence: WEEKLY_CADENCE })).toHaveLength(16)
  })

  it('rejects event counts outside the protocol range', () => {
    expect(() => generateRitualSchedule({ firstEventAt: start, eventCount: 0, cadence: WEEKLY_CADENCE })).toThrow()
    expect(() => generateRitualSchedule({ firstEventAt: start, eventCount: 17, cadence: WEEKLY_CADENCE })).toThrow()
    expect(() => generateRitualSchedule({ firstEventAt: start, eventCount: 2.5, cadence: WEEKLY_CADENCE })).toThrow()
  })

  it('rejects an invalid first-event timestamp', () => {
    expect(() => generateRitualSchedule({ firstEventAt: -1, eventCount: 2, cadence: WEEKLY_CADENCE })).toThrow()
    expect(() => generateRitualSchedule({ firstEventAt: Number.NaN, eventCount: 2, cadence: WEEKLY_CADENCE })).toThrow()
    expect(() => generateRitualSchedule({ firstEventAt: 1.5, eventCount: 2, cadence: WEEKLY_CADENCE })).toThrow()
  })

  it('rejects a cadence whose windows exceed its period', () => {
    const bad = { periodSeconds: 100, claimWindowSeconds: 90, resolutionGraceSeconds: 90, accelerated: true, label: 'bad' }
    expect(() => generateRitualSchedule({ firstEventAt: start, eventCount: 2, cadence: bad })).toThrow()
  })

  it('rejects a cadence with non-positive windows', () => {
    const zero = { periodSeconds: 0, claimWindowSeconds: 0, resolutionGraceSeconds: 0, accelerated: true, label: 'zero' }
    expect(() => generateRitualSchedule({ firstEventAt: start, eventCount: 1, cadence: zero })).toThrow()
  })

  it('returns a deeply frozen schedule', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 2, cadence: WEEKLY_CADENCE })
    expect(Object.isFrozen(schedule)).toBe(true)
    expect(Object.isFrozen(schedule[0])).toBe(true)
  })

  it('is deterministic for identical inputs', () => {
    const a = generateRitualSchedule({ firstEventAt: start, eventCount: 5, cadence: WEEKLY_CADENCE })
    const b = generateRitualSchedule({ firstEventAt: start, eventCount: 5, cadence: WEEKLY_CADENCE })
    expect(a).toEqual(b)
  })

  it('stays within safe integer range at the far boundary', () => {
    const schedule = generateRitualSchedule({ firstEventAt: start, eventCount: 16, cadence: WEEKLY_CADENCE })
    for (const entry of schedule) {
      expect(Number.isSafeInteger(entry.resolutionDeadlineAt)).toBe(true)
    }
  })
})

describe('disclosure helpers', () => {
  it('describes the weekly cadence without claiming acceleration', () => {
    const text = describeCadence(WEEKLY_CADENCE)
    expect(text.toLowerCase()).toContain('week')
    expect(text.toLowerCase()).not.toContain('demo')
  })

  it('always discloses that the demo cadence is accelerated', () => {
    const text = describeCadence(DEMO_CADENCE)
    expect(text.toLowerCase()).toContain('demo')
  })

  it('renders a signed UTC offset label', () => {
    expect(localOffsetLabel(0)).toBe('UTC+00:00')
    expect(localOffsetLabel(300)).toBe('UTC-05:00')
    expect(localOffsetLabel(-330)).toBe('UTC+05:30')
  })

  it('rejects a non-finite offset', () => {
    expect(() => localOffsetLabel(Number.NaN)).toThrow()
  })
})
