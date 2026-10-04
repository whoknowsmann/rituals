import type { PublicKeyText } from './types'

export const MAX_U64 = 18_446_744_073_709_551_615n
const BASIS_POINT_DENOMINATOR = 10_000n

function assertAtomicUnits(value: bigint, name: string): void {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) {
    throw new RangeError(`${name} must be an unsigned u64 atomic-unit amount`)
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

export function derivePerEventAllocation(total: bigint, eventCount: number): bigint {
  assertAtomicUnits(total, 'total')
  assertPositiveSafeInteger(eventCount, 'eventCount')
  if (total % BigInt(eventCount) !== 0n) {
    throw new RangeError('total must divide evenly across events')
  }
  const result = total / BigInt(eventCount)
  assertAtomicUnits(result, 'allocation')
  return result
}

export function deriveGroupPool(memberTotalStake: bigint, fundedMemberCount: number): bigint {
  assertAtomicUnits(memberTotalStake, 'memberTotalStake')
  assertPositiveSafeInteger(fundedMemberCount, 'fundedMemberCount')
  const result = memberTotalStake * BigInt(fundedMemberCount)
  assertAtomicUnits(result, 'group pool')
  return result
}

export interface FeeConfig {
  readonly basisPoints: number
  readonly minimumFee: bigint
  readonly maximumFee: bigint
  readonly tokenDecimals: number
}

/**
 * Mirrors the program: 0..=10000 basis points and non-negative bounds, so a
 * free protocol (0 / 0 / 0) quotes a zero fee instead of throwing.
 */
function validateFeeConfig(config: FeeConfig): void {
  if (!Number.isInteger(config.basisPoints) || config.basisPoints < 0 || config.basisPoints > 10_000) {
    throw new RangeError('basisPoints must be an integer from 0 through 10000')
  }
  assertAtomicUnits(config.minimumFee, 'minimumFee')
  assertAtomicUnits(config.maximumFee, 'maximumFee')
  if (config.minimumFee > config.maximumFee) {
    throw new RangeError('minimumFee must not exceed maximumFee')
  }
  if (!Number.isInteger(config.tokenDecimals) || config.tokenDecimals < 0 || config.tokenDecimals > 255) {
    throw new RangeError('tokenDecimals must be an SPL mint u8 integer')
  }
}

export function quoteActivationFee(pool: bigint, config: FeeConfig): bigint {
  assertAtomicUnits(pool, 'pool')
  validateFeeConfig(config)
  if (pool === 0n) return 0n
  const raw = (pool * BigInt(config.basisPoints)) / BASIS_POINT_DENOMINATOR
  const clamped = raw < config.minimumFee ? config.minimumFee : raw > config.maximumFee ? config.maximumFee : raw
  assertAtomicUnits(clamped, 'activation fee')
  return clamped
}

/**
 * The fee the chain will actually lock: built from the live ProtocolConfig
 * read, never from a client constant, so a config change (e.g. going free)
 * cannot leave the app quoting or funding a fee the program no longer takes.
 */
export function feeConfigFromProtocol(
  account: Readonly<{ feeBasisPoints: number; minimumFee: bigint; maximumFee: bigint }>,
  tokenDecimals: number,
): FeeConfig {
  const config: FeeConfig = Object.freeze({
    basisPoints: account.feeBasisPoints,
    minimumFee: account.minimumFee,
    maximumFee: account.maximumFee,
    tokenDecimals,
  })
  validateFeeConfig(config)
  return config
}

export function splitAtomicUnits(
  total: bigint,
  orderedMembers: readonly PublicKeyText[],
): ReadonlyMap<PublicKeyText, bigint> {
  assertAtomicUnits(total, 'total')
  if (orderedMembers.length === 0) throw new RangeError('orderedMembers must not be empty')
  const uniqueMembers = new Set(orderedMembers)
  if (uniqueMembers.size !== orderedMembers.length) throw new RangeError('orderedMembers must be unique')

  const count = BigInt(orderedMembers.length)
  const base = total / count
  const remainder = total % count
  const allocations = new Map<PublicKeyText, bigint>()
  orderedMembers.forEach((member, index) => allocations.set(member, base + (BigInt(index) < remainder ? 1n : 0n)))
  return allocations
}
