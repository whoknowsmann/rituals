import type { SoloRitualModel } from '../../features/rituals/solo/lifecycle/soloRitualModel'
import { weekOpensLabel } from '../../features/rituals/displayFormat'
import type { WeekCell } from '../../components/crew/weekStripLogic'

/**
 * After a stamp the ritual screen has one hero: YOU SHOWED UP! stays from the
 * moment the stamp lands until the next week opens (or for good once the
 * ritual is finished), with one ticking line under it saying what happens
 * next. These pure helpers decide that from the view model and the chain
 * clock; the screen only renders them.
 */
type HeroModel = Pick<SoloRitualModel, 'state' | 'eventIndex' | 'showedUp' | 'lastClosedOutcome' | 'lastClosedEventIndex'>

/**
 * The kept week whose stamp is on screen, or null. `seen` is the last week this
 * screen saw stamped on chain: it bridges the moment right after the settle,
 * before the closed week's outcome has been read back.
 */
export function keptWeekOnScreen(model: HeroModel, seen: number | null): number | null {
  if (model.showedUp) return model.eventIndex
  if (model.state !== 'waiting' && model.state !== 'completed') return null
  const previous = model.eventIndex - 1
  if (previous < 0) return null
  return seen === previous || (model.lastClosedOutcome === 'done' && model.lastClosedEventIndex === previous) ? previous : null
}

/** Preview the next HOLD during the lead and gaps, without making it actionable. */
export function stampHoldState(model: Pick<SoloRitualModel, 'state' | 'showedUp' | 'weekSkipped' | 'nextOpensLabel'>, stampPending: boolean): 'waiting' | 'open' | 'hidden' {
  if (stampPending || model.showedUp || model.weekSkipped) return 'hidden'
  if (model.nextOpensLabel && (model.state === 'waiting' || model.state === 'missed' || model.state === 'skipped')) return 'waiting'
  return model.state === 'claimable' || model.state === 'open-not-initialized' ? 'open' : 'hidden'
}

/** The deadline decides an unstamped week, but never overrules a stamp still being read. */
export function missedWeekOnScreen(model: Pick<SoloRitualModel, 'state' | 'eventIndex' | 'showedUp' | 'weekSkipped'>, stampPending: boolean): number | null {
  if (stampPending || model.showedUp || model.weekSkipped) return null
  return model.state === 'closing' || model.state === 'resolving/settle' ? model.eventIndex : null
}

/**
 * The week the title names: the one whose stamp is the hero (kept, missed or
 * skipped), else the current week. `skippedWeek` is the chain's declared skip,
 * which is the current week or the one before it.
 */
export function titleWeekIndex(model: Pick<SoloRitualModel, 'state' | 'eventIndex'>, keptWeek: number | null, skippedWeek: number | null): number {
  if (keptWeek !== null) return keptWeek
  if (model.state === 'skipped' && skippedWeek !== null) return skippedWeek
  return model.state === 'missed' && model.eventIndex > 0 ? model.eventIndex - 1 : model.eventIndex
}

/**
 * One short line under the hero: "Week 2 opens in 38s". The last week counts
 * to its close instead ("Week closes in 30s", then "Closing…", as on Home).
 * Null when nothing happens by itself (the Settle button is then the next step).
 */
export function nextUpLine(
  model: Pick<SoloRitualModel, 'state' | 'eventIndex' | 'showedUp' | 'weekSkipped' | 'nextOpensLabel' | 'settleOpensAt' | 'demoSpeedNotice'>,
  schedule: readonly Readonly<{ opens: bigint }>[],
  now: number,
  keptWeek: number | null,
  settlingByItself: boolean,
  stampPending = false,
): string | null {
  if (stampPending) return null
  if (model.state === 'missed' || model.state === 'skipped') return model.nextOpensLabel ? `Week ${model.eventIndex + 1} opens ${model.nextOpensLabel}` : null
  const outcomeWeek = keptWeek ?? missedWeekOnScreen(model, stampPending)
  if (outcomeWeek === null || model.state === 'completed' || model.state === 'ended') return null
  if (model.state === 'resolving/settle' && !settlingByItself) return null
  const next = schedule[outcomeWeek + 1]
  if (!next) return model.settleOpensAt === null ? null : now >= model.settleOpensAt ? 'Closing…'
    : `Week closes ${weekOpensLabel(model.settleOpensAt, now, model.demoSpeedNotice !== null)}`
  const opens = Number(next.opens)
  return now < opens ? `Week ${outcomeWeek + 2} opens ${weekOpensLabel(opens, now, model.demoSpeedNotice !== null)}` : 'Closing…'
}

/** The punch card as the screen shows it: the stamped week reads ✓ at once. */
export function punchCardCells(cells: readonly WeekCell[], showedUp: boolean, keptWeek: number | null): readonly WeekCell[] {
  if (keptWeek === null) return cells
  return cells.map((cell, index) => (index !== keptWeek ? cell : showedUp ? 'stamped' : cell === 'closed' ? 'done' : cell))
}
