import { describe, expect, it } from 'vitest'
import { stepWeeks, STAKE_PRESETS } from './schedule'

describe('create controls (weeks stepper, stake picks)', () => {
  it('steps weeks one at a time within the program limit 1..16', () => {
    expect(stepWeeks(4, 1)).toBe(5)
    expect(stepWeeks(1, -1)).toBe(1)
    expect(stepWeeks(16, 1)).toBe(16)
  })
  it('offers small whole-TEST quick picks', () => {
    expect(STAKE_PRESETS).toEqual(['1', '5', '10', '25'])
  })
})
import { DEMO_CADENCE } from '../../../../domain/rituals/schedule'
import { selectSoloSchedule, soloEventCount } from './schedule'

const generated = selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 4 })

describe('solo create schedule selection', () => {
  it('generates a demo schedule from firstEventStart for an unlinked ritual', () => {
    expect(generated.source).toBe('generated')
    expect(generated.schedule).toHaveLength(4)
    expect(generated.schedule[0].claimOpensAt).toBe(1_120)
    expect(generated.schedule[1].claimOpensAt).toBe(1_300)
  })

  it('uses the Season schedule exactly instead of generating a new one', () => {
    const season = [
      { opens: 20_000n, deadline: 20_090n, resolution: 20_150n },
      { opens: 20_180n, deadline: 20_270n, resolution: 20_330n },
    ] as const
    const selected = selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 2, seasonSchedule: season })
    expect(selected.source).toBe('season')
    expect(selected.schedule).toEqual([
      { eventIndex: 0, claimOpensAt: 20_000, claimDeadlineAt: 20_090, resolutionDeadlineAt: 20_150 },
      { eventIndex: 1, claimOpensAt: 20_180, claimDeadlineAt: 20_270, resolutionDeadlineAt: 20_330 },
    ])
  })

  it('rejects a Season template whose event count does not match the promise', () => {
    expect(() => selectSoloSchedule({
      cadence: DEMO_CADENCE,
      referenceSeconds: 1_000,
      eventCount: 4,
      seasonSchedule: [{ opens: 20_000n, deadline: 20_090n, resolution: 20_150n }],
    })).toThrow('Season schedule does not match this ritual.')
  })

  describe('soloEventCount (how many weeks the promise runs)', () => {
    it('always follows a joined Season, whatever suggestion was picked', () => {
      expect(soloEventCount({ seasonWindows: 16, picked: '6' })).toBe(16)
    })
    it('uses the suggestion the user actually picked', () => {
      expect(soloEventCount({ picked: '6' })).toBe(6)
      expect(soloEventCount({ picked: 8 })).toBe(8)
    })
    it('defaults to 4 weeks for a typed promise or an invalid value', () => {
      for (const picked of [undefined, '', 'x', '0', '17', '2.5']) expect(soloEventCount({ picked })).toBe(4)
    })
  })
})
