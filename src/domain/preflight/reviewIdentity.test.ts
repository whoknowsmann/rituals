import { describe, expect, it } from 'vitest'
import {
  assertReviewedTransactionUnchanged,
  createReviewIdentity,
  ReviewIdentityMismatchError,
  verifyReviewedTransactionIdentity,
} from './reviewIdentity'

describe('reviewIdentity', () => {
  it('creates a stable SHA-256 identity and defensive byte snapshot', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const identity = createReviewIdentity(bytes)
    bytes[0] = 9

    expect(identity.sha256).toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    )
    expect(identity.displayId).toBe('039058C6F2C0')
    expect(identity.byteLength).toBe(3)
    expect(identity).not.toHaveProperty('reviewedBytes')
    expect(verifyReviewedTransactionIdentity(identity, new Uint8Array([1, 2, 3]))).toBe(true)
    expect(verifyReviewedTransactionIdentity(identity, bytes)).toBe(false)
  })

  it('accepts only the exact reviewed bytes', () => {
    const identity = createReviewIdentity(new Uint8Array([10, 20, 30]))

    expect(verifyReviewedTransactionIdentity(identity, new Uint8Array([10, 20, 30]))).toBe(
      true,
    )
    expect(() =>
      assertReviewedTransactionUnchanged(identity, new Uint8Array([10, 20, 30])),
    ).not.toThrow()
  })

  it.each([
    new Uint8Array([10, 20, 31]),
    new Uint8Array([10, 20]),
    new Uint8Array([10, 20, 30, 0]),
  ])('rejects changed bytes and requires re-analysis', (candidate) => {
    const identity = createReviewIdentity(new Uint8Array([10, 20, 30]))

    expect(verifyReviewedTransactionIdentity(identity, candidate)).toBe(false)
    expect(() => assertReviewedTransactionUnchanged(identity, candidate)).toThrow(
      ReviewIdentityMismatchError,
    )
    expect(() => assertReviewedTransactionUnchanged(identity, candidate)).toThrow(
      /changed.*re-analysis/i,
    )
  })
})
