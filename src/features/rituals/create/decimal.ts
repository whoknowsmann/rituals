import { MAX_U64 } from '../../../domain/rituals/money'

export const TOKEN_DECIMALS = 6 as const
const SCALE = 10n ** BigInt(TOKEN_DECIMALS)

/** Parse an exact base-10 token amount into atomic units. */
export function parseTokenAmount(input: string, decimals = TOKEN_DECIMALS): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new RangeError('Token decimals are invalid')
  if (typeof input !== 'string' || !/^\d+(?:\.\d+)?$/.test(input)) throw new RangeError('Enter a non-negative decimal amount')
  const [whole, fraction = ''] = input.split('.')
  if (fraction.length > decimals) throw new RangeError(`Amount supports at most ${decimals} decimal places`)
  const scale = 10n ** BigInt(decimals)
  const atomic = BigInt(whole) * scale + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
  if (atomic > MAX_U64) throw new RangeError('Amount exceeds the supported limit')
  return atomic
}

export function formatTokenAmount(amount: bigint, decimals = TOKEN_DECIMALS): string {
  if (typeof amount !== 'bigint' || amount < 0n || amount > MAX_U64) throw new RangeError('Token amount is invalid')
  const scale = 10n ** BigInt(decimals)
  const whole = amount / scale
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
