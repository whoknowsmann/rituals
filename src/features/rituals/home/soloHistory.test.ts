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
    expect(eventOutcome({ status: 'Settled', forfeitedTotal: 5_000_000n, voidReason: 'None' })).toBe('missed')
    expect(eventOutcome({ status: 'Settled', forfeitedTotal: 0n, voidReason: 'None' })).toBe('done')
    expect(eventOutcome({ status: 'Claiming', forfeitedTotal: 0n, voidReason: 'None' })).toBeNull()
  })

  it('never counts a declared skip as kept, and never shows a skipped week as NOW', () => {
    expect(eventOutcome({ status: 'Voided', forfeitedTotal: 0n, voidReason: 'DeclaredSkip' })).toBe('skipped')
    expect(eventOutcome({ status: 'Voided', forfeitedTotal: 0n, voidReason: 'UnresolvedClaims' })).toBe('done')
    const skipped = { ...solo('Active', 0), schedule: [{ opens: 100n, deadline: 145n }, { opens: 160n, deadline: 205n }], skipDeclared: true, skipEventIndex: 0 }
    expect(soloHomeCells(skipped, undefined, 120)).toEqual(['skip-pending', 'future'])
    expect(soloHomeCells({ ...skipped, currentEventIndex: 1 }, undefined, 170)).toEqual(['closed', 'now'])
    expect(soloHomeCells({ ...skipped, currentEventIndex: 1 }, new Map([[0, 'skipped']]), 170)).toEqual(['skipped', 'now'])
  })

  it('shows kept / missed when known, a neutral closed mark when not, never a guessed tick', () => {
    expect(soloHomeCells(solo('Completed', 3), new Map([[0, 'missed'], [2, 'done']]))).toEqual(['missed', 'closed', 'done', 'closed'])
    expect(soloHomeCells(solo('Active', 1), undefined)).toEqual(['closed', 'current', 'future', 'future'])
  })
  it('never marks a waiting or expired week NOW', () => {
    const account = { ...solo('Active', 0), schedule: [{ opens: 100n, deadline: 145n }] }
    for (const now of [null, 99, 146]) expect(soloHomeCells(account, undefined, now)).toEqual(['current'])
    expect(soloHomeCells(account, undefined, 100)).toEqual(['now'])
  })
})
