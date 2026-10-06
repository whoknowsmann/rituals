import { PublicKey } from '@solana/web3.js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('./reminders/runtime', () => ({ clearRitualReminders: vi.fn(async () => undefined) }))

import { RitualRpcError, type RitualBundleRead } from '../../data/rituals/ritualsRpc'
import { forgetRitual, listKnownRituals, rememberRitual, readKnownRitualBundles, type KnownRitual } from './authoritativeRituals'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58()
const ritual = (byte: number): KnownRitual => ({ address: key(byte), title: `r${byte}`, requirement: 'run' })
const bundle = { ritual: { account: {} } } as unknown as RitualBundleRead

describe('readKnownRitualBundles (home screen list)', () => {
  it('persists the typed destination owner per ritual and keeps it through recovery remembers', async () => {
    let stored: string | null = null
    vi.mocked(AsyncStorage.getItem).mockImplementation(async () => stored)
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value })
    await rememberRitual({ ...ritual(1), destinationOwner: key(9) })
    await rememberRitual(ritual(2))
    await rememberRitual(ritual(1))
    expect((await listKnownRituals()).find((item) => item.address === key(1))?.destinationOwner).toBe(key(9))
    expect((await listKnownRituals()).find((item) => item.address === key(2))?.destinationOwner).toBeUndefined()
    stored = JSON.stringify([{ ...ritual(3), destinationOwner: 'invalid' }])
    expect(await listKnownRituals()).toEqual([ritual(3)])
  })
  it('bounds reads on a large Home while preserving order', async () => {
    let active = 0; let peak = 0
    const known = Array.from({ length: 20 }, (_, i) => ritual(i + 1))
    const loaded = await readKnownRitualBundles(known, async () => {
      active++; peak = Math.max(peak, active)
      await Promise.resolve(); active--; return bundle
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(loaded.map((entry) => entry.address)).toEqual(known.map((entry) => entry.address))
  })
  it('serializes double remove and concurrent remembers without resurrecting a removed ritual', async () => {
    let stored: string | null = null
    vi.mocked(AsyncStorage.getItem).mockImplementation(async () => stored)
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value })
    await Promise.all([rememberRitual(ritual(1)), rememberRitual(ritual(2))])
    await Promise.all([forgetRitual(key(1)), rememberRitual(ritual(3)), forgetRitual(key(1))])
    expect((await listKnownRituals()).map((entry) => entry.address)).toEqual([key(2), key(3)])
  })
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
