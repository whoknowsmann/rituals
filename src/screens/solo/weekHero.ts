import type { SoloRitualModel } from '../../features/rituals/solo/lifecycle/soloRitualModel'
import { weekOpensLabel } from '../../features/rituals/displayFormat'
import { stampedWeekClosingLabel } from '../../features/rituals/home/tileStatus'
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

/** The week the title names: the one whose stamp is the hero, else the current week. */
export function titleWeekIndex(model: Pick<SoloRitualModel, 'state' | 'eventIndex'>, keptWeek: number | null): number {
  if (keptWeek !== null) return keptWeek
  return (model.state === 'missed' || model.state === 'skipped') && model.eventIndex > 0 ? model.eventIndex - 1 : model.eventIndex
}

/**
 * One short line under the hero: "Week 2 opens in 38s". The last week counts
 * to its close instead ("Week closes in 30s", then "Closing…", as on Home).
 * Null when nothing happens by itself (the Settle button is then the next step).
 */
export function nextUpLine(
  model: Pick<SoloRitualModel, 'state' | 'eventIndex' | 'showedUp' | 'nextOpensLabel' | 'settleOpensAt' | 'demoSpeedNotice'>,
  schedule: readonly Readonly<{ opens: bigint }>[],
  now: number,
  keptWeek: number | null,
  settlingByItself: boolean,
): string | null {
  if (model.state === 'missed' || model.state === 'skipped') return model.nextOpensLabel ? `Week ${model.eventIndex + 1} opens ${model.nextOpensLabel}` : null
  if (keptWeek === null || model.state === 'completed') return null
  if (model.state === 'resolving/settle' && !settlingByItself) return null
  const next = schedule[keptWeek + 1]
  if (!next) return stampedWeekClosingLabel(model, now)
  const opens = Number(next.opens)
  return now < opens ? `Week ${keptWeek + 2} opens ${weekOpensLabel(opens, now, model.demoSpeedNotice !== null)}` : 'Closing…'
}

/** The punch card as the screen shows it: the stamped week reads ✓ at once. */
export function punchCardCells(cells: readonly WeekCell[], showedUp: boolean, keptWeek: number | null): readonly WeekCell[] {
  if (keptWeek === null) return cells
  return cells.map((cell, index) => (index !== keptWeek ? cell : showedUp ? 'stamped' : cell === 'closed' ? 'done' : cell))
}
