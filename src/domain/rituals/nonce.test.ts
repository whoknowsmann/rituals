import { describe, expect, it, vi } from 'vitest'
import { MAX_U64_NONCE, generateRitualNonce, nonceToLeBytes } from './nonce'

describe('generateRitualNonce', () => {
  it('returns a bigint within the u64 range', () => {
    const nonce = generateRitualNonce()
    expect(typeof nonce).toBe('bigint')
    expect(nonce).toBeGreaterThanOrEqual(0n)
    expect(nonce).toBeLessThanOrEqual(MAX_U64_NONCE)
  })

  it('produces different values across calls', () => {
    const values = new Set(Array.from({ length: 64 }, () => generateRitualNonce()))
    // Collisions in 64 draws from 2^64 are effectively impossible; a repeat means
    // the entropy source is broken.
    expect(values.size).toBe(64)
  })

  it('uses the injected entropy source exactly once per call', () => {
    const source = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff)
      return bytes
    })
    const nonce = generateRitualNonce(source)
    expect(source).toHaveBeenCalledTimes(1)
    expect(nonce).toBe(MAX_U64_NONCE)
  })

  it('maps an all-zero entropy draw to zero', () => {
    const nonce = generateRitualNonce((bytes) => {
      bytes.fill(0x00)
      return bytes
    })
    expect(nonce).toBe(0n)
  })

  it('requests exactly eight bytes of entropy', () => {
    let seen = -1
    generateRitualNonce((bytes) => {
      seen = bytes.length
      return bytes
    })
    expect(seen).toBe(8)
  })

  it('rejects an entropy source that returns the wrong length', () => {
    expect(() => generateRitualNonce(() => new Uint8Array(4))).toThrow()
  })

  it('rejects an entropy source that returns a non-Uint8Array', () => {
    // @ts-expect-error deliberate hostile return value
    expect(() => generateRitualNonce(() => [1, 2, 3, 4, 5, 6, 7, 8])).toThrow()
  })

  it('rejects a non-function entropy source', () => {
    // @ts-expect-error deliberate hostile argument
    expect(() => generateRitualNonce('not-a-function')).toThrow()
  })
})

describe('nonceToLeBytes', () => {
  it('encodes zero as eight zero bytes', () => {
    expect(Array.from(nonceToLeBytes(0n))).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('encodes u64 max as eight 0xff bytes', () => {
    expect(Array.from(nonceToLeBytes(MAX_U64_NONCE))).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })

  it('encodes little-endian byte order', () => {
    expect(Array.from(nonceToLeBytes(1n))).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(nonceToLeBytes(256n))).toEqual([0, 1, 0, 0, 0, 0, 0, 0])
  })

  it('rejects values outside the u64 range', () => {
    expect(() => nonceToLeBytes(-1n)).toThrow()
    expect(() => nonceToLeBytes(MAX_U64_NONCE + 1n)).toThrow()
  })

  it('rejects non-bigint input', () => {
    // @ts-expect-error deliberate hostile argument
    expect(() => nonceToLeBytes(5)).toThrow()
  })

  it('returns an independent copy on each call', () => {
    const first = nonceToLeBytes(1n)
    first[0] = 9
    expect(Array.from(nonceToLeBytes(1n))).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })
})
