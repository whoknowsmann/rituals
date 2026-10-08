import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../data/rituals/ritualsRpc'
import { soloRitualModel, type SoloRitualBundle } from '../../features/rituals/solo/lifecycle/soloRitualModel'
import { weekCellLabel, weekSummary } from '../../components/crew/weekStripLogic'
import { keptWeekOnScreen, missedWeekOnScreen, nextUpLine, punchCardCells, titleWeekIndex } from './weekHero'

// Demo speed, two weeks: 45 s to stamp, 10 s grace, the next week 5 s later.
const me = new PublicKey(new Uint8Array(32).fill(7))
const destination = new PublicKey(new Uint8Array(32).fill(9))
const address = new PublicKey(new Uint8Array(32).fill(6))
const week1 = { opens: 1000n, deadline: 1045n, resolution: 1055n }
const week2 = { opens: 1060n, deadline: 1105n, resolution: 1115n }
const schedule = [week1, week2]
const ritual = (overrides: Record<string, unknown> = {}) => ({
  kind: 'Solo', status: 'Active', members: [me], creator: me, witness: null, season: null, schedule,
  currentEventIndex: 0, skipDeclared: false, skipEventIndex: 0, forfeitDestination: destination,
  perEventAllocation: 5_000_000n, stakeDecimals: 6, ...overrides,
})
const event = (index: number, overrides: Record<string, unknown> = {}) => ({ account: {
  eventIndex: index, window: schedule[index], status: 'Claiming', claimedMembersBitmap: 1, confirmedMembersBitmap: 1,
  questionedMembersBitmap: 0, voidReason: 'None', forfeitedTotal: 0n, payoutTotal: 0n, refundedTotal: 0n, eventPool: 0n, ...overrides,
} })
const stamped = { member: me, account: { status: 'Confirmed' } }
const read = (overrides: Record<string, unknown>, current: unknown, claims: readonly unknown[], history: readonly unknown[] = []) =>
  ({ ritual: { account: ritual(overrides), address }, event: current, claims, history }) as unknown as SoloRitualBundle & RitualBundleRead
const keptWeek1 = { ritual: { account: ritual(), address }, event: event(0, { status: 'Settled', payoutTotal: 5_000_000n }), claims: [stamped] }
const missedWeek1 = { ritual: { account: ritual(), address }, event: event(0, { status: 'Settled', claimedMembersBitmap: 0, confirmedMembersBitmap: 0, forfeitedTotal: 5_000_000n }), claims: [] }

const screen = (bundle: SoloRitualBundle, now: number, seen: number | null = null, settlingByItself = true) => {
  const model = soloRitualModel(bundle, now, me)
  const kept = keptWeekOnScreen(model, model.showedUp ? model.eventIndex : seen)
  const cells = punchCardCells(model.weekCells, model.showedUp, kept)
  const account = bundle.ritual.account
  const title = titleWeekIndex(model, kept, account.skipDeclared ? account.skipEventIndex : null) + 1
  return { state: model.state, kept, title, line: nextUpLine(model, schedule, now, kept, settlingByItself), cells: cells.map(weekCellLabel).join(' '), summary: weekSummary(cells) }
}

describe('ritual screen after a stamp (demo speed)', () => {
  it('replaces an unstamped deadline with MISSED and the same ticking line, without claiming it settled', () => {
    const unstamped = read({}, null, [])
    // The chain accepts stamps through the deadline second; only the closed window is missed.
    expect(missedWeekOnScreen(soloRitualModel(unstamped, 1045, me), false)).toBeNull()
    for (const now of [1046, 1050, 1056]) {
      const model = soloRitualModel(unstamped, now, me)
      expect(missedWeekOnScreen(model, false)).toBe(0)
      expect(model.lastClosedOutcome).toBeNull()
      expect(nextUpLine(model, schedule, now, null, true)).toBe(`Week 2 opens in ${1060 - now}s`)
      expect(missedWeekOnScreen(model, true)).toBeNull()
      expect(nextUpLine(model, schedule, now, null, true, true)).toBeNull()
    }
    expect(screen(unstamped, 1056, null, false).line).toBeNull()
    expect(screen(unstamped, 1061).line).toBe('Closing…')
    const lastWeek = read({ currentEventIndex: 1 }, null, [], [missedWeek1])
    expect(screen(lastWeek, 1106).line).toBe('Week closes in 10s')
    expect(screen(lastWeek, 1116).line).toBe('Closing…')
  })

  it('never calls a stamped or declared-skip week MISSED during grace or settlement', () => {
    for (const now of [1046, 1056]) {
      expect(missedWeekOnScreen(soloRitualModel(read({}, event(0), [stamped]), now, me), false)).toBeNull()
      expect(missedWeekOnScreen(soloRitualModel(read({ skipDeclared: true, skipEventIndex: 0 }, null, []), now, me), false)).toBeNull()
    }
  })

  it('keeps YOU SHOWED UP! as the hero from the stamp to the next week, with a ticking line saying when it opens', () => {
    const week1Stamped = read({}, event(0), [stamped])
    // Stamp lands 20 s into the window: ✓ at once, and the next thing that happens, with its time.
    expect(screen(week1Stamped, 1020)).toEqual({ state: 'claimable', kept: 0, title: 1, line: 'Week 2 opens in 40s', cells: '✓ 2', summary: 'Week 1 of 2 · 1 kept' })
    // The rest of the window and the grace: same hero, same line, still ticking.
    expect(screen(week1Stamped, 1045).line).toBe('Week 2 opens in 15s')
    expect(screen(week1Stamped, 1050)).toMatchObject({ state: 'closing', kept: 0, title: 1, line: 'Week 2 opens in 10s', cells: '✓ 2' })
    // The settle key is closing it.
    expect(screen(week1Stamped, 1056)).toMatchObject({ state: 'resolving/settle', kept: 0, line: 'Week 2 opens in 4s', cells: '✓ 2' })
    // Settled, waiting for week 2: the same stamp and title until week 2 takes over, even before week 1's result is read back.
    const settled = read({ currentEventIndex: 1, settledEventCount: 1 }, null, [])
    expect(screen(settled, 1057, 0)).toEqual({ state: 'waiting', kept: 0, title: 1, line: 'Week 2 opens in 3s', cells: '✓ 2', summary: 'Week 2 of 2 · 1 kept' })
    expect(screen(read({ currentEventIndex: 1, settledEventCount: 1 }, null, [], [keptWeek1]), 1057)).toMatchObject({ kept: 0, title: 1, line: 'Week 2 opens in 3s', cells: '✓ 2' })
    // Week 2 opens: the HOLD takes over.
    expect(screen(read({ currentEventIndex: 1, settledEventCount: 1 }, null, [], [keptWeek1]), 1060, 0)).toMatchObject({ state: 'open-not-initialized', kept: null, title: 2, line: null, cells: '✓ NOW' })
  })

  it('never claims a time it cannot keep: no line while only the Settle button can close the week, Closing… if the next week is already due', () => {
    const week1Stamped = read({}, event(0), [stamped])
    expect(screen(week1Stamped, 1056, null, false).line).toBeNull()
    expect(screen(week1Stamped, 1061).line).toBe('Closing…')
  })

  it('counts the last week to its close, then keeps the stamp on the finished ritual', () => {
    const week2Stamped = read({ currentEventIndex: 1, settledEventCount: 1 }, event(1), [stamped], [keptWeek1])
    expect(screen(week2Stamped, 1080)).toMatchObject({ kept: 1, title: 2, line: 'Week closes in 36s', cells: '✓ ✓', summary: 'Week 2 of 2 · 2 kept' })
    expect(screen(week2Stamped, 1116).line).toBe('Closing…')
    const finished = read({ status: 'Completed', currentEventIndex: 2, settledEventCount: 2 }, event(1, { status: 'Settled', payoutTotal: 5_000_000n }), [stamped], [keptWeek1])
    expect(screen(finished, 1117)).toMatchObject({ state: 'completed', kept: 1, line: null, cells: '✓ ✓', summary: 'All 2 weeks done · 2 kept' })
  })

  it('names the week a missed or skipped stamp belongs to, and leaves unstamped weeks alone', () => {
    const missed = read({ currentEventIndex: 1, settledEventCount: 1 }, null, [], [missedWeek1])
    expect(screen(missed, 1057)).toMatchObject({ state: 'missed', kept: null, title: 1, line: 'Week 2 opens in 3s', cells: '✕ 2' })
    const skippedWeek1 = { ritual: { account: ritual({ skipDeclared: true, skipEventIndex: 0 }), address }, event: event(0, { status: 'Voided', voidReason: 'DeclaredSkip', claimedMembersBitmap: 0, confirmedMembersBitmap: 0 }), claims: [] }
    expect(screen(read({ currentEventIndex: 1, settledEventCount: 1, skipDeclared: true, skipEventIndex: 0 }, null, [], [skippedWeek1]), 1057)).toMatchObject({ state: 'skipped', kept: null, title: 1, line: 'Week 2 opens in 3s' })
    // A skip declared for the coming week (week 2, index 1) names that week, never the one before it.
    expect(titleWeekIndex({ state: 'skipped', eventIndex: 1 }, null, 1)).toBe(1)
    expect(screen(read({}, null, []), 990)).toMatchObject({ state: 'waiting', kept: null, title: 1, line: null, cells: '1 2' })
    expect(screen(read({}, null, []), 1020)).toMatchObject({ state: 'open-not-initialized', kept: null, line: null, cells: 'NOW 2' })
    // A stale memory of an older week never borrows the hero.
    expect(screen(read({ currentEventIndex: 1, settledEventCount: 1 }, null, []), 1057, null)).toMatchObject({ kept: null, title: 2, cells: '· 2' })
  })
})
