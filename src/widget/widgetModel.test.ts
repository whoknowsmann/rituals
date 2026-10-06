import { describe, expect, it } from 'vitest'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { buildWidgetSnapshot, openWidgetState, selectWidgetSnapshot, widgetModel, widgetModelFromSnapshot, widgetStreak, WIDGET_THRESHOLDS, type WeekOutcome, type WidgetOutcome, type WidgetWeek } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const week = (opens = 1000, deadline = 1300, outcome: WeekOutcome = 'pending'): WidgetWeek => ({ opens, deadline, outcome })
const outcome = (overrides: Partial<WidgetOutcome> = {}): WidgetOutcome => ({ address: 'newer', stakeLabel: '5 TEST', causeLabel: 'Northside Food Bank (demo)', active: true, weeks: [week()], ...overrides })
const model = (weeks: readonly WidgetWeek[], now: number, overrides: Partial<WidgetOutcome> = {}) => widgetModel(known, [outcome({ weeks, ...overrides })], now)

describe('stamp widget state and clock', () => {
  it('is expectant without a ritual', () => expect(widgetModelFromSnapshot(null, 0)).toMatchObject({ state: 'empty', face: 'expectant', line: 'Start a ritual?', streak: 0 }))
  it('rests before opening, opens inclusively, and closes only after deadline', () => {
    expect(model([week()], 999)).toMatchObject({ state: 'resting', face: 'resting', line: 'Week 1 opens in <1m' })
    expect(model([week()], 1000).state).toBe('open')
    expect(model([week()], 1300).state).toBe('alarmed')
    expect(model([week()], 1301)).toMatchObject({ state: 'closing', line: 'Week closed. Open Rituals.' })
  })
  it('pins proportional escalation at the exact demo thresholds', () => {
    expect(WIDGET_THRESHOLDS).toEqual({ concernedRemaining: 1 / 3, alarmedRemaining: 0.15, realWindowSeconds: 86400, daySeconds: 86400, hourSeconds: 3600 })
    expect(openWidgetState(week(), 1199)).toBe('open')
    expect(openWidgetState(week(), 1200)).toBe('concerned')
    expect(openWidgetState(week(), 1254)).toBe('concerned')
    expect(model([week()], 1255)).toMatchObject({ state: 'alarmed', face: 'alarmed', line: 'Nearly closed. Stamp it.' })
  })
  it('uses a day floor for real windows but never calls 15% of six days the last hour', () => {
    const day = week(0, 86400)
    expect(openWidgetState(day, 0)).toBe('concerned')
    const real = week(0, 518400)
    expect(model([real], real.deadline - 77760).line).toBe('Nearly closed. Stamp it.')
    expect(model([real], real.deadline - 3600).line).toBe('Last hour. Stamp it.')
    expect(model([real], real.deadline - 3601).line).toBe('Nearly closed. Stamp it.')
    expect(openWidgetState(week(0, 86399), 0)).toBe('open')
  })
  it('celebrates a confirmed stamp and rests in the gap before the next week', () => {
    const weeks = [week(100, 200, 'kept'), week(400, 500)]
    expect(model(weeks, 150)).toMatchObject({ state: 'stamped', face: 'joyful', streak: 1, ink: '#2F6B2A' })
    expect(model(weeks, 250)).toMatchObject({ state: 'resting', line: 'Week 2 opens in 3m', streak: 1 })
    expect(model(weeks, 400)).toMatchObject({ state: 'open', streak: 1 })
  })
  it('shows only confirmed misses, without truncating an amount or a cause', () => {
    const weeks = [week(100, 200, 'missed'), week(400, 500)]
    expect(model(weeks, 300)).toMatchObject({ state: 'missed', face: 'sad', line: '5 TEST went to your cause.', streak: 0, ink: '#8C8377' })
    expect(model(weeks, 300, { causeLabel: 'Northside' }).line).toBe('5 TEST went to Northside.')
    expect(model(weeks, 400).state).toBe('open')
    expect(model([week(100, 200)], 300).line).not.toContain('went')
  })
  it('gives a finished tally and content face only when most weeks were kept', () => {
    expect(model([week(100, 200, 'kept')], 300, { active: false })).toMatchObject({ state: 'finished', face: 'content', line: '1 of 1 kept' })
    expect(model([week(100, 200, 'missed')], 300, { active: false })).toMatchObject({ state: 'finished', face: 'neutral', line: '0 of 1 kept' })
  })
  it('advances through saved windows on the clock without inventing results', () => {
    const weeks = [week(100, 200), week(400, 500)]
    const snapshot = buildWidgetSnapshot(known, [outcome({ weeks })])!
    const before = JSON.stringify(snapshot)
    expect(widgetModelFromSnapshot(snapshot, 400).state).toBe('open')
    expect(widgetModelFromSnapshot(snapshot, 600).state).toBe('closing')
    expect(JSON.stringify(snapshot)).toBe(before)
  })
})

describe('consecutive kept-week streak', () => {
  it('counts a current stamp, ignores an open unstamped week and future weeks', () => {
    const weeks = [week(0, 100, 'kept'), week(200, 300, 'kept'), week(400, 500)]
    expect(widgetStreak(weeks, 250)).toBe(2)
    expect(widgetStreak(weeks, 450)).toBe(2)
    expect(widgetStreak([...weeks.slice(0, 2), week(400, 500, 'kept')], 450)).toBe(3)
  })
  it('resets on the latest miss and starts again after it (not a lifetime total)', () => {
    const weeks = [week(0, 100, 'kept'), week(200, 300, 'missed')]
    expect(widgetStreak(weeks, 350)).toBe(0)
    expect(widgetStreak([...weeks, week(400, 500, 'kept')], 450)).toBe(1)
  })
  it('never counts refunded skips, unread history, or unconfirmed expired weeks as kept', () => {
    for (const result of ['skipped', 'unknown', 'pending'] as const) {
      expect(widgetStreak([week(0, 100, 'kept'), week(200, 300, result)], 350)).toBe(0)
    }
    expect(widgetStreak([], 0)).toBe(0)
  })
})

describe('which ritual needs you', () => {
  it('prefers the nearest open unstamped deadline over the newest active', () => {
    const snapshot = buildWidgetSnapshot(known, [outcome(), outcome({ address: 'older', weeks: [week(1000, 1200)] })])
    expect(selectWidgetSnapshot(snapshot, 1100)?.address).toBe('older')
    expect(selectWidgetSnapshot(snapshot, 1201)?.address).toBe('newer')
  })
  it('excludes stamped weeks and uses newest order to break ties', () => {
    expect(widgetModel(known, [outcome(), outcome({ address: 'older' })], 1100).title).toBe('Train')
    expect(widgetModel(known, [outcome({ weeks: [week(1000, 1200, 'kept')] }), outcome({ address: 'older' })], 1100).title).toBe('Read')
  })
  it('falls back to newest active, then newest finished, ignoring unknown addresses', () => {
    const finished = outcome({ active: false, weeks: [week(1000, 1300, 'kept')] })
    expect(widgetModel(known, [finished, outcome({ address: 'older' })], 900).title).toBe('Read')
    expect(widgetModel(known, [finished, { ...finished, address: 'older' }, outcome({ address: 'unknown' })], 1400)).toMatchObject({ title: 'Train', tint: ritualTintAmong('newer', known) })
  })
})

describe('short, deterministic authored copy', () => {
  it('screens all states/variants for banned words and 30-character budget', () => {
    const banned = /\b(win|beat|versus|rival|pot|jackpot|payout|odds|luck|profit from|AI|SKR|mainnet|live)\b/i
    const states = new Set<string>()
    const lines = new Set<string>()
    for (let index = 0; index < 24; index++) {
      const candidates = [outcome({ address: `ritual-${index}` })]
      const keys = [{ address: candidates[0].address, title: 'Read' }]
      for (const [result, now, active] of [['pending', 900, true], ['pending', 1000, true], ['pending', 1200, true], ['pending', 1255, true], ['pending', 1301, true], ['kept', 1100, true], ['missed', 1301, true], ['kept', 1400, false]] as const) {
        candidates[0] = { ...candidates[0], weeks: [week(1000, 1300, result)], active }
        const value = widgetModel(keys, candidates, now)
        expect(widgetModel(keys, candidates, now)).toEqual(value)
        expect(value.line).not.toMatch(banned)
        expect(Array.from(value.line).length).toBeLessThanOrEqual(30)
        states.add(value.state); lines.add(value.line)
      }
    }
    expect(states.size).toBe(8)
    expect(lines).toContain('Your 5 TEST has opinions.')
    expect(lines).toContain('Future you is checking.')
    expect(model([week(100, 200, 'missed')], 300, { stakeLabel: '12345678901234567890 TEST' }).line).toBe('Stake went to your cause.')
    expect(model([week()], 1200, { stakeLabel: '12345678901234567890 TEST' }).line.length).toBeLessThanOrEqual(30)
    expect(widgetModelFromSnapshot(null, 0).line).not.toMatch(banned)
  })
})
