/**
 * Ritual nonce allocation.
 *
 * P0 product decision locked 2026-09-17: random u64 nonce, with one collision
 * retry driven by the existing Create availability snapshot.
 *
 * Random rather than monotonic because a monotonic counter would require either
 * persistent local state (lost on reinstall) or an extra authoritative read to
 * discover the next free value, and it would leak how many rituals a creator has
 * made. The Ritual PDA is derived from ['ritual', creator, nonce_le_u64], so a
 * random draw from 2^64 makes collision negligible; the retry exists only so a
 * collision degrades into one extra attempt instead of a user-visible failure.
 *
 * This module is pure apart from the injected entropy source. It never persists,
 * reuses, or silently substitutes a nonce.
 */

export const MAX_U64_NONCE = 18_446_744_073_709_551_615n

/** Fills the supplied buffer with cryptographically secure random bytes. */
export type EntropySource = (bytes: Uint8Array) => Uint8Array

export class NonceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonceError'
  }
}

const fail = (message: string): never => {
  throw new NonceError(message)
}

const defaultEntropySource: EntropySource = (bytes) => {
  const cryptoRef = globalThis.crypto
  if (!cryptoRef || typeof cryptoRef.getRandomValues !== 'function') {
    fail('no secure entropy source is available')
  }
  return cryptoRef.getRandomValues(bytes)
}

/**
 * Draw a uniformly random u64 nonce.
 *
 * Every one of the 2^64 values is a valid nonce, so the eight random bytes are
 * used directly with no modulo bias.
 */
export function generateRitualNonce(entropySource: EntropySource = defaultEntropySource): bigint {
  if (typeof entropySource !== 'function') fail('entropy source must be a function')
  const buffer = new Uint8Array(8)
  const filled = entropySource(buffer)
  if (!(filled instanceof Uint8Array) || filled.length !== 8) {
    fail('entropy source must return exactly eight bytes')
  }
  let nonce = 0n
  // Little-endian, matching the PDA seed encoding.
  for (let index = 7; index >= 0; index -= 1) {
    nonce = (nonce << 8n) | BigInt(filled[index])
  }
  return nonce
}

/** Encode a nonce as the little-endian u64 seed used for PDA derivation. */
export function nonceToLeBytes(nonce: bigint): Uint8Array {
  if (typeof nonce !== 'bigint') fail('nonce must be a bigint')
  if (nonce < 0n || nonce > MAX_U64_NONCE) fail('nonce must fit in a u64')
  const bytes = new Uint8Array(8)
  let remaining = nonce
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return bytes
}
