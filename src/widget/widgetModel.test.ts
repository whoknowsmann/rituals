import { describe, expect, it } from 'vitest'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { widgetModel, widgetModelFromSnapshot, selectWidgetSnapshot, type WidgetOutcome, type WidgetStatus } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const outcome = (overrides: Partial<WidgetOutcome> = {}): WidgetOutcome => ({ address: 'newer', weekIndex: 3, weekCount: 8, kept: 3, missed: 1, status: 'waiting', opens: 1000, deadline: 1100, ...overrides })
const line = (status: WidgetStatus, now = 910) => widgetModel(known, [outcome({ status })], now).statusLine

describe('widgetModel (no native dependencies)', () => {
  it('offers one quiet empty state', () => {
    expect(widgetModel([], [], 0)).toEqual({ title: 'Start a ritual?', weekLine: '', countLine: '', statusLine: '', tint: ritualTintAmong('', [{ address: '' }]) })
  })
  it('uses remembered order, not bundle order, and matches Home colour', () => {
    expect(widgetModel(known, [outcome(), outcome({ address: 'older' })], 910)).toEqual({ title: 'Train', weekLine: 'Week 4 of 8', countLine: '3 kept · 1 missed', statusLine: 'Opens in 1:30', tint: ritualTintAmong('newer', known) })
  })
  it('prefers an older active ritual over a newer finished one', () => {
    expect(widgetModel(known, [outcome({ status: 'finished-stamped' }), outcome({ address: 'older' })], 910).title).toBe('Read')
  })
  it('keeps the latest result when all rituals have finished; ignores unknown addresses', () => {
    expect(selectWidgetSnapshot(known, [outcome({ status: 'finished-missed' }), outcome({ address: 'unknown' })])?.address).toBe('newer')
    expect(widgetModel(known, [], 0).title).toBe('Start a ritual?')
  })
  it.each([
    ['waiting', 910, 'Opens in 1:30'],
    ['waiting', 999, 'Opens in 0:01'],
    ['waiting', 1000, 'Stamp this week'],
    ['open', 1100, 'Stamp this week'],
    ['open', 1101, 'Closing…'],
    ['closing', 1000, 'Closing…'],
    ['stamped', 1000, 'Stamped'],
    ['stamped', 999999, 'Stamped'],
    ['finished-stamped', 910, 'Stamped'],
    ['missed', 910, "That's a week, not a verdict."],
    ['missed', 1000, 'Stamp this week'],
    ['missed', 1101, 'Closing…'],
    ['finished-missed', 999999, "That's a week, not a verdict."],
    ['missed-current', 1000, "That's a week, not a verdict."],
    ['skipped-current', 1000, 'Skipped last week'],
    ['skipped', 910, 'Skipped last week'],
    ['skipped', 1000, 'Stamp this week'],
    ['finished-skipped', 999999, 'Skipped last week'],
    ['awaiting-witness', 1000, 'Waiting on witness'],
  ] as const)('%s at %i: %s', (status, now, expected) => expect(line(status, now)).toBe(expected))
  it('uses the local weekday for a real-week wait', () => {
    const opens = new Date(2026, 9, 6, 12).getTime() / 1000
    expect(widgetModel(known, [outcome({ opens, deadline: opens + 518400 })], opens - 86400).statusLine).toBe('Opens Tue')
  })
  it('caps a finished week at M, never M+1', () => {
    expect(widgetModel(known, [outcome({ weekIndex: 8, status: 'finished-stamped' })], 0).weekLine).toBe('Week 8 of 8')
  })
  it('headless projection preserves the saved title and tint, never recalculates history', () => {
    const snapshot = selectWidgetSnapshot(known, [outcome()])!
    expect(widgetModelFromSnapshot(snapshot, 1101)).toMatchObject({ title: 'Train', tint: snapshot.tint, countLine: '3 kept · 1 missed', statusLine: 'Closing…' })
  })
})
