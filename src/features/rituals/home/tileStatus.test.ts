import { describe, expect, it } from 'vitest'
import { laterWeekOpenAt, stampedWeekClosingLabel, tileStatus } from './tileStatus'
import { ritualPalette, ritualTint } from '../../../theme/tokens'

describe('Home tile', () => {
  it('replaces a stamped week\'s pending kept count with the chain close time, then Closing…', () => {
    const model = { showedUp: true, settleOpensAt: 1000, demoSpeedNotice: 'Demo speed' }
    expect(stampedWeekClosingLabel(model, 968)).toBe('Week closes in 32s')
    expect(stampedWeekClosingLabel(model, 1000)).toBe('Closing…')
    expect(stampedWeekClosingLabel(model, 1001)).toBe('Closing…')
    expect(stampedWeekClosingLabel({ ...model, showedUp: false }, 968)).toBeNull()
    expect(stampedWeekClosingLabel({ ...model, settleOpensAt: null }, 968)).toBeNull()
    const at = Math.floor(new Date(2026, 9, 8, 15, 0, 0).getTime() / 1000)
    expect(stampedWeekClosingLabel({ ...model, settleOpensAt: at, demoSpeedNotice: null }, at - 86400)).toBe('Week closes Thu, Oct 8 · 3:00 PM')
  })
  it('says what the ritual wants from you now', () => {
    expect(tileStatus({ state: 'open-not-initialized', showedUp: false, nextOpensLabel: null })).toEqual({ text: 'Stamp this week', act: true })
    expect(tileStatus({ state: 'claimable', showedUp: true, nextOpensLabel: null })).toEqual({ text: 'Stamped', act: false })
    expect(tileStatus({ state: 'waiting', showedUp: false, nextOpensLabel: 'in 2 min' }).text).toBe('Opens in 2 min')
    expect(tileStatus({ state: 'completed', showedUp: false, nextOpensLabel: null }).text).toBe('Finished')
    expect(tileStatus({ state: 'skipped', showedUp: false, nextOpensLabel: null, weekSkipped: true }).text).toBe('Skipped this week')
    expect(tileStatus({ state: 'skipped', showedUp: false, nextOpensLabel: 'in 2 min', weekSkipped: false }).text).toBe('Skipped last week')
  })

  it('gives each ritual a stable colour of its own', () => {
    expect(ritualTint('7MrGM5xFFsFTB5U39SNkYN3H4YpqHjTR1n3peiQ6sxo3')).toBe(ritualTint('7MrGM5xFFsFTB5U39SNkYN3H4YpqHjTR1n3peiQ6sxo3'))
    const tints = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((seed) => ritualTint(`${seed}ritual`)))
    expect(tints.size).toBeGreaterThan(3)
    for (const tint of tints) expect(ritualPalette).toContain(tint)
  })
})

describe('Home tile when the chain moved on but the last week is unsettled (design review 2026-10-07)', () => {
  const schedule = [{ opens: 100, deadline: 145 }, { opens: 160, deadline: 205 }]
  it('asks for a stamp while a later week is open', () => {
    expect(laterWeekOpenAt(schedule, 0, 170)).toBe(true)
    expect(tileStatus({ state: 'resolving/settle', showedUp: true, nextOpensLabel: null }, true)).toEqual({ text: 'Stamp this week', act: true })
  })
  it('does nothing different before the later week opens or after it closes', () => {
    expect(laterWeekOpenAt(schedule, 0, 150)).toBe(false)
    expect(laterWeekOpenAt(schedule, 0, 206)).toBe(false)
    expect(laterWeekOpenAt(schedule, 1, 170)).toBe(false)
  })
})
