import { sha256 } from '@noble/hashes/sha256'

export interface ReviewedTransactionIdentity {
  readonly sha256: string
  readonly displayId: string
  readonly byteLength: number
}

const reviewedSnapshots = new WeakMap<ReviewedTransactionIdentity, Uint8Array>()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export class ReviewIdentityMismatchError extends Error {
  constructor() {
    super('Transaction bytes changed after review; re-analysis is required.')
    this.name = 'ReviewIdentityMismatchError'
  }
}

export function createReviewIdentity(bytes: Uint8Array): ReviewedTransactionIdentity {
  const snapshot = new Uint8Array(bytes)
  const digest = toHex(sha256(snapshot))
  const identity = Object.freeze({
    sha256: digest,
    displayId: digest.slice(0, 12).toUpperCase(),
    byteLength: snapshot.length,
  })
  reviewedSnapshots.set(identity, snapshot)
  return identity
}

export function verifyReviewedTransactionIdentity(
  identity: ReviewedTransactionIdentity,
  candidateBytes: Uint8Array,
): boolean {
  const snapshot = reviewedSnapshots.get(identity)
  if (!snapshot || identity.byteLength !== candidateBytes.length) {
    return false
  }
  return equalBytes(snapshot, candidateBytes) && identity.sha256 === toHex(sha256(candidateBytes))
}

export function assertReviewedTransactionUnchanged(
  identity: ReviewedTransactionIdentity,
  candidateBytes: Uint8Array,
): void {
  if (!verifyReviewedTransactionIdentity(identity, candidateBytes)) {
    throw new ReviewIdentityMismatchError()
  }
}
