import { describe, expect, it, vi } from 'vitest'
import { SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js'
import { estimatedChainTime, readChainTime } from './chainTime'

describe('week clock', () => {
  it('reads the program clock even when the phone clock is years wrong', async () => {
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(1)
    try {
      const data = Buffer.alloc(40); data.writeBigInt64LE(1_800_000_000n, 32)
      const getAccountInfo = vi.fn(async () => ({ data }))
      expect(await readChainTime({ getAccountInfo } as never)).toBe(1_800_000_000)
      expect(getAccountInfo).toHaveBeenCalledWith(SYSVAR_CLOCK_PUBKEY, 'confirmed')
      expect(estimatedChainTime({ seconds: 100, monotonicMs: 5000 }, 7000)).toBe(102)
    } finally { wallClock.mockRestore() }
  })
  it('never guesses when the clock is missing, stale, or reset', async () => {
    await expect(readChainTime({ getAccountInfo: async () => null } as never)).rejects.toThrow('clock')
    expect(estimatedChainTime(null, 100)).toBeNull()
    expect(estimatedChainTime({ seconds: 100, monotonicMs: 5000 }, 65_000)).toBeNull()
    expect(estimatedChainTime({ seconds: 100, monotonicMs: 5000 }, 0)).toBeNull()
  })
})
