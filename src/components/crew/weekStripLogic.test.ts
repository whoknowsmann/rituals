import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isClosedWeekCell, weekCellLabel, weekSummary, weekSummaryShort } from './weekStripLogic'

describe('punch card (week strip)', () => {
  it('offers receipts for every closed outcome, never current or future weeks', () => {
    expect(['done', 'missed', 'closed', 'now', 'current', 'future'].map((cell) => isClosedWeekCell(cell as never))).toEqual([true, true, true, false, false, false])
    const kit = readFileSync(`${__dirname}/index.tsx`, 'utf8')
    expect(kit).toContain('onClosedWeekPress && isClosedWeekCell(cell)')
    expect(kit).toContain('onPress={() => onClosedWeekPress(i)}')
    const screen = readFileSync(`${__dirname}/../../screens/solo/SoloRitualScreen.tsx`, 'utf8')
    expect(screen).toContain("onClosedWeekPress={(eventIndex) => navigation.navigate('SoloReceipt', { ritualId: route.params.ritualId, eventIndex })}")
  })
  it('keeps an action button\'s supplied label while busy', () => {
    const kit = readFileSync(`${__dirname}/index.tsx`, 'utf8')
    expect(kit).not.toContain("loading ? '…' : label")
    expect(kit).toContain('busy: !!loading')
    expect(kit).toContain('if (off) return')
  })
  it('has a link tone for minor actions: quiet underlined text, same button role, busy label and 44 pt target', () => {
    const kit = readFileSync(`${__dirname}/index.tsx`, 'utf8')
    expect(kit).toContain("tone?: 'go' | 'dark' | 'quiet' | 'link'")
    expect(kit).toContain('link ? s.link : s.btn')
    expect(kit).toContain('link ? s.linkText : s.btnText')
    expect(kit.match(/linkText: \{[^}]*\}/)?.[0]).toContain("textDecorationLine: 'underline'")
    expect(kit.match(/ {2}link: \{[^}]*\}/)?.[0]).toContain('minHeight: 44')
  })
  it('labels cells so they read without a legend', () => {
    expect(['done', 'missed', 'closed', 'now', 'future'].map((cell, i) => weekCellLabel(cell as never, i))).toEqual(['✓', '✕', '·', 'NOW', '5'])
    expect(weekCellLabel('current', 0)).toBe('1')
  })

  it('summarises in one line', () => {
    expect(weekSummary(['done', 'missed', 'now', 'future'])).toBe('Week 3 of 4 · 1 kept · 1 missed')
    expect(weekSummary(['missed', 'missed', 'done', 'missed'])).toBe('All 4 weeks done · 1 kept · 3 missed')
    expect(weekSummary(['future', 'future'])).toBe('2 weeks')
    expect(weekSummary(['done', 'current', 'future'])).toBe('Week 2 of 3 · 1 kept')
  })

  it('has a short form that fits a small tile', () => {
    expect(weekSummaryShort(['done', 'missed', 'now', 'future'])).toBe('1 of 4 kept')
  })

  it('shows a stamped week as ✓ at once: still the current week, counted kept, no receipt until it closes', () => {
    expect(weekCellLabel('stamped', 0)).toBe('✓')
    expect(isClosedWeekCell('stamped')).toBe(false)
    expect(weekSummary(['stamped', 'future'])).toBe('Week 1 of 2 · 1 kept')
    expect(weekSummary(['done', 'missed', 'stamped'])).toBe('Week 3 of 3 · 2 kept · 1 missed')
    expect(weekSummaryShort(['done', 'stamped', 'future'])).toBe('2 of 3 kept')
    const kit = readFileSync(`${__dirname}/index.tsx`, 'utf8')
    expect(kit).toContain('const kept = isKeptWeekCell(cell)')
    expect(kit).toContain('kept && s.cellDone')
  })
})
