import { describe, expect, it } from 'vitest'
import { closedWeekCount, eventOutcome, soloHomeCells } from './soloHistory'

const solo = (status: string, currentEventIndex: number) => ({ kind: 'Solo' as const, status, currentEventIndex, schedule: [1, 2, 3, 4] })

describe('Home solo week strip (missed weeks used to show as ticks)', () => {
  it('counts closed weeks for solo rituals only', () => {
    expect(closedWeekCount(solo('Active', 2))).toBe(2)
    expect(closedWeekCount(solo('Completed', 3))).toBe(4)
    expect(closedWeekCount({ ...solo('Active', 2), kind: 'Group' })).toBe(0)
  })

  it('reads a week result from its event: forfeit = missed', () => {
    expect(eventOutcome({ status: 'Settled', forfeitedTotal: 5_000_000n })).toBe('missed')
    expect(eventOutcome({ status: 'Settled', forfeitedTotal: 0n })).toBe('done')
    expect(eventOutcome({ status: 'Claiming', forfeitedTotal: 0n })).toBeNull()
  })

  it('shows kept / missed when known, a neutral closed mark when not, never a guessed tick', () => {
    expect(soloHomeCells(solo('Completed', 3), new Map([[0, 'missed'], [2, 'done']]))).toEqual(['missed', 'closed', 'done', 'closed'])
    expect(soloHomeCells(solo('Active', 1), undefined)).toEqual(['closed', 'now', 'future', 'future'])
  })
})
