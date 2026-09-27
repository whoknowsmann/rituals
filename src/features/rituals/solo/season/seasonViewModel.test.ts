import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { seasonCountForNow, seasonRitualStatus, seasonWindowIndex } from './seasonViewModel'

const key = (seed: number) => new PublicKey(new Uint8Array(32).fill(seed))
const schedule = [
  { opens: 100n, deadline: 110n, resolution: 120n },
  { opens: 200n, deadline: 210n, resolution: 220n },
  { opens: 300n, deadline: 310n, resolution: 320n },
] as const

describe('seasonWindowIndex', () => {
  it('uses the first window before the season starts', () => expect(seasonWindowIndex(schedule, 99)).toBe(0))
  it('keeps the opened window between windows', () => {
    expect(seasonWindowIndex(schedule, 100)).toBe(0)
    expect(seasonWindowIndex(schedule, 199)).toBe(0)
    expect(seasonWindowIndex(schedule, 200)).toBe(1)
  })
  it('uses the last window after the season ends', () => expect(seasonWindowIndex(schedule, 999)).toBe(2))
  it('selects the same index for the displayed checked-in count', () => {
    expect(seasonCountForNow([4, 7, 9], schedule, 205)).toEqual({ index: 1, count: 7 })
  })
})

describe('seasonRitualStatus', () => {
  const season = key(1)
  it('maps no matching ritual to not joined', () => {
    expect(seasonRitualStatus([], season)).toBe('not-joined')
    expect(seasonRitualStatus([{ season: key(2), status: 'Active' }], season)).toBe('not-joined')
  })
  it.each([
    ['Funding', 'funding'],
    ['Active', 'active'],
    ['Completed', 'completed'],
    ['Cancelled', 'cancelled'],
  ] as const)('maps a matching %s ritual', (status, expected) => {
    expect(seasonRitualStatus([{ season, status }], season)).toBe(expected)
  })
})
