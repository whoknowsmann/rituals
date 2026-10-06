import { describe, expect, it } from 'vitest'
import { atomicDecimalText, splitTotalStake } from './stakeSplit'

describe('one total stake split across the weeks (Jack, 2026-10-06)', () => {
  it('splits an even total exactly', () => {
    const result = splitTotalStake('20', 4)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(atomicDecimalText(result.split.perWeekAtomic)).toBe('5')
    expect(atomicDecimalText(result.split.lockedAtomic)).toBe('20')
    expect(result.split.exact).toBe(true)
  })

  it('rounds each week down to 2 decimals and says what actually locks', () => {
    const result = splitTotalStake('20', 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(atomicDecimalText(result.split.perWeekAtomic)).toBe('6.66')
    expect(atomicDecimalText(result.split.lockedAtomic)).toBe('19.98')
    expect(result.split.exact).toBe(false)
  })

  it('refuses a total too small to give every week at least 0.01', () => {
    expect(splitTotalStake('0.03', 4)).toEqual({ ok: false, reason: 'too-small' })
    expect(splitTotalStake('0.04', 4).ok).toBe(true)
  })

  it('treats empty, zero and garbage as invalid', () => {
    for (const text of ['', '0', 'abc', '-5', '1.1234567']) expect(splitTotalStake(text, 4)).toEqual({ ok: false, reason: 'invalid' })
  })
})
