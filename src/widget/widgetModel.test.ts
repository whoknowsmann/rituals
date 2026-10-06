import { describe, expect, it } from 'vitest'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { tileStatus } from '../features/rituals/home/tileStatus'
import { weekOpensLabel } from '../features/rituals/displayFormat'
import { widgetModel, widgetModelFromSnapshot, selectWidgetSnapshot, widgetStates, type WidgetOutcome } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const outcome = (overrides: Partial<WidgetOutcome> = {}): WidgetOutcome => ({ address: 'newer', stakeLabel: '5 TEST / WK', cells: ['done', 'missed', 'now', 'future'], active: true, state: 'waiting', showedUp: false, terminalCurrent: false, opens: 1000, deadline: 1100, ...overrides })
const model = (overrides: Partial<WidgetOutcome> = {}, now = 910) => widgetModel(known, [outcome(overrides)], now)

describe('widgetModel (no native dependencies)', () => {
  it('offers the Home empty state with an action pill and no label/count/dots', () => {
    expect(widgetModel([], [], 0)).toEqual({ title: 'Start a ritual?', stakeLabel: '', cells: [], countLine: '', pill: { text: 'Open Rituals', act: true }, tint: ritualTintAmong('', [{ address: '' }]) })
  })
  it('uses remembered order, not bundle order, and matches Home colour/count', () => {
    expect(widgetModel(known, [outcome(), outcome({ address: 'older' })], 910)).toEqual({ title: 'Train', stakeLabel: '5 TEST / WK', cells: ['done', 'missed', 'now', 'future'], countLine: '1 of 4 kept', pill: tileStatus({ state: 'waiting', showedUp: false, nextOpensLabel: weekOpensLabel(1000, 910) }), tint: ritualTintAmong('newer', known) })
  })
  it('prefers an older active ritual over a newer finished one', () => {
    expect(widgetModel(known, [outcome({ active: false, state: 'completed' }), outcome({ address: 'older' })], 910).title).toBe('Read')
  })
  it('keeps the newest finished ritual when none is active; ignores unknown addresses', () => {
    expect(selectWidgetSnapshot(known, [outcome({ active: false, state: 'completed' }), outcome({ address: 'older', active: false, state: 'completed' }), outcome({ address: 'unknown' })])?.address).toBe('newer')
    expect(widgetModel(known, [], 0).title).toBe('Start a ritual?')
  })
  it('does not mistake a completed current event for an inactive ritual', () => {
    expect(selectWidgetSnapshot(known, [outcome({ state: 'completed', terminalCurrent: true }), outcome({ address: 'older' })])?.address).toBe('newer')
  })
  it.each(widgetStates)('passes %s through tileStatus unchanged at read time', (state) => {
    for (const showedUp of [false, true]) {
      expect(model({ state, showedUp }).pill).toEqual(tileStatus({ state, showedUp, nextOpensLabel: weekOpensLabel(1000, 910) }))
    }
  })
  it.each([
    ['waiting', 999, 'Opens in under a minute', false],
    ['waiting', 1000, 'Stamp this week', true],
    ['claimable', 1100, 'Stamp this week', true],
    ['claimable', 1101, 'Closing…', false],
    ['closing', 1000, 'Closing…', false],
    ['missed', 910, 'Missed last week', false],
    ['missed', 1000, 'Stamp this week', true],
    ['skipped', 910, 'Skipped last week', false],
    ['skipped', 1101, 'Closing…', false],
    ['awaiting-witness', 1101, 'Closing…', false],
    ['completed', 999999, 'Finished', false],
  ] as const)('%s at %i: %s', (state, now, text, act) => expect(model({ state }, now).pill).toEqual({ text, act }))
  it('retains a confirmed stamp after closing, but completed is always Finished', () => {
    expect(model({ state: 'claimable', showedUp: true }, 999999).pill).toEqual({ text: 'Stamped', act: false })
    expect(model({ state: 'completed', showedUp: true, active: false }, 999999).pill).toEqual({ text: 'Finished', act: false })
  })
  it.each(['missed', 'skipped', 'completed'] as const)('does not reopen a terminal current event (%s)', (state) => {
    expect(model({ state, terminalCurrent: true }, 1000).pill).toEqual(tileStatus({ state, showedUp: false, nextOpensLabel: null }))
  })
  it('uses the exact Home opening date, not a widget-specific weekday/countdown', () => {
    const opens = new Date(2026, 9, 6, 12).getTime() / 1000
    expect(model({ opens, deadline: opens + 518400 }, opens - 86400).pill.text).toBe(`Opens ${weekOpensLabel(opens, opens - 86400)}`)
  })
  it('headless projection preserves cells/counts and cannot infer a miss or new week', () => {
    const snapshot = selectWidgetSnapshot(known, [outcome()])!
    expect(widgetModelFromSnapshot(snapshot, 999999)).toMatchObject({ title: 'Train', tint: snapshot.tint, cells: snapshot.cells, countLine: '1 of 4 kept', pill: { text: 'Closing…', act: false } })
  })
})
