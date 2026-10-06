import { describe, expect, it, vi } from 'vitest'
import { withWalletSession } from './walletSession'

describe('wallet associations', () => {
  it('blocks rapid wallet choice, another approval, and disconnect until the current request ends', async () => {
    let finish!: () => void
    const first = withWalletSession(() => new Promise<void>((resolve) => { finish = resolve }))
    const next = vi.fn(async () => 'second')
    for (let tap = 0; tap < 3; tap++) await expect(withWalletSession(next)).rejects.toThrow('Finish the open wallet request')
    expect(next).not.toHaveBeenCalled()
    finish(); await first
    expect(await withWalletSession(next)).toBe('second')
  })
  it('unlocks after a decline or exception', async () => {
    await expect(withWalletSession(async () => { throw new Error('declined') })).rejects.toThrow('declined')
    expect(await withWalletSession(async () => 'retry')).toBe('retry')
  })
})
