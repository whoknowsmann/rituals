import { firstEventStart, generateRitualSchedule, type RitualCadence } from '../../../../domain/rituals/schedule'
import type { EventWindowView } from '../../../../data/rituals/accounts'

export type SoloScheduleSelection = Readonly<{
  source: 'generated' | 'season'
  firstEventAt: number
  schedule: readonly Readonly<{ eventIndex: number; claimOpensAt: number; claimDeadlineAt: number; resolutionDeadlineAt: number }>[]
}>

function seasonSeconds(value: bigint, name: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Season ${name} is invalid.`)
  return Number(value)
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
