import type { ConfirmationMode } from './types'

const MIN_FUNDED_MEMBER_COUNT = 2
const MAX_FUNDED_MEMBER_COUNT = 6

function assertValidFundedMemberCount(fundedMemberCount: number): void {
  if (
    !Number.isInteger(fundedMemberCount) ||
    fundedMemberCount < MIN_FUNDED_MEMBER_COUNT ||
    fundedMemberCount > MAX_FUNDED_MEMBER_COUNT
  ) {
    throw new RangeError('fundedMemberCount must be an integer in the range 2..6')
  }
}

export function requiredAdditionalConfirmations(
  mode: ConfirmationMode,
  fundedMemberCount: number,
): number {
  assertValidFundedMemberCount(fundedMemberCount)

  switch (mode) {
    case 'HONOR':
      return 0
    case 'ONE_FRIEND':
      return 1
    case 'MAJORITY':
      return Math.floor((fundedMemberCount - 1) / 2) + 1
    case 'UNANIMOUS':
      return fundedMemberCount - 1
    default:
      throw new RangeError(`Unsupported confirmation mode: ${String(mode)}`)
  }
}

export function assertValidAdditionalConfirmationThreshold(
  threshold: number,
  fundedMemberCount: number,
): void {
  assertValidFundedMemberCount(fundedMemberCount)

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > fundedMemberCount - 1) {
    throw new RangeError(
      'threshold must be an integer in the range 0..fundedMemberCount - 1',
    )
  }
}
