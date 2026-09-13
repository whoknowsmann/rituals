import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { LOCAL_PLACEHOLDER_PROGRAM_ID, RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID, assertSupportedRitualsProgram } from './programIds'

describe('Rituals program identity', () => {
  it('freezes the local placeholder identity and devnet boundary', () => {
    expect(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID).toBe('8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB')
    expect(LOCAL_PLACEHOLDER_PROGRAM_ID.toBase58()).toBe(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(() => assertSupportedRitualsProgram('devnet', LOCAL_PLACEHOLDER_PROGRAM_ID)).toThrow(/placeholder|authorized/i)
  })
  it('rejects a mismatched or invalid program identity', () => {
    expect(() => assertSupportedRitualsProgram('devnet', new PublicKey(new Uint8Array(32).fill(1)))).toThrow(/authorized|configured/i)
    expect(() => assertSupportedRitualsProgram('mainnet-beta' as never, LOCAL_PLACEHOLDER_PROGRAM_ID)).toThrow(/cluster/i)
  })
})
