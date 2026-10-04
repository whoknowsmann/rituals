import { describe, expect, it } from 'vitest'
import { weekCellLabel, weekSummary } from './weekStripLogic'

describe('punch card (week strip)', () => {
  it('labels cells so they read without a legend', () => {
    expect(['done', 'missed', 'closed', 'now', 'future'].map((cell, i) => weekCellLabel(cell as never, i))).toEqual(['✓', '✕', '·', 'NOW', '5'])
  })

  it('summarises in one line', () => {
    expect(weekSummary(['done', 'missed', 'now', 'future'])).toBe('Week 3 of 4 · 1 kept · 1 missed')
    expect(weekSummary(['missed', 'missed', 'done', 'missed'])).toBe('All 4 weeks done · 1 kept · 3 missed')
    expect(weekSummary(['future', 'future'])).toBe('2 weeks')
  })
})
