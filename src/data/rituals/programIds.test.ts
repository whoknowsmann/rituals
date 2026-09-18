import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  LOCAL_PLACEHOLDER_PROGRAM_ID,
  RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID,
  RITUALS_PROGRAM_ID,
  RITUALS_PROGRAM_ID_BASE58,
  assertSupportedRitualsProgram,
} from './programIds'

describe('Rituals program identity', () => {
  it('pins the canonical program identity', () => {
    expect(RITUALS_PROGRAM_ID_BASE58).toBe('2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p')
    expect(RITUALS_PROGRAM_ID.toBase58()).toBe(RITUALS_PROGRAM_ID_BASE58)
  })

  it('keeps the legacy aliases pointing at the same identity', () => {
    expect(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID).toBe(RITUALS_PROGRAM_ID_BASE58)
    expect(LOCAL_PLACEHOLDER_PROGRAM_ID.toBase58()).toBe(RITUALS_PROGRAM_ID_BASE58)
  })

  it('fails closed while no authorized deployment is configured', () => {
    expect(() => assertSupportedRitualsProgram('devnet', RITUALS_PROGRAM_ID)).toThrow(/canonical|authorized/i)
  })

  it('rejects a mismatched or invalid program identity', () => {
    expect(() => assertSupportedRitualsProgram('devnet', new PublicKey(new Uint8Array(32).fill(1)))).toThrow(/authorized|mismatch/i)
    expect(() => assertSupportedRitualsProgram('mainnet-beta' as never, RITUALS_PROGRAM_ID)).toThrow(/cluster/i)
  })
})
