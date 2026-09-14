import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildInitializeProtocolConfigInstruction } from './instructionsLifecycle'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))

describe('Ritual lifecycle instruction builders', () => {
  it('builds initialize protocol config with canonical metas', () => {
    const instruction = buildInitializeProtocolConfigInstruction({
      programId: key(9), authority: key(1),
      config: { allowedStakeMint: key(2), feeRecipient: key(3), feeBasisPoints: 100, minimumFee: 1n, maximumFee: 10n, maximumMemberStake: 100n },
    })
    expect(instruction.keys.map(key => [key.pubkey.toBase58(), key.isWritable, key.isSigner])).toEqual([
      [expect.any(String), true, false], [key(1).toBase58(), true, true], [PublicKey.default.toBase58(), false, false],
    ])
  })
})
