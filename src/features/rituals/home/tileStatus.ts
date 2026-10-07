import type { SoloRitualModel, SoloRitualUiState } from '../solo/lifecycle/soloRitualModel'
import { weekOpensLabel } from '../displayFormat'

export type TileStatus = Readonly<{ text: string; act: boolean }>

/** A stamped week is not kept until it settles. Replace the pending count with its close time. */
export function stampedWeekClosingLabel(model: Pick<SoloRitualModel, 'showedUp' | 'settleOpensAt' | 'demoSpeedNotice'>, chainNow: number): string | null {
  if (!model.showedUp || model.settleOpensAt === null) return null
  return chainNow >= model.settleOpensAt ? 'Closing…'
    : `Week closes ${weekOpensLabel(model.settleOpensAt, chainNow, model.demoSpeedNotice !== null)}`
}

/**
 * The one line at the bottom of a Home tile: what this ritual wants from you
 * now. `act` = there is something to do (stamp this week), shown as a pill.
 */
export function tileStatus(model: Readonly<{ state: SoloRitualUiState; showedUp: boolean; nextOpensLabel: string | null; weekSkipped?: boolean }>, laterWeekOpen = false): TileStatus {
  // The chain has moved on to a later week whose window is open, but the last
  // one has not been settled yet (settling runs on the ritual screen). That
  // later week still wants a stamp: say so instead of "Stamped"/"Closing…".
  if (laterWeekOpen && model.state !== 'completed') return { text: 'Stamp this week', act: true }
  switch (model.state) {
    case 'claimable':
    case 'open-not-initialized':
      return model.showedUp ? { text: 'Stamped', act: false } : { text: 'Stamp this week', act: true }
    case 'waiting': return { text: model.nextOpensLabel ? `Opens ${model.nextOpensLabel}` : 'Opens soon', act: false }
    case 'closing':
    case 'resolving/settle': return { text: model.showedUp ? 'Stamped' : 'Closing…', act: false }
    case 'missed': return { text: 'Missed last week', act: false }
    case 'skipped': return { text: model.weekSkipped ? 'Skipped this week' : 'Skipped last week', act: false }
    case 'completed': return { text: 'Finished', act: false }
    case 'ended': return { text: 'Ended', act: false }
    case 'awaiting-witness': return { text: 'Waiting on witness', act: false }
    case 'funding': return { text: 'Not active yet', act: false }
  }
}

/** Is a week after the chain's current one open for stamping right now? */
export function laterWeekOpenAt(schedule: readonly Readonly<{ opens: bigint | number; deadline: bigint | number }>[], currentEventIndex: number, now: number): boolean {
  return schedule.some((window, index) => index > currentEventIndex && Number(window.opens) <= now && now <= Number(window.deadline))
}
