import { describe, expect, it } from 'vitest'
import {
  suggestRituals,
  SUGGESTION_INTENTS,
  parseIntent,
  type RitualSuggestion,
} from './suggestRituals'
import { validateRitualDraft } from './draftForm'

describe('parseIntent', () => {
  it('recognises movement language', () => {
    expect(parseIntent('I want to run with my brother')).toBe('movement')
    expect(parseIntent('gym three times a week')).toBe('movement')
  })

  it('recognises reading language', () => {
    expect(parseIntent('finally finish this book')).toBe('reading')
  })

  it('recognises family language', () => {
    expect(parseIntent('call my mom more often')).toBe('family')
  })

  it('recognises creative language', () => {
    expect(parseIntent('practice guitar every week')).toBe('music')
  })

  it('falls back to a general intent for unrecognised text', () => {
    expect(SUGGESTION_INTENTS).toContain(parseIntent('zzzzz qqqq'))
  })

  it('is case and punctuation insensitive', () => {
    expect(parseIntent('RUN!!!')).toBe(parseIntent('run'))
  })

  it('handles empty input without throwing', () => {
    expect(SUGGESTION_INTENTS).toContain(parseIntent(''))
  })

  it('handles hostile input without throwing', () => {
    // @ts-expect-error deliberate hostile input
    expect(SUGGESTION_INTENTS).toContain(parseIntent(null))
    // @ts-expect-error deliberate hostile input
    expect(SUGGESTION_INTENTS).toContain(parseIntent({ toString() { throw new Error('boom') } }))
  })
})

describe('suggestRituals', () => {
  const allValid = (suggestions: readonly RitualSuggestion[]) =>
    suggestions.every((s) => validateRitualDraft(s.draft).ok)

  it('always returns at least one suggestion', () => {
    expect(suggestRituals('').length).toBeGreaterThan(0)
  })

  it('returns suggestions whose drafts all pass real validation', () => {
    for (const text of ['run with friends', 'read a book', 'call family', '', 'qqqq']) {
      expect(allValid(suggestRituals(text))).toBe(true)
    }
  })

  it('tailors the first suggestion to the detected intent', () => {
    const [first] = suggestRituals('I want to go running')
    expect(first.draft.title.toLowerCase() + first.draft.requirement.toLowerCase()).toMatch(/run|move|walk/)
  })

  it('returns distinct suggestions', () => {
    const titles = suggestRituals('read more').map((s) => s.draft.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('caps the number of suggestions so the UI stays scannable', () => {
    expect(suggestRituals('anything').length).toBeLessThanOrEqual(3)
  })

  it('never suggests a stake a user did not ask for beyond the safe default', () => {
    for (const suggestion of suggestRituals('run')) {
      const parsed = validateRitualDraft(suggestion.draft)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) throw new Error('unreachable')
      // Suggestions must stay within the modest default range; they must never
      // nudge someone toward a large stake.
      expect(parsed.value.memberTotalStakeAtomic).toBeLessThanOrEqual(50_000_000n)
    }
  })

  it('always includes a rationale the user can read', () => {
    for (const suggestion of suggestRituals('study')) {
      expect(suggestion.rationale.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic for the same input', () => {
    expect(suggestRituals('read a book')).toEqual(suggestRituals('read a book'))
  })

  it('returns frozen suggestions', () => {
    const [first] = suggestRituals('run')
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('keeps honor-mode stakes symbolic', () => {
    // The protocol requires a positive stake, so honour mode cannot be free.
    // It should still carry the smallest viable amount, since money plus no
    // verification is the combination most likely to strain a friendship.
    for (const text of ['run', 'read', 'family', 'study', 'cook', '']) {
      for (const suggestion of suggestRituals(text)) {
        if (suggestion.draft.confirmationMode === 'HONOR') {
          const perEvent = Number(suggestion.draft.memberTotalStake) / Number(suggestion.draft.eventCount)
          expect(perEvent).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('always produces a stake that divides evenly across events', () => {
    for (const text of ['run', 'read', 'family', 'study', 'cook', '']) {
      for (const suggestion of suggestRituals(text)) {
        const total = Number(suggestion.draft.memberTotalStake)
        const events = Number(suggestion.draft.eventCount)
        expect(total % events).toBe(0)
        expect(total).toBeGreaterThan(0)
      }
    }
  })
})
