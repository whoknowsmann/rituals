import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'RitualFundingLobbyScreen.tsx'), 'utf8')

describe('RitualFundingLobbyScreen wiring', () => {
  it('B1: places week 1 with firstEventStart, not the next-weekday rule', () => {
    expect(source).toContain('firstEventStart(')
    expect(source).not.toContain('nextWeekdayOccurrence(')
  })
})
