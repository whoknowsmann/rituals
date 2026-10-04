/**
 * Ritual schedule generation.
 *
 * P0 product decisions locked 2026-09-17:
 *   - weekly cadence only;
 *   - first event is the next occurrence of the chosen weekday;
 *   - claim window 48h from event start;
 *   - resolution grace 24h after the claim window closes;
 *   - device-local timezone, displayed with an explicit offset, no picker;
 *   - generated schedule, no per-event editing.
 *
 * This module is pure: it does not read the clock, fetch, sign, or submit.
 * Callers pass an explicit reference time so schedules stay deterministic and
 * testable.
 */

import type { RitualScheduleEntry } from './draft'

export type { RitualScheduleEntry }

export interface RitualCadence {
  /** Seconds between consecutive event starts. */
  readonly periodSeconds: number
  /** Seconds a member has to submit a completion claim after the event opens. */
  readonly claimWindowSeconds: number
  /** Seconds friends have to confirm or question after the claim window closes. */
  readonly resolutionGraceSeconds: number
  /** True only for the devnet demo cadence. Never silently true in production. */
  readonly accelerated: boolean
  readonly label: string
  /**
   * Seconds after create when week 1 opens. When set, `firstEventStart` uses
   * it as-is; otherwise the cadence falls back to the next-same-weekday rule
   * (real weeks) or the demo leads (accelerated).
   */
  readonly firstEventLeadSeconds?: number
}

export interface ScheduleRequest {
  readonly firstEventAt: number
  readonly eventCount: number
  readonly cadence: RitualCadence
}

const HOUR = 3600
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export const CLAIM_WINDOW_SECONDS = 48 * HOUR
export const RESOLUTION_GRACE_SECONDS = 24 * HOUR

/**
 * Devnet-only demo acceleration. A weekly ritual with a 48h claim window cannot
 * be shown in a demo video, so the whole lifecycle is compressed to seconds.
 *
 * Windows stay long enough for a human to observe each transition and sign with
 * a wallet. This changes TIMING ONLY — settlement math, custody, and authority
 * checks are untouched.
 */
export const DEMO_EVENT_PERIOD_SECONDS = 180
export const DEMO_CLAIM_WINDOW_SECONDS = 90
export const DEMO_RESOLUTION_GRACE_SECONDS = 60

export const WEEKLY_CADENCE: RitualCadence = Object.freeze({
  periodSeconds: WEEK,
  claimWindowSeconds: CLAIM_WINDOW_SECONDS,
  resolutionGraceSeconds: RESOLUTION_GRACE_SECONDS,
  accelerated: false,
  label: 'Weekly',
})

export const DEMO_CADENCE: RitualCadence = Object.freeze({
  periodSeconds: DEMO_EVENT_PERIOD_SECONDS,
  claimWindowSeconds: DEMO_CLAIM_WINDOW_SECONDS,
  resolutionGraceSeconds: DEMO_RESOLUTION_GRACE_SECONDS,
  accelerated: true,
  label: 'Demo (accelerated)',
})

/**
 * Devnet-only solo demo speed. Phantom on a Seeker can take ~70 s of a 90 s
 * check-in (unlock, approve, Seed Vault), so a solo promise gets a 5-minute
 * window. The period leaves 30 s between one week's resolution and the next
 * week's opening (the program needs opens > previous resolution). The group
 * lobby keeps DEMO_CADENCE.
 */
export const DEMO_SOLO_CLAIM_WINDOW_SECONDS = 300
export const DEMO_SOLO_CADENCE: RitualCadence = Object.freeze({
  periodSeconds: DEMO_SOLO_CLAIM_WINDOW_SECONDS + DEMO_RESOLUTION_GRACE_SECONDS + 30,
  claimWindowSeconds: DEMO_SOLO_CLAIM_WINDOW_SECONDS,
  resolutionGraceSeconds: DEMO_RESOLUTION_GRACE_SECONDS,
  accelerated: true,
  label: 'Demo (accelerated)',
})

export const WEEKDAYS = Object.freeze([
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const)

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleError'
  }
}

const fail = (message: string): never => {
  throw new ScheduleError(message)
}

const requireEpochSeconds = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${name} must be a nonnegative whole number of seconds`)
  }
  return value as number
}

const requirePositiveInteger = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail(`${name} must be a positive whole number`)
  }
  return value as number
}

function assertCadence(cadence: RitualCadence): void {
  if (cadence === null || typeof cadence !== 'object') fail('cadence must be an object')
  const period = requirePositiveInteger(cadence.periodSeconds, 'cadence.periodSeconds')
  const claim = requirePositiveInteger(cadence.claimWindowSeconds, 'cadence.claimWindowSeconds')
  const grace = requirePositiveInteger(cadence.resolutionGraceSeconds, 'cadence.resolutionGraceSeconds')
  if (typeof cadence.accelerated !== 'boolean') fail('cadence.accelerated must be a boolean')
  if (cadence.firstEventLeadSeconds !== undefined) requirePositiveInteger(cadence.firstEventLeadSeconds, 'cadence.firstEventLeadSeconds')
  // Each event must fully resolve before the next one opens, otherwise the
  // protocol's chronological-event invariant cannot hold.
  if (claim + grace > period) {
    fail('cadence claim window plus resolution grace must not exceed the event period')
  }
}

/**
 * The next strictly-future occurrence of `weekday`, preserving the time of day
 * of the reference timestamp. Used to place the first event.
 */
export function nextWeekdayOccurrence(referenceSeconds: number, weekday: number): number {
  const reference = requireEpochSeconds(referenceSeconds, 'referenceSeconds')
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    fail('weekday must be an integer from 0 (Sunday) to 6 (Saturday)')
  }
  const currentWeekday = new Date(reference * 1000).getUTCDay()
  const delta = (weekday - currentWeekday + 7) % 7
  // A zero delta means "today"; the first event must be strictly in the future.
  return reference + (delta === 0 ? 7 : delta) * DAY
}

/**
 * Demo-speed lead before week 1 opens. A solo ritual is active the moment it
 * is created, so two minutes is enough to watch it open. A group must still be
 * funded by everyone, and the program rejects activation once week 1 has
 * opened (`now < opens`), so friends get ten minutes to put their stake in.
 */
export const DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS = 120
export const DEMO_GROUP_FIRST_EVENT_LEAD_SECONDS = 600

/**
 * Real solo weeks: "stamp any day this week". Week 1 opens two minutes after
 * create (same lead as demo speed, so a create that lands always activates
 * before week 1 opens), check-in stays open six days, then 23 h of grace for
 * the week to settle; 6 d + 23 h = 167 h < the 168 h period the program
 * needs between one week's resolution and the next week's opening. The group
 * flow keeps WEEKLY_CADENCE (next same weekday, 48 h + 24 h).
 */
export const REAL_SOLO_CLAIM_WINDOW_SECONDS = 6 * DAY
export const REAL_SOLO_RESOLUTION_GRACE_SECONDS = 23 * HOUR
export const REAL_SOLO_CADENCE: RitualCadence = Object.freeze({
  periodSeconds: WEEK,
  claimWindowSeconds: REAL_SOLO_CLAIM_WINDOW_SECONDS,
  resolutionGraceSeconds: REAL_SOLO_RESOLUTION_GRACE_SECONDS,
  accelerated: false,
  label: 'Weekly',
  firstEventLeadSeconds: DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS,
})

/**
 * A week whose check-in window is shorter than a day was written at demo
 * speed. Derived from the schedule itself (which is on chain), so it needs no
 * local record of how the ritual was created.
 */
export function isDemoSpeedWindow(opensSeconds: number, deadlineSeconds: number): boolean {
  return deadlineSeconds - opensSeconds < DAY
}

/**
 * How long a demo week is, in minutes, for people ("6.5"). Measured from the
 * first two openings when the schedule has them; a one-week ritual falls back
 * to the shipped solo demo period.
 */
export function demoWeekMinutesLabel(opens: readonly number[]): string {
  const period = opens.length > 1 ? opens[1] - opens[0] : DEMO_SOLO_CADENCE.periodSeconds
  return String(Number((period / 60).toFixed(1)))
}

/**
 * When week 1 opens for a ritual created at `referenceSeconds`.
 *
 * An explicit lead on the cadence wins. Otherwise weekly: the next same
 * weekday (a week out); demo speed: minutes, not a week — otherwise nothing
 * can be claimed or settled in one sitting (B1).
 */
export function firstEventStart(request: { cadence: RitualCadence; referenceSeconds: number; memberCount: number }): number {
  if (request === null || typeof request !== 'object') fail('first event request must be an object')
  const reference = requireEpochSeconds(request.referenceSeconds, 'referenceSeconds')
  const members = requirePositiveInteger(request.memberCount, 'memberCount')
  if (members > 6) fail('memberCount must be between 1 and 6')
  assertCadence(request.cadence)
  if (request.cadence.firstEventLeadSeconds !== undefined) {
    return reference + request.cadence.firstEventLeadSeconds
  }
  if (!request.cadence.accelerated) {
    return nextWeekdayOccurrence(reference, new Date(reference * 1000).getUTCDay())
  }
  return reference + (members === 1 ? DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS : DEMO_GROUP_FIRST_EVENT_LEAD_SECONDS)
}

/**
 * Generate the full, immutable event schedule for a ritual.
 *
 * P0 has no per-event editing: the schedule is fully determined by the first
 * event time, the event count, and the cadence.
 */
export function generateRitualSchedule(request: ScheduleRequest): readonly RitualScheduleEntry[] {
  if (request === null || typeof request !== 'object') fail('schedule request must be an object')
  const firstEventAt = requireEpochSeconds(request.firstEventAt, 'firstEventAt')
  const eventCount = requirePositiveInteger(request.eventCount, 'eventCount')
  // Mirrors the protocol's 1..16 event bound.
  if (eventCount > 16) fail('eventCount must be between 1 and 16')
  assertCadence(request.cadence)

  const { periodSeconds, claimWindowSeconds, resolutionGraceSeconds } = request.cadence
  const entries: RitualScheduleEntry[] = []
  for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
    const claimOpensAt = firstEventAt + eventIndex * periodSeconds
    const claimDeadlineAt = claimOpensAt + claimWindowSeconds
    const resolutionDeadlineAt = claimDeadlineAt + resolutionGraceSeconds
    if (!Number.isSafeInteger(resolutionDeadlineAt)) {
      fail('schedule exceeds the safe integer range')
    }
    entries.push(Object.freeze({ eventIndex, claimOpensAt, claimDeadlineAt, resolutionDeadlineAt }))
  }
  return Object.freeze(entries)
}

/** Human-readable cadence description. Always discloses demo acceleration. */
export function describeCadence(cadence: RitualCadence): string {
  assertCadence(cadence)
  if (!cadence.accelerated) {
    const claimHours = Math.round(cadence.claimWindowSeconds / HOUR)
    const graceHours = Math.round(cadence.resolutionGraceSeconds / HOUR)
    return `Every week · ${claimHours}h to check in · ${graceHours}h for friends to confirm`
  }
  const period = cadence.periodSeconds % 60 === 0 ? `${cadence.periodSeconds / 60} min` : `${cadence.periodSeconds} s`
  return `Demo speed · a new week every ${period} · ${cadence.claimWindowSeconds} s to check in · ${cadence.resolutionGraceSeconds} s to confirm`
}

/**
 * Render a device-local UTC offset label.
 *
 * Takes the value of `Date.prototype.getTimezoneOffset()`, which is MINUTES
 * WEST of UTC — so the sign is inverted relative to the displayed label.
 */
export function localOffsetLabel(offsetMinutesWestOfUtc: number): string {
  if (typeof offsetMinutesWestOfUtc !== 'number' || !Number.isFinite(offsetMinutesWestOfUtc)) {
    fail('timezone offset must be a finite number of minutes')
  }
  const totalMinutesEast = -offsetMinutesWestOfUtc
  const sign = totalMinutesEast < 0 ? '-' : '+'
  const absolute = Math.abs(totalMinutesEast)
  const hours = Math.floor(absolute / 60)
  const minutes = Math.round(absolute % 60)
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
