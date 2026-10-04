/** 'closed' = a finished week whose result is not known (yet): neutral, never a guessed tick. */
export type WeekCell = 'done' | 'now' | 'future' | 'missed' | 'closed'

/** What each punch-card cell says: kept ✓, missed ✕, this week NOW, later weeks their number. */
export function weekCellLabel(cell: WeekCell, index: number): string {
  if (cell === 'done') return '✓'
  if (cell === 'missed') return '✕'
  if (cell === 'closed') return '·'
  if (cell === 'now') return 'NOW'
  return String(index + 1)
}

/** One plain line under the strip, so it reads at a glance: "Week 3 of 4 · 1 kept · 1 missed". */
export function weekSummary(cells: readonly WeekCell[]): string {
  const kept = cells.filter((cell) => cell === 'done').length
  const missed = cells.filter((cell) => cell === 'missed').length
  const now = cells.indexOf('now')
  const finished = !cells.some((cell) => cell === 'now' || cell === 'future')
  const lead = now >= 0 ? `Week ${now + 1} of ${cells.length}` : finished ? `All ${cells.length} weeks done` : `${cells.length} weeks`
  return [lead, kept ? `${kept} kept` : null, missed ? `${missed} missed` : null].filter(Boolean).join(' · ')
}
