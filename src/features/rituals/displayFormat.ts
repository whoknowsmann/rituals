/**
 * Display formatting for chain values. Pure, no clock reads: callers pass `now`.
 */

/** Token amounts on screen show at most this many decimals. */
const DISPLAY_DECIMALS = 2

/**
 * The one formatter for every token amount on screen (Jack, 2026-10-09):
 * rounds half-up to 2 decimals and drops trailing zeros ("3.33 tSKR",
 * "20 tSKR", "2.5 tSKR"). Add or subtract in atomic units first and round
 * only here. Under half a cent shows "0"; no stake the create picks make is
 * that small (the least is 5 over 16 weeks, 0.3125 a week).
 */
export function formatAtomic(value: bigint, decimals: number, symbol = 'tSKR'): string {
  const shown = Math.min(decimals, DISPLAY_DECIMALS)
  const step = 10n ** BigInt(decimals - shown)
  const rounded = ((value < 0n ? -value : value) + step / 2n) / step
  const base = 10n ** BigInt(shown)
  const fraction = shown === 0 ? '' : (rounded % base).toString().padStart(shown, '0').replace(/0+$/, '')
  return `${value < 0n && rounded > 0n ? '-' : ''}${rounded / base}${fraction ? `.${fraction}` : ''} ${symbol}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekIsOpen(opensSeconds: number, nowSeconds: number): boolean {
  return nowSeconds >= opensSeconds
}

/** Demo countdowns tick in seconds; real weeks retain their day/time labels. */
export function weekOpensLabel(opensSeconds: number, nowSeconds: number, demoSpeed = false): string {
  const delta = opensSeconds - nowSeconds
  if (delta <= 0) return 'now'
  if (demoSpeed || delta < 60) return `in ${Math.ceil(delta)}s`
  if (delta < 3600) return `in ${Math.round(delta / 60)} min`
  const d = new Date(opensSeconds * 1000)
  const h24 = d.getHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** The caller supplies the same chain time used to decide whether HOLD is open. */
export function stampTimeLeftLabel(deadlineSeconds: number, nowSeconds: number, demoSpeed: boolean): string {
  const seconds = Math.max(0, Math.ceil(deadlineSeconds - nowSeconds))
  if (demoSpeed || seconds < 60) return `${seconds}s left`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min left`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h left`
  const days = Math.floor(seconds / 86400)
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}
