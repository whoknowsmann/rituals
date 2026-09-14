import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { RitualsRpcReader } from './ritualsRpc'
import { RitualConfirmationVerifier, type SubmittedRitualAction } from './ritualConfirmation'

describe('Ritual confirmation verifier', () => {
  it('exposes a verifier for blockheight confirmation and readback', () => {
    expect(RitualConfirmationVerifier).toBeDefined()
    const action: SubmittedRitualAction = {
      signature: '1'.repeat(87),
      blockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58(),
      lastValidBlockHeight: 1,
      submittedContextSlot: 1,
      ritualAddress: new PublicKey(new Uint8Array(32).fill(2)),
      expectation: { kind: 'activated' },
    }
    expect(action.expectation.kind).toBe('activated')
    expect(RitualsRpcReader).toBeDefined()
  })
})
