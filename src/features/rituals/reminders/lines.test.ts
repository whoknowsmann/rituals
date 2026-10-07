import { describe, expect, it } from 'vitest'
import { REMINDER_LINES, demoReminderLine, reminderLine, type ReminderKind } from './lines'

// All authored-copy restrictions in docs/submission/FACTS.md "Words".
// tSKR is allowed; arbitrary user-entered ritual titles are not authored copy.
const banned = /\b(win(?:s|ning)?|beat(?:s|ing)?|pot|jackpot|payout|odds|luck(?:y)?|versus|rival|opponent|AI|mainnet|SKR|live)\b|\bprofit\s+from\b/i

describe('reminder voice', () => {
  it('uses an absolute demo stamp deadline, not a claim that an inexact alert is still timely', () => {
    const deadline = Date.parse('2026-10-07T18:30:45Z') / 1000
    expect(demoReminderLine(2, deadline)).toMatch(/^Week 2: stamp by \d{1,2}:\d{2}:45 (AM|PM)\.$/)
    expect(demoReminderLine(2, deadline)).not.toMatch(/UTC|2026/)
    for (let week = 1; week <= 16; week += 1) {
      for (const at of [deadline, 0, 8_640_000_000_000]) {
        const line = demoReminderLine(week, at)
        expect(line).toBe(demoReminderLine(week, at))
        expect(line).not.toMatch(banned)
        expect(line).not.toContain('is open')
        expect(Array.from(line).length).toBeLessThanOrEqual(60)
      }
    }
  })
  for (const kind of Object.keys(REMINDER_LINES) as ReminderKind[]) {
    it(`${kind} has six to eight short, non-gambling lines`, () => {
      expect(REMINDER_LINES[kind].length).toBeGreaterThanOrEqual(6)
      expect(REMINDER_LINES[kind].length).toBeLessThanOrEqual(8)
      for (const line of REMINDER_LINES[kind]) {
        expect(line).not.toMatch(banned)
        expect(Array.from(line).length).toBeLessThanOrEqual(60)
      }
    })
    it(`${kind} stays deterministic across all weeks, including long labels`, () => {
      const choices = new Set<string>()
      for (let index = 0; index < 100; index += 1) {
        for (let week = 1; week <= 16; week += 1) {
          const args = [kind, `address-${index}`, week, '5 tSKR', 'the food bank'] as const
          const line = reminderLine(...args)
          expect(line).toBe(reminderLine(...args))
          expect(line).not.toMatch(banned)
          expect(line).not.toMatch(/[{}]/)
          expect(Array.from(line).length).toBeLessThanOrEqual(60)
          expect(Array.from(reminderLine(kind, args[1], week, '123456789'.repeat(8), 'A cause with a very long name'.repeat(8))).length).toBeLessThanOrEqual(60)
          if (week === 1) choices.add(line)
        }
      }
      expect(choices.size).toBe(REMINDER_LINES[kind].length)
    })
  }
})
