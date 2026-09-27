/**
 * Display formatting for chain values. Pure, no clock reads: callers pass `now`.
 */

/** Exact token amount with trailing zeros dropped ("8 TEST", "2.5 TEST"). Never rounds. */
export function formatAtomic(value: bigint, decimals: number, symbol = 'TEST'): string {
  const base = 10n ** BigInt(decimals)
  const sign = value < 0n ? '-' : ''
  const abs = value < 0n ? -value : value
  const whole = abs / base
  const fraction = decimals === 0 ? '' : (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${sign}${whole}${fraction ? `.${fraction}` : ''} ${symbol}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekIsOpen(opensSeconds: number, nowSeconds: number): boolean {
  return nowSeconds >= opensSeconds
}

/** "in 2 min" within the hour (demo speed), otherwise "Sat, Oct 3 · 3:45 PM" in device-local time. */
export function weekOpensLabel(opensSeconds: number, nowSeconds: number): string {
  const delta = opensSeconds - nowSeconds
  if (delta <= 0) return 'now'
  if (delta < 60) return 'in under a minute'
  if (delta < 3600) return `in ${Math.round(delta / 60)} min`
  const d = new Date(opensSeconds * 1000)
  const h24 = d.getHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}
