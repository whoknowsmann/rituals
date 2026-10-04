import { describe, expect, it } from 'vitest'
import { cleanRitualTitle } from './ritualTitle'

describe('cleanRitualTitle', () => {
  it.each([
    ['to read', 'Read'],
    ["I'll call mom.", 'Call mom'],
    ['I’ll stretch', 'Stretch'],
    ['I want to run 3x a week!', 'Run 3x a week'],
    ["I'm going to journal", 'Journal'],
    ['gym', 'Gym'],
    ['Tofu Tuesday', 'Tofu Tuesday'],
    ['  call   mom  ', 'Call mom'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(cleanRitualTitle(input)).toBe(expected)
  })
})
