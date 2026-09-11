import { describe, expect, it } from 'vitest'
import {
  assertValidAdditionalConfirmationThreshold,
  requiredAdditionalConfirmations,
} from './threshold'
import { requiredAdditionalConfirmations as requiredFromBarrel } from './index'

describe('requiredAdditionalConfirmations', () => {
  it.each([
    ['HONOR', 2, 0],
    ['ONE_FRIEND', 2, 1],
    ['ONE_FRIEND', 3, 1],
    ['ONE_FRIEND', 4, 1],
    ['ONE_FRIEND', 5, 1],
    ['ONE_FRIEND', 6, 1],
    ['MAJORITY', 2, 1],
    ['MAJORITY', 3, 2],
    ['MAJORITY', 4, 2],
    ['MAJORITY', 5, 3],
    ['MAJORITY', 6, 3],
    ['UNANIMOUS', 2, 1],
    ['UNANIMOUS', 4, 3],
    ['UNANIMOUS', 6, 5],
  ] as const)('%s with N=%d requires %d confirmations', (mode, memberCount, expected) => {
    expect(requiredAdditionalConfirmations(mode, memberCount)).toBe(expected)
  })

  it('is exported through the rituals barrel', () => {
    expect(requiredFromBarrel('MAJORITY', 4)).toBe(2)
  })

  it.each([1, 7, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid funded member count %s',
    (memberCount) => {
      expect(() => requiredAdditionalConfirmations('HONOR', memberCount)).toThrow(
        /fundedMemberCount must be an integer in the range 2\.\.6/,
      )
    },
  )

  it('rejects an unknown runtime confirmation mode', () => {
    expect(() =>
      requiredAdditionalConfirmations('UNKNOWN' as never, 2),
    ).toThrow(/Unsupported confirmation mode: UNKNOWN/)
  })
})

describe('assertValidAdditionalConfirmationThreshold', () => {
  it.each([
    [0, 2],
    [1, 2],
    [0, 4],
    [1, 4],
    [3, 4],
    [0, 6],
    [5, 6],
  ])('accepts threshold %d for %d funded members', (threshold, memberCount) => {
    expect(assertValidAdditionalConfirmationThreshold(threshold, memberCount)).toBeUndefined()
  })

  it.each([-1, 4, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid threshold %s',
    (threshold) => {
      expect(() => assertValidAdditionalConfirmationThreshold(threshold, 4)).toThrow(
        /threshold must be an integer in the range 0\.\.fundedMemberCount - 1/,
      )
    },
  )

  it('reuses funded member count validation', () => {
    expect(() => assertValidAdditionalConfirmationThreshold(0, 1)).toThrow(
      /fundedMemberCount must be an integer in the range 2\.\.6/,
    )
  })
})
