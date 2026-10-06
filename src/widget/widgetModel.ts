import { weekSummaryShort, type WeekCell } from '../components/crew/weekStripLogic'
import { weekOpensLabel } from '../features/rituals/displayFormat'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { tileStatus, type TileStatus } from '../features/rituals/home/tileStatus'
import type { SoloRitualUiState } from '../features/rituals/solo/lifecycle/soloRitualModel'

export type WidgetKnown = Readonly<{ address: string; title: string }>
export const widgetStates = ['funding', 'waiting', 'open-not-initialized', 'claimable', 'awaiting-witness', 'closing', 'resolving/settle', 'skipped', 'missed', 'completed'] as const satisfies readonly SoloRitualUiState[]
/** Plain JSON only. The cells are Home's cells, not inferred aggregate counts. */
export type WidgetSnapshot = Readonly<{
  address: string
  title: string
  stakeLabel: string
  cells: readonly WeekCell[]
  active: boolean
  state: SoloRitualUiState
  showedUp: boolean
  /** A terminal current event must not reopen just because the clock advances. */
  terminalCurrent: boolean
  opens: number
  deadline: number
  tint: string
}>
export type WidgetOutcome = Omit<WidgetSnapshot, 'title' | 'tint'>
export type WidgetModel = Readonly<{ title: string; stakeLabel: string; cells: readonly WeekCell[]; countLine: string; pill: TileStatus; tint: string }>

export function selectWidgetSnapshot(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[]): WidgetSnapshot | null {
  const candidates = [...known].reverse().flatMap((item) => {
    const outcome = outcomes.find((entry) => entry.address === item.address)
    return outcome ? [{ ...outcome, title: item.title, tint: ritualTintAmong(item.address, known) }] : []
  })
  // Account activity, not a last-event result, determines selection.
  return candidates.find((item) => item.active) ?? candidates[0] ?? null
}

export function widgetModel(known: readonly WidgetKnown[], outcomes: readonly WidgetOutcome[], nowSeconds: number): WidgetModel {
  return widgetModelFromSnapshot(selectWidgetSnapshot(known, outcomes), nowSeconds)
}

export function widgetModelFromSnapshot(snapshot: WidgetSnapshot | null, nowSeconds: number): WidgetModel {
  if (!snapshot) return { title: 'Start a ritual?', stakeLabel: '', cells: [], countLine: '', pill: { text: 'Open Rituals', act: true }, tint: ritualTintAmong('', [{ address: '' }]) }
  let state = snapshot.state
  // Clock-only updates can open/close the saved window, never invent outcomes,
  // advance a week, or undo a terminal event. Foreground reads remain authoritative.
  if (snapshot.active && !snapshot.terminalCurrent) {
    if (['waiting', 'missed', 'skipped'].includes(state) && nowSeconds >= snapshot.opens) state = 'claimable'
    if (['claimable', 'open-not-initialized', 'awaiting-witness'].includes(state) && nowSeconds > snapshot.deadline) state = 'closing'
  }
  return {
    title: snapshot.title,
    stakeLabel: snapshot.stakeLabel,
    cells: snapshot.cells,
    countLine: weekSummaryShort(snapshot.cells),
    pill: tileStatus({ state, showedUp: snapshot.showedUp, nextOpensLabel: weekOpensLabel(snapshot.opens, nowSeconds) }),
    tint: snapshot.tint,
  }
}
