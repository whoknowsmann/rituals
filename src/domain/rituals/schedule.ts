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
