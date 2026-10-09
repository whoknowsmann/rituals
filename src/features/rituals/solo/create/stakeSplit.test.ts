import { describe, expect, it } from 'vitest'
import { DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE, type RitualCadence } from '../../../../domain/rituals/schedule'
import { formatAtomic } from '../../displayFormat'
import { STAKE_PRESETS, selectSoloSchedule, soloScheduleSummary } from './schedule'
import { atomicDecimalText, splitTotalStake } from './stakeSplit'

describe('one total stake split across the weeks (Jack, 2026-10-06)', () => {
  it('splits an even total exactly', () => {
    const result = splitTotalStake('20', 4)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(atomicDecimalText(result.split.perWeekAtomic)).toBe('5')
    expect(atomicDecimalText(result.split.lockedAtomic)).toBe('20')
  })

  it('splits at the mint’s full precision, never locking more than chosen (Jack, 2026-10-09)', () => {
    const result = splitTotalStake('20', 6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.split.perWeekAtomic).toBe(3_333_333n)
    expect(result.split.lockedAtomic).toBe(19_999_998n)
    expect(atomicDecimalText(result.split.lockedAtomic)).toBe('19.999998')
    expect(Object.keys(result.split).sort()).toEqual(['lockedAtomic', 'perWeekAtomic', 'totalAtomic'])
  })

  it('every pick over 1–16 weeks: weeks × share ≤ total, short of it by under one atomic unit a week, and shown as the total chosen', () => {
    for (const total of STAKE_PRESETS) {
      for (let weeks = 1; weeks <= 16; weeks += 1) {
        const result = splitTotalStake(total, weeks)
        if (!result.ok) throw new Error(`${total} over ${weeks} weeks did not split`)
        const { totalAtomic, perWeekAtomic, lockedAtomic } = result.split
        expect(lockedAtomic).toBe(perWeekAtomic * BigInt(weeks))
        expect(lockedAtomic <= totalAtomic).toBe(true)
        expect(totalAtomic - lockedAtomic < BigInt(weeks)).toBe(true)
        expect(formatAtomic(lockedAtomic, 6)).toBe(`${total} tSKR`)
      }
    }
  })

  it('refuses only a total too small to give every week one atomic unit', () => {
    expect(splitTotalStake('0.000003', 4)).toEqual({ ok: false, reason: 'too-small' })
    expect(splitTotalStake('0.000004', 4).ok).toBe(true)
    // The old 0.01-a-week floor is gone.
    expect(splitTotalStake('0.03', 4).ok).toBe(true)
  })

  it('treats empty, zero and garbage as invalid', () => {
    for (const text of ['', '0', 'abc', '-5', '1.1234567']) expect(splitTotalStake(text, 4)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('what the create screen says for a split', () => {
  // The screen's own labels: formatAtomic of the split, into the one schedule line.
  const now = Math.floor(new Date(2026, 9, 4, 15, 0, 0).getTime() / 1000)
  const line = (total: string, weeks: number, cadence: RitualCadence) => {
    const result = splitTotalStake(total, weeks)
    if (!result.ok) throw new Error('no split')
    return soloScheduleSummary({ weekCount: weeks, stakeEachLabel: formatAtomic(result.split.perWeekAtomic, 6), totalStakeLabel: formatAtomic(result.split.lockedAtomic, 6),
      schedule: selectSoloSchedule({ cadence, referenceSeconds: now, eventCount: weeks }).schedule, nowSeconds: now })
  }

  it('20 over 6 weeks reads 3.33 a week; one week reads the total chosen', () => {
    expect(line('20', 6, DEMO_SOLO_CADENCE)).toBe('6 demo weeks · 1 min each · 3.33 tSKR a week')
    expect(line('20', 6, REAL_SOLO_CADENCE)).toMatch(/^3\.33 tSKR a week · ends /)
    expect(line('20', 4, REAL_SOLO_CADENCE)).toMatch(/^5 tSKR a week · ends /)
    for (const total of STAKE_PRESETS) expect(line(total, 1, DEMO_SOLO_CADENCE)).toBe(`1 demo week · 1 min · ${total} tSKR`)
  })
})
