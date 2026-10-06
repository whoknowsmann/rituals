import { color } from '../theme/tokens'
import type { WidgetDot } from './widgetModel'

/** One mark per week, at most eight per row. Same filled/dark/hollow/ring
 * language as Home. Skips are dashes; unread/expired history stays unfilled
 * with a small centre mark, never a fabricated miss or kept week.
 */
export function punchCardSvg(dots: readonly WidgetDot[]): string {
  const columns = Math.max(1, Math.min(8, dots.length))
  const rows = Math.max(1, Math.ceil(dots.length / 8))
  const marks = dots.map((dot, index) => {
    const x = (index % 8) * 12 + 6
    const y = Math.floor(index / 8) * 12 + 6
    if (dot === 'skipped') return `<path d="M${x - 3} ${y}h6" stroke="${color.card}" stroke-width="1.5"/>`
    const fill = dot === 'kept' ? color.card : dot === 'missed' ? color.fg : 'none'
    const stroke = dot === 'missed' ? color.fg : color.card
    return `<circle cx="${x}" cy="${y}" r="${dot === 'current' ? 4 : 3}" fill="${fill}" stroke="${stroke}" stroke-width="${dot === 'current' ? 2 : 1}"/>${dot === 'unknown' ? `<circle cx="${x}" cy="${y}" r="1" fill="${color.card}"/>` : ''}`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * 12}" height="${rows * 12}" viewBox="0 0 ${columns * 12} ${rows * 12}">${marks}</svg>`
}
