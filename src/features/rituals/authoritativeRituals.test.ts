import { PublicKey } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))

import { RitualRpcError, type RitualBundleRead } from '../../data/rituals/ritualsRpc'
import { readKnownRitualBundles, type KnownRitual } from './authoritativeRituals'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58()
const ritual = (byte: number): KnownRitual => ({ address: key(byte), title: `r${byte}`, requirement: 'run' })
const bundle = { ritual: { account: {} } } as unknown as RitualBundleRead

describe('readKnownRitualBundles (home screen list)', () => {
  it('skips a remembered ritual that no longer decodes instead of failing the whole home screen', async () => {
    const read = vi.fn(async (address: PublicKey) => {
      if (address.toBase58() === key(1)) throw new RitualRpcError('decode', 'Ritual account data is invalid')
      return bundle
    })
    const loaded = await readKnownRitualBundles([ritual(1), ritual(2)], read)
    expect(loaded.map((item) => item.address)).toEqual([key(2)])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('skips a ritual whose account is gone', async () => {
    const loaded = await readKnownRitualBundles([ritual(3)], async () => { throw new RitualRpcError('not-found', 'missing') })
    expect(loaded).toEqual([])
  })

  it('still fails loudly on a transient RPC error so the screen can offer a retry', async () => {
    const read = vi.fn(async (address: PublicKey) => {
      if (address.toBase58() === key(4)) throw new RitualRpcError('rpc', '429')
      return bundle
    })
    await expect(readKnownRitualBundles([ritual(4), ritual(5)], read)).rejects.toThrow('429')
  })
})
