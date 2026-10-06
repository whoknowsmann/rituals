import { describe, expect, it } from 'vitest'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { color } from '../theme/tokens'
import { buildWidgetSnapshot, openWidgetState, selectWidgetSnapshot, widgetModel, widgetModelFromSnapshot, widgetStreak, widgetTimeLeft, widgetOpening, WIDGET_THRESHOLDS, type WeekOutcome, type WidgetOutcome, type WidgetWeek } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const week = (opens = 1000, deadline = 1300, outcome: WeekOutcome = 'pending'): WidgetWeek => ({ opens, deadline, outcome })
const outcome = (overrides: Partial<WidgetOutcome> = {}): WidgetOutcome => ({ address: 'newer', stakeLabel: '5 tSKR', causeLabel: 'Northside Food Bank (demo)', active: true, weeks: [week()], ...overrides })
const model = (weeks: readonly WidgetWeek[], now: number, overrides: Partial<WidgetOutcome> = {}) => widgetModel(known, [outcome({ weeks, ...overrides })], now)
const terms = '5 tSKR / week'
const atStake = '5 tSKR on the line'

// Construct LOCAL dates so these assertions work in both developer and CI timezones.
const tue = new Date(2026, 9, 6, 9, 0, 0).getTime() / 1000

describe('stamp widget state and clock', () => {
  it('is expectant without a ritual', () => expect(widgetModelFromSnapshot(null, 0)).toMatchObject({ state: 'empty', face: 'expectant', line: 'Start a ritual', streak: 0, dots: [] }))
  it('rests before opening, opens inclusively, and closes only after deadline', () => {
    expect(model([week()], 999)).toMatchObject({ state: 'resting', face: 'resting', line: `${widgetOpening(1, 1000, true)}\n${terms}` })
    expect(model([week()], 1000).state).toBe('open')
    expect(model([week()], 1300).state).toBe('alarmed')
    expect(model([week()], 1301)).toMatchObject({ state: 'closing', line: `Week 1 closed · open app\n${terms}` })
  })
  it('pins proportional escalation at the exact demo thresholds', () => {
    expect(WIDGET_THRESHOLDS).toEqual({ concernedRemaining: 1 / 3, alarmedRemaining: 0.15, realWindowSeconds: 86400, daySeconds: 86400, hourSeconds: 3600 })
    expect(openWidgetState(week(), 1199)).toBe('open')
    expect(openWidgetState(week(), 1200)).toBe('concerned')
    expect(openWidgetState(week(), 1254)).toBe('concerned')
    expect(model([week()], 1255)).toMatchObject({ state: 'alarmed', face: 'alarmed', line: `Stamp week 1 · now\n${atStake}` })
  })
  it('uses a day floor for real windows but never calls 15% of six days the last hour', () => {
    expect(openWidgetState(week(0, 86400), 0)).toBe('concerned')
    const real = week(0, 518400)
    expect(model([real], real.deadline - 77760)).toMatchObject({ state: 'alarmed', line: `Stamp week 1 · 21h left\n${atStake}` })
    expect(model([real], real.deadline - 3600).line).toBe(`Stamp week 1 · last hour\n${atStake}`)
    expect(model([real], real.deadline - 3601).line).toBe(`Stamp week 1 · 1h left\n${atStake}`)
    expect(openWidgetState(week(0, 86399), 0)).toBe('open')
  })
  it('celebrates a confirmed stamp, includes next opening and rests in the gap', () => {
    const weeks = [week(tue - 400, tue - 200, 'kept'), week(tue, tue + 300)]
    expect(model(weeks, tue - 300)).toMatchObject({ state: 'stamped', face: 'joyful', streak: 1, ink: '#2F6B2A', line: `Week 1 stamped\nWeek 2 opens Tue\n${terms}` })
    expect(model(weeks, tue - 100)).toMatchObject({ state: 'resting', line: `Week 2 opens Tue 9:00\n${terms}`, streak: 1 })
    expect(model(weeks, tue)).toMatchObject({ state: 'open', streak: 1 })
  })
  it('does not invent a next opening after the final stamp', () => {
    expect(model([week(100, 200, 'kept')], 300).line).toBe(`Week 1 stamped\n${terms}`)
    expect(model([week(100, 200, 'skipped')], 300).line).toBe(`Open app for your ritual\n${terms}`)
  })
  it('shows only confirmed misses, without truncating an amount or a cause', () => {
    const weeks = [week(100, 200, 'missed'), week(400, 500)]
    expect(model(weeks, 300)).toMatchObject({ state: 'missed', face: 'sad', line: 'Missed week 1\n5 tSKR to your cause', streak: 0, ink: '#8C8377' })
    expect(model(weeks, 300, { causeLabel: 'Northside' }).line).toBe('Missed week 1\n5 tSKR to Northside')
    expect(model(weeks, 400).state).toBe('open')
    expect(model([week(100, 200)], 300).line).not.toMatch(/missed|to your cause/i)
  })
  it.each([0, 1, 3, 4, 6])('gives %i of 6 finished count, not the trailing streak; content only for a majority', (kept) => {
    const weeks = Array.from({ length: 6 }, (_, index) => week(index * 200, index * 200 + 100, index < kept ? 'kept' : 'missed'))
    const value = model(weeks, 1300, { active: false })
    expect(value).toMatchObject({ state: 'finished', face: kept > 3 ? 'content' : 'neutral', line: `Done · ${kept} of 6 kept\n${terms}`, ink: kept > 3 ? color.stampInk : color.fg, seal: color.card, tint: ritualTintAmong('newer', known) })
    expect(value.streak).toBe(kept === 6 ? 6 : 0)
    expect(model(weeks, 5000, { active: false }).line).toEqual(value.line)
  })
  it('counts only kept outcomes in completion, not skips or unread history', () => {
    const weeks = (['kept', 'skipped', 'unknown', 'missed', 'missed', 'missed'] as const).map((result, index) => week(index * 200, index * 200 + 100, result))
    expect(model(weeks, 1300, { active: false }).line).toBe(`Done · 1 of 6 kept\n${terms}`)
  })
  it('reserves grey ink for confirmed misses across every active state', () => {
    const history = [week(0, 100, 'kept'), week(200, 300, 'kept')]
    for (const result of ['pending', 'kept', 'missed', 'skipped', 'unknown'] as const) {
      for (const now of [350, 400, 600, 655, 701]) {
        const value = model([...history, week(400, 700, result)], now)
        expect(value.ink === color.stampQuiet).toBe(value.state === 'missed')
      }
    }
  })
  it('advances through saved windows on the clock without inventing results', () => {
    const snapshot = buildWidgetSnapshot(known, [outcome({ weeks: [week(100, 200), week(400, 500)] })])!
    const before = JSON.stringify(snapshot)
    expect(widgetModelFromSnapshot(snapshot, 400)).toMatchObject({ state: 'open', dots: ['unknown', 'current'], line: `Stamp week 2 · now\n${atStake}` })
    expect(widgetModelFromSnapshot(snapshot, 600)).toMatchObject({ state: 'closing', dots: ['unknown', 'unknown'] })
    expect(JSON.stringify(snapshot)).toBe(before)
  })
})

describe('chain-window clarity copy', () => {
  it.each([
    [518400, '6 days left'], [432000, '5 days left'], [86401, '1 day left'],
    [86400, '1 day left'], [86399, '23h left'], [10800, '3h left'],
    [3601, '1h left'], [3600, 'last hour'], [1, 'last hour'], [0, 'last hour'],
  ])('formats %i real seconds remaining as %s', (remaining, label) => {
    expect(widgetTimeLeft(week(0, 518400), 518400 - remaining)).toBe(label)
  })
  it.each([1000, 1199, 1200, 1255, 1300])('uses now at demo time %i, never a pretend countdown', (now) => {
    expect(model([week()], now).line).toBe(`Stamp week 1 · now\n${atStake}`)
  })
  it('answers action, week, deadline and stake in real open/concerned states', () => {
    const weeks = [week(0, 100, 'kept'), week(200, 518600)]
    expect(model(weeks, 86600)).toMatchObject({ state: 'open', line: `Stamp week 2 · 5 days left\n${atStake}` })
    expect(model(weeks, 432200)).toMatchObject({ state: 'concerned', line: `Stamp week 2 · 1 day left\n${atStake}` })
  })
  it('uses local weekday and padded 24-hour time, not seconds or a relative minute timer', () => {
    expect(widgetOpening(3, tue)).toBe('Week 3 opens Tue')
    expect(widgetOpening(3, tue + 300, true)).toBe('Week 3 opens Tue 9:05')
    const midnight = new Date(2026, 9, 7, 0, 0).getTime() / 1000
    expect(widgetOpening(16, midnight, true)).toBe('Week 16 opens Wed 0:00')
  })
  it('keeps exact decimal stakes and never rounds pathological amounts', () => {
    expect(model([week()], 1100, { stakeLabel: '2.123456 tSKR' }).line).toContain('2.123456 tSKR on the line')
    const stakeLabel = '12345678901234567890 tSKR'
    expect(model([week()], 1200, { stakeLabel }).line).toBe('Stamp week 1 · now\nYour stake on the line')
    expect(model([week(100, 200, 'missed')], 300, { stakeLabel }).line).toBe('Missed week 1\nStake to your cause')
  })
})

describe('punch-card outcomes', () => {
  it('maps every outcome without counting skips or unread history as kept/missed', () => {
    const results = ['kept', 'missed', 'skipped', 'unknown', 'pending', 'pending', 'pending'] as const
    const weeks = results.map((result, index) => week(index * 200, index * 200 + 100, result))
    expect(model(weeks, 1050).dots).toEqual(['kept', 'missed', 'skipped', 'unknown', 'unknown', 'current', 'upcoming'])
    expect(model(weeks, 1101).dots).toEqual(['kept', 'missed', 'skipped', 'unknown', 'unknown', 'unknown', 'upcoming'])
  })
  it.each([1, 6, 8, 9, 16])('keeps one dot per week for a %i-week ritual', (count) => {
    const weeks = Array.from({ length: count }, (_, i) => week(i * 200, i * 200 + 100))
    expect(model(weeks, 0).dots).toEqual(['current', ...Array(count - 1).fill('upcoming')])
  })
})

describe('consecutive kept-week streak (retained model semantics)', () => {
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
  it('screens every state for banned words and a three-line/30-character-per-line budget', () => {
    const banned = /\b(win|beat|versus|rival|pot|jackpot|payout|odds|luck|profit from|AI|SKR|mainnet|live)\b/i
    const states = new Set<string>(['empty'])
    for (let index = 0; index < 24; index++) {
      const candidates = [outcome({ address: `ritual-${index}` })]
      const keys = [{ address: candidates[0].address, title: 'Read' }]
      for (const [result, now, active] of [['pending', 900, true], ['pending', 1000, true], ['pending', 1200, true], ['pending', 1255, true], ['pending', 1301, true], ['kept', 1100, true], ['missed', 1301, true], ['kept', 1400, false], ['missed', 1400, false]] as const) {
        candidates[0] = { ...candidates[0], weeks: [week(1000, 1300, result)], active }
        const value = widgetModel(keys, candidates, now)
        expect(widgetModel(keys, candidates, now)).toEqual(value)
        expect(value.line).not.toMatch(banned)
        expect(value.line.split('\n').length).toBeLessThanOrEqual(3)
        for (const line of value.line.split('\n')) expect(Array.from(line).length).toBeLessThanOrEqual(30)
        states.add(value.state)
      }
    }
    expect(states.size).toBe(9)
    expect(widgetModelFromSnapshot(null, 0).line).not.toMatch(banned)
  })
})
