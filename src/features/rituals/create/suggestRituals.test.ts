import { describe, expect, it } from 'vitest'
import {
  suggestRituals,
  SUGGESTION_INTENTS,
  parseIntent,
  titleFromIntention,
  type RitualSuggestion,
} from './suggestRituals'
import { validateRitualDraft } from './draftForm'

describe('titleFromIntention', () => {
  it('turns what the user typed into a title in their own words', () => {
    expect(titleFromIntention('call my mom')).toBe('Call Mom')
    expect(titleFromIntention('run with my brother')).toBe('Run with my brother')
    expect(titleFromIntention('finally finish this book')).toBe('Finish the book')
    expect(titleFromIntention('I want to practice guitar every week')).toBe('Practice guitar')
    expect(titleFromIntention('  learn Spanish!!  ')).toBe('Learn Spanish')
  })

  it('keeps a lone trailing "more" rather than leaving a one-word stub', () => {
    expect(titleFromIntention('read more')).toBe('Read more')
    expect(titleFromIntention('call my dad more often')).toBe('Call Dad')
  })

  it('returns null when there is nothing usable', () => {
    expect(titleFromIntention('')).toBeNull()
    expect(titleFromIntention('   ?!  ')).toBeNull()
    // @ts-expect-error deliberate hostile input
    expect(titleFromIntention(null)).toBeNull()
  })

  it('caps long input on a word boundary so the title stays a title', () => {
    const title = titleFromIntention('walk the dog around the whole neighbourhood every single morning before work')
    expect(title).not.toBeNull()
    expect(title!.length).toBeLessThanOrEqual(40)
    expect(title!.endsWith(' ')).toBe(false)
  })
})

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
    expect(parseIntent('visit my grandma every sunday')).toBe('family')
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

  it('uses the user\'s own words as the title, not a canned one', () => {
    for (const s of suggestRituals('call my mom')) expect(s.draft.title).toBe('Call Mom')
    for (const s of suggestRituals('visit grandma')) expect(s.draft.title).toBe('Visit grandma')
  })

  it('gives different inputs in the same category different results', () => {
    expect(suggestRituals('call my mom')[0].draft.title).not.toBe(suggestRituals('sunday dinner with the kids')[0].draft.title)
  })

  it('offers genuinely different shapes, each labelled', () => {
    const suggestions = suggestRituals('run with my brother')
    const shapes = suggestions.map((s) => `${s.draft.confirmationMode}/${s.draft.eventCount}`)
    expect(new Set(shapes).size).toBe(suggestions.length)
    for (const s of suggestions) expect(s.shape.length).toBeGreaterThan(0)
  })

  it('leads with the lighter-touch honor shape for family rituals', () => {
    expect(suggestRituals('call my mom')[0].draft.confirmationMode).toBe('HONOR')
    expect(suggestRituals('run with my brother')[0].draft.confirmationMode).toBe('ONE_FRIEND')
  })

  it('returns suggestions whose drafts all pass real validation', () => {
    for (const text of ['run with friends', 'read a book', 'call family', '', 'qqqq', 'x'.repeat(200)]) {
      expect(allValid(suggestRituals(text))).toBe(true)
    }
  })

  it('tailors the first suggestion to the detected intent', () => {
    const [first] = suggestRituals('I want to go running')
    expect(first.draft.title.toLowerCase() + first.draft.requirement.toLowerCase()).toMatch(/run|move|walk/)
  })

  it('returns distinct suggestions', () => {
    const shapes = suggestRituals('read more').map((s) => s.shape)
    expect(new Set(shapes).size).toBe(shapes.length)
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
