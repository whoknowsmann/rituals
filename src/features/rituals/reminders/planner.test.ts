import { describe, expect, it } from 'vitest'
import { DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE } from '../../../domain/rituals/schedule'
import { scheduleWindows, selectSoloSchedule } from '../solo/create/schedule'
import { observedReminderWeeks, planReminders, reminderPrefix, weekReminderPrefix, type ReminderWindow } from './planner'

const nowSeconds = 1_800_000_000
const options = { ritualAddress: 'ritual-A', ritualTitle: 'Read', stakeLabel: '5 tSKR', causeLabel: 'the food bank', nowSeconds }
const schedule = (weeks = 2, cadence = REAL_SOLO_CADENCE) => scheduleWindows(selectSoloSchedule({ cadence, referenceSeconds: nowSeconds, eventCount: weeks }))

describe('chain schedule reminder planner', () => {
  it('reconciles the actual skipped week, not the advanced current model index', () => {
    expect(observedReminderWeeks({ eventIndex: 1, stamped: false, skippedEventIndex: 0 })).toEqual([0])
    expect(observedReminderWeeks({ eventIndex: 1, stamped: true, skippedEventIndex: 0 })).toEqual([1, 0])
    expect(observedReminderWeeks({ eventIndex: 0, stamped: true, skippedEventIndex: 0 })).toEqual([0])
  })
  it('ignores absent or out-of-bounds observed weeks', () => {
    expect(observedReminderWeeks()).toEqual([])
    expect(observedReminderWeeks({ eventIndex: 0, stamped: false })).toEqual([])
    expect(observedReminderWeeks({ eventIndex: 16, stamped: true, skippedEventIndex: -1 })).toEqual([])
  })
  it('clears expired demo weeks even if settlement has not advanced the current index', () => {
    const windows = schedule(2, DEMO_SOLO_CADENCE)
    const observed = { eventIndex: 0, stamped: false, schedule: windows }
    expect(observedReminderWeeks({ ...observed, nowSeconds: Number(windows[0].deadline) })).toEqual([])
    expect(observedReminderWeeks({ ...observed, nowSeconds: Number(windows[0].deadline) + 1 })).toEqual([0])
    expect(observedReminderWeeks({ ...observed, nowSeconds: Number(windows[1].resolution) })).toEqual([0, 1])
    expect(observedReminderWeeks({ ...observed, nowSeconds: NaN })).toEqual([])
  })
  it('clears earlier settled weeks after restart without misidentifying the current unstamped week', () => {
    expect(observedReminderWeeks({ eventIndex: 1, stamped: false, schedule: schedule(2) })).toEqual([0])
  })
  it('clears all completed ritual weeks even with no current model or clock, bounded to sixteen', () => {
    const windows = schedule(16)
    expect(observedReminderWeeks({ eventIndex: undefined, stamped: false, completed: true, schedule: [...windows, windows[0]] }))
      .toEqual(Array.from({ length: 16 }, (_, index) => index))
  })
  it('uses the exact open, deadline minus a day, and deadline minus an hour for each week', () => {
    const windows = schedule()
    expect(planReminders(windows, options).map((item) => item.at)).toEqual(windows.flatMap((window) => [Number(window.opens), Number(window.deadline) - 86400, Number(window.deadline) - 3600]))
    expect(planReminders(windows, options).every((item) => item.title === 'Read')).toBe(true)
  })
  it('gives Demo speed one reminder per week, when the week opens (Jack, 2026-10-06)', () => {
    const plan = planReminders(schedule(2, DEMO_SOLO_CADENCE), options)
    expect(plan).toHaveLength(2)
    expect(plan.every((item) => item.id.endsWith(':open'))).toBe(true)
  })
  it('caps at sixteen weeks and three reminders per week', () => {
    const windows = schedule(16)
    const excess = [...windows, { opens: windows[15].opens + 604800n, deadline: windows[15].deadline + 604800n, resolution: windows[15].resolution + 604800n }]
    const plan = planReminders(excess, options)
    expect(plan).toHaveLength(48)
    for (let week = 0; week < 16; week += 1) expect(plan.filter((item) => item.id.startsWith(weekReminderPrefix(options.ritualAddress, week)))).toHaveLength(3)
    expect(new Set(plan.map((item) => item.id)).size).toBe(48)
  })
  it.each(['opens', 'deadline', 'resolution'] as const)('excludes times equal to or before now at %s', (field) => {
    const windows = schedule(1)
    const now = Number(windows[0][field])
    expect(planReminders(windows, { ...options, nowSeconds: now }).every((item) => item.at > now)).toBe(true)
    if (field !== 'opens') expect(planReminders(windows, { ...options, nowSeconds: now })).toEqual([])
  })
  it('does not send the one-day reminder exactly at its boundary', () => {
    const window = schedule(1)[0]
    expect(planReminders([window], { ...options, nowSeconds: Number(window.deadline) - 86400 }).map((item) => item.at)).toEqual([Number(window.deadline) - 3600])
  })
  it('excludes stamped weeks without shifting future week identities', () => {
    const plan = planReminders(schedule(3), { ...options, stampedWeeks: [0, 2] })
    expect(plan).toHaveLength(3)
    expect(plan.every((item) => item.id.startsWith(weekReminderPrefix('ritual-A', 1)))).toBe(true)
  })
  it('deduplicates the exactly one-day window and excludes shorter windows', () => {
    const opens = nowSeconds + 90
    const window = { opens, deadline: opens + 86400, resolution: opens + 90000 }
    expect(planReminders([window], options).map((item) => item.at)).toEqual([opens, window.deadline - 3600])
    expect(planReminders([{ ...window, deadline: window.deadline - 1 }], options).map((item) => item.at)).toEqual([opens])
  })
  it('handles empty schedules and invalid clock values without scheduling', () => {
    expect(planReminders([], options)).toEqual([])
    expect(planReminders(schedule(), { ...options, nowSeconds: NaN })).toEqual([])
  })
  it.each([
    { opens: NaN, deadline: Infinity, resolution: Infinity },
    { opens: -1, deadline: 86400, resolution: 90000 },
    { opens: 1.5, deadline: 100000, resolution: 200000 },
    { opens: 100000, deadline: 300000, resolution: 200000 },
    { opens: 9_000_000_000_000n, deadline: 9_000_000_100_000n, resolution: 9_000_000_200_000n },
  ] satisfies ReminderWindow[])('rejects malformed/unrepresentable window case %#', (window) => {
    expect(planReminders([window], { ...options, nowSeconds: 0 })).toEqual([])
  })
  it('has stable per-ritual/per-week ids, never overlapping address or week prefixes', () => {
    expect(planReminders(schedule(), options)).toEqual(planReminders(schedule(), options))
    expect(reminderPrefix('ritual-A-extra').startsWith(reminderPrefix('ritual-A'))).toBe(false)
    expect(weekReminderPrefix('ritual-A', 10).startsWith(weekReminderPrefix('ritual-A', 1))).toBe(false)
  })
  it('bounds a user title and supplies a fallback for an empty one', () => {
    expect(planReminders(schedule(), { ...options, ritualTitle: 'x'.repeat(100) })[0].title).toHaveLength(60)
    expect(planReminders(schedule(), { ...options, ritualTitle: ' ' })[0].title).toBe('Your ritual')
  })
})
