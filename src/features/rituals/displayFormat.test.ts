import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatAtomic, weekOpensLabel, weekIsOpen } from './displayFormat'

describe('formatAtomic (people read amounts, not 6-decimal fixed point)', () => {
  it('drops trailing zeros but never rounds', () => {
    expect(formatAtomic(8_000_000n, 6)).toBe('8 TEST')
    expect(formatAtomic(2_500_000n, 6)).toBe('2.5 TEST')
    expect(formatAtomic(1n, 6)).toBe('0.000001 TEST')
    expect(formatAtomic(0n, 6)).toBe('0 TEST')
    expect(formatAtomic(12_340_000n, 6, 'SKR')).toBe('12.34 SKR')
    expect(formatAtomic(7n, 0)).toBe('7 TEST')
  })
})

describe('weekOpensLabel', () => {
  // Sat 2026-10-03 14:45 local (use a fixed offset-free Date built from parts)
  const at = (d: Date) => Math.floor(d.getTime() / 1000)
  const now = at(new Date(2026, 9, 3, 14, 0, 0))
  it('is relative when it opens within the hour (demo speed)', () => {
    expect(weekOpensLabel(now + 120, now)).toBe('in 2 min')
    expect(weekOpensLabel(now + 30, now)).toBe('in under a minute')
  })
  it('is a short weekday/date/time otherwise, no seconds', () => {
    expect(weekOpensLabel(at(new Date(2026, 9, 3, 14, 45, 16)) + 3600, now)).toBe('Sat, Oct 3 · 3:45 PM')
    expect(weekOpensLabel(at(new Date(2026, 9, 5, 9, 5, 0)), now)).toBe('Mon, Oct 5 · 9:05 AM')
  })
  it('says "now" once open', () => {
    expect(weekOpensLabel(now - 5, now)).toBe('now')
    expect(weekIsOpen(now - 5, now)).toBe(true)
    expect(weekIsOpen(now + 5, now)).toBe(false)
  })
})

describe('detail screen does not offer "Open this week" before the week opens', () => {
  const source = readFileSync(resolve(__dirname, '../../screens/RitualDetailScreen.tsx'), 'utf8')
  it('gates the open button on weekIsOpen and shows when it opens instead', () => {
    expect(source).toContain('weekIsOpen(')
    expect(source).toContain('weekOpensLabel(')
    expect(source).not.toContain('nextEventLabel(')
  })
})
