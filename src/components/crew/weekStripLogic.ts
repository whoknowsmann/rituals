/**
 * 'closed' = a finished week whose result is not known (yet): neutral, never a guessed tick.
 * 'stamped' = this week, stamped: ✓ at once, still the current week until it closes (no receipt yet).
 */
export type WeekCell = 'done' | 'stamped' | 'now' | 'current' | 'future' | 'missed' | 'closed' | 'skipped' | 'skip-pending'

/** Closed weeks have a receipt even while their outcome read is unavailable. */
export function isClosedWeekCell(cell: WeekCell): boolean {
  return cell === 'done' || cell === 'missed' || cell === 'closed' || cell === 'skipped'
}

/** Kept or stamped: the cells that read ✓. */
export function isKeptWeekCell(cell: WeekCell): boolean {
  return cell === 'done' || cell === 'stamped'
}

/** Keep the current-week ring, but reserve NOW for the inclusive stamp window. */
export function currentWeekCell(opens: number, deadline: number, chainNow: number): 'now' | 'current' {
  return opens <= chainNow && chainNow <= deadline ? 'now' : 'current'
}

/** What each punch-card cell says: kept ✓, missed ✕, this week NOW, later weeks their number. */
export function weekCellLabel(cell: WeekCell, index: number): string {
  if (isKeptWeekCell(cell)) return '✓'
  if (cell === 'missed') return '✕'
  if (cell === 'closed' || cell === 'skipped' || cell === 'skip-pending') return '·'
  if (cell === 'now') return 'NOW'
  return String(index + 1)
}

/** Compact misses and skips share the dot footprint, but never the same mark. */
export function compactWeekMark(cell: WeekCell): string | null {
  if (cell === 'missed') return '✕'
  if (cell === 'skipped' || cell === 'skip-pending') return '−'
  return null
}

export function weekCellAccessibilityLabel(cell: WeekCell, index: number): string {
  const state = cell === 'done' ? 'kept'
    : cell === 'stamped' ? 'stamped'
      : cell === 'now' || cell === 'current' ? 'current'
        : cell === 'future' ? 'upcoming'
          : cell === 'closed' ? 'result pending'
            : cell === 'skip-pending' ? 'skip declared' : cell
  return `Week ${index + 1} ${state}`
}

/** One plain line under the strip, so it reads at a glance: "Week 3 of 4 · 1 kept · 1 missed". */
export function weekSummary(cells: readonly WeekCell[]): string {
  const kept = cells.filter(isKeptWeekCell).length
  const missed = cells.filter((cell) => cell === 'missed').length
  const now = cells.findIndex((cell) => cell === 'now' || cell === 'current' || cell === 'stamped' || cell === 'skip-pending')
  const finished = cells.every(isClosedWeekCell)
  const lead = now >= 0 ? `Week ${now + 1} of ${cells.length}` : finished ? `All ${cells.length} weeks done` : `${cells.length} weeks`
  return [lead, kept ? `${kept} kept` : null, missed ? `${missed} missed` : null].filter(Boolean).join(' · ')
}

/** The short form for small Home tiles: "1 of 4 kept". */
export function weekSummaryShort(cells: readonly WeekCell[]): string {
  return `${cells.filter(isKeptWeekCell).length} of ${cells.length} kept`
}
