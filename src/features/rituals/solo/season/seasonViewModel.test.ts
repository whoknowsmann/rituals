import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildSeasonViewModel, seasonCountForNow, seasonParticipantLine, seasonRitualStatus, seasonWindowIndex } from './seasonViewModel'

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

describe('buildSeasonViewModel', () => {
  const address = key(1)
  const season = (participantCount: number) => ({ startAt: 90n, endAt: 330n, schedule, participantCount, checkedInCount: [1, 0, 0] })
  const model = (participantCount: number, nowSeconds: number, rituals: { season: PublicKey | null; status: 'Active' }[] = []) =>
    buildSeasonViewModel({ title: 'October Run Club', season: season(participantCount), seasonAddress: address, rituals, nowSeconds })

  it('says "1 person", not "1 people"', () => {
    expect(model(1, 50).participantLine).toBe('1 person in')
    expect(model(2, 50).participantLine).toBe('2 people in')
  })

  it('offers Join only before the first week opens (the program rejects a late join)', () => {
    expect(model(0, 99).joinOpen).toBe(true)
    expect(model(0, 100).joinOpen).toBe(false)
  })

  it('an unjoined visitor after the start is told joining has closed', () => {
    expect(model(3, 150).statusLabel).toBe('Joining has closed for this Season')
  })

  it('a joined member still sees their own status after the start', () => {
    expect(model(3, 150, [{ season: address, status: 'Active' }]).statusLabel).toBe("You're in")
  })
})

describe('seasonParticipantLine', () => {
  it('reads naturally at 0, 1 and many', () => {
    expect(seasonParticipantLine(0)).toBe('0 people in · Be the first')
    expect(seasonParticipantLine(1)).toBe('1 person in')
    expect(seasonParticipantLine(3)).toBe('3 people in')
  })
})

