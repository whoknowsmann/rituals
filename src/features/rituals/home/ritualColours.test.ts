import { describe, expect, it } from 'vitest'
import { ritualPalette, ritualTint } from '../../../theme/tokens'
import { ritualTintAmong } from './ritualColours'

const known = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((seed) => ({ address: `${seed}ritual` }))

describe('ritualTintAmong', () => {
  it('gives the first eight remembered rituals eight different colours, in palette order', () => {
    const tints = known.slice(0, 8).map((item) => ritualTintAmong(item.address, known))
    expect(new Set(tints).size).toBe(8)
    expect(tints).toEqual([...ritualPalette])
  })
  it('wraps after the palette and is stable for the same list', () => {
    expect(ritualTintAmong('iritual', known)).toBe(ritualPalette[0])
    expect(ritualTintAmong('critual', known)).toBe(ritualTintAmong('critual', known))
  })
  it('falls back to the address hash for a ritual this phone does not remember', () => {
    expect(ritualTintAmong('unknown', known)).toBe(ritualTint('unknown'))
  })
})
