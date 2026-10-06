import { DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE, demoWeekMinutesLabel, firstEventStart, generateRitualSchedule, isDemoSpeedWindow, type RitualCadence } from '../../../../domain/rituals/schedule'
import type { EventWindowView } from '../../../../data/rituals/accounts'
import { weekOpensLabel } from '../../displayFormat'

export type SoloScheduleSelection = Readonly<{
  source: 'generated' | 'season'
  firstEventAt: number
  schedule: readonly Readonly<{ eventIndex: number; claimOpensAt: number; claimDeadlineAt: number; resolutionDeadlineAt: number }>[]
}>

function seasonSeconds(value: bigint, name: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Season ${name} is invalid.`)
  return Number(value)
}

/**
 * How many weeks the promise runs: a joined Season's window count always wins;
 * otherwise the suggestion the user actually picked; otherwise 4 weeks.
 */
export function soloEventCount(input: Readonly<{ seasonWindows?: number; picked?: string | number }>): number {
  if (input.seasonWindows !== undefined) return input.seasonWindows
  const picked = typeof input.picked === 'number' ? input.picked : input.picked !== undefined && /^\d+$/.test(input.picked) ? Number(input.picked) : NaN
  return Number.isInteger(picked) && picked >= 1 && picked <= 16 ? picked : 4
}

/** The program allows 1..16 weekly events per ritual. */
export const SOLO_MIN_WEEKS = 1
export const SOLO_MAX_WEEKS = 16

/** The weeks stepper on create: one step at a time, never outside 1..16. */
export function stepWeeks(current: number, delta: number): number {
  return Math.min(SOLO_MAX_WEEKS, Math.max(SOLO_MIN_WEEKS, current + delta))
}

/** Quick picks for the weekly stake (tSKR); any amount can still be typed. */
/** Total stake picks for the whole ritual (Jack, 2026-10-06: the stake is the total). */
export const STAKE_PRESETS = Object.freeze(['5', '10', '20', '50'])
export const DEFAULT_STAKE_TOTAL = '20'

/**
 * How long a week is, chosen on create (approved 2026-10-04). Demo speed is
 * the default so anyone sees the whole loop in one sitting; real weeks are the
 * product. Labels are option text on the create screen: keep them out of every
 * heading there (the device tap driver matches substrings).
 */
export type SoloSpeed = 'demo' | 'real'
export const DEFAULT_SOLO_SPEED: SoloSpeed = 'demo'
export const SOLO_SPEEDS: readonly Readonly<{ speed: SoloSpeed; label: string; cadence: RitualCadence; accessibilityLabel: string }>[] = Object.freeze([
  Object.freeze({ speed: 'demo' as const, label: 'Demo speed', cadence: DEMO_SOLO_CADENCE, accessibilityLabel: 'Demo speed: a week lasts minutes' }),
  Object.freeze({ speed: 'real' as const, label: 'Real weeks', cadence: REAL_SOLO_CADENCE, accessibilityLabel: 'Real weeks: seven days each, stamp any day' }),
])

export function soloCadenceFor(speed: SoloSpeed): RitualCadence {
  const found = SOLO_SPEEDS.find((option) => option.speed === speed)
  if (!found) throw new Error(`unknown solo speed: ${String(speed)}`)
  return found.cadence
}

/**
 * The one quiet line under the stake card, true to the windows that will be
 * written on chain: "4 demo weeks · 2 min each · 20 tSKR" or
 * "5 tSKR a week · ends Sun, Nov 1" (last week's resolution, phone
 * local time, in the app's usual date style).
 */
export function soloScheduleSummary(input: Readonly<{ weekCount: number; stakeEachLabel: string; totalStakeLabel: string; schedule: SoloScheduleSelection['schedule']; nowSeconds: number }>): string {
  const { weekCount, stakeEachLabel, totalStakeLabel, schedule, nowSeconds } = input
  const first = schedule[0]
  const last = schedule[schedule.length - 1]
  const noun = weekCount === 1 ? 'week' : 'weeks'
  if (!first || !last) return `${weekCount} ${noun} · ${totalStakeLabel}`
  if (isDemoSpeedWindow(first.claimOpensAt, first.claimDeadlineAt)) {
    const minutes = demoWeekMinutesLabel(schedule.map((entry) => entry.claimOpensAt))
    return weekCount === 1
      ? `1 demo week · ${minutes} min · ${totalStakeLabel}`
      : `${weekCount} demo weeks · ${minutes} min each · ${stakeEachLabel} a week`
  }
  // weekOpensLabel gives "Sun, Nov 1 · 2:47 PM"; the day is what matters here.
  const ends = weekOpensLabel(last.resolutionDeadlineAt, nowSeconds).split(' · ')[0]
  return `${stakeEachLabel} a week · ends ${ends}`
}

/** Selects the exact Season template when linked; otherwise creates the demo schedule. */
export function selectSoloSchedule(input: Readonly<{
  cadence: RitualCadence
  referenceSeconds: number
  eventCount: number
  seasonSchedule?: readonly EventWindowView[]
}>): SoloScheduleSelection {
  if (input.seasonSchedule !== undefined) {
    if (input.seasonSchedule.length !== input.eventCount) throw new Error('Season schedule does not match this ritual.')
    const schedule = Object.freeze(input.seasonSchedule.map((window, eventIndex) => Object.freeze({
      eventIndex,
      claimOpensAt: seasonSeconds(window.opens, 'opening time'),
      claimDeadlineAt: seasonSeconds(window.deadline, 'deadline'),
      resolutionDeadlineAt: seasonSeconds(window.resolution, 'resolution time'),
    })))
    for (let index = 0; index < schedule.length; index += 1) {
      const current = schedule[index]
      if (!(current.claimOpensAt < current.claimDeadlineAt && current.claimDeadlineAt < current.resolutionDeadlineAt)
        || (index > 0 && schedule[index - 1].resolutionDeadlineAt >= current.claimOpensAt)) {
        throw new Error('Season schedule does not match this ritual.')
      }
    }
    return Object.freeze({ source: 'season' as const, firstEventAt: schedule[0].claimOpensAt, schedule })
  }

  const firstEventAt = firstEventStart({ cadence: input.cadence, referenceSeconds: input.referenceSeconds, memberCount: 1 })
  const schedule = generateRitualSchedule({ firstEventAt, eventCount: input.eventCount, cadence: input.cadence })
  return Object.freeze({ source: 'generated' as const, firstEventAt, schedule })
}

export function scheduleWindows(selection: SoloScheduleSelection): readonly Readonly<{ opens: bigint; deadline: bigint; resolution: bigint }>[] {
  return Object.freeze(selection.schedule.map((entry) => Object.freeze({
    opens: BigInt(entry.claimOpensAt),
    deadline: BigInt(entry.claimDeadlineAt),
    resolution: BigInt(entry.resolutionDeadlineAt),
  })))
}
