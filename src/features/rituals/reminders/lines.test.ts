import { describe, expect, it } from 'vitest'
import { REMINDER_LINES, reminderLine, type ReminderKind } from './lines'

const banned = /\b(win(?:s|ning)?|beat(?:s|ing)?|pot|jackpot|payout|odds|luck(?:y)?|versus|rival|opponent)\b/i

describe('reminder voice', () => {
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
          const args = [kind, `address-${index}`, week, '5 TEST', 'the food bank'] as const
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
