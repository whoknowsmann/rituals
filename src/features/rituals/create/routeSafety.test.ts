import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RITUAL_DRAFT,
  RITUAL_FEE_CONFIG,
  clearFieldError,
  limitCodePoints,
  parseRitualDraft,
  validateRitualDraft,
} from './draftForm'
import { draftEconomics } from './draftForm'
import { buildReviewViewModel } from './reviewViewModel'

describe('Ritual draft boundaries', () => {
  it('parses only exact data-property drafts', () => {
    expect(parseRitualDraft(DEFAULT_RITUAL_DRAFT)).toEqual({ ok: true, value: DEFAULT_RITUAL_DRAFT })
    for (const value of [null, undefined, {},
      { ...DEFAULT_RITUAL_DRAFT, title: 42 },
      { ...DEFAULT_RITUAL_DRAFT, memberCount: 2 },
      { ...DEFAULT_RITUAL_DRAFT, extra: 'nope' },
      { ...DEFAULT_RITUAL_DRAFT, confirmationMode: 'BOGUS' },
      Object.create({ ...DEFAULT_RITUAL_DRAFT })]) {
      expect(parseRitualDraft(value)).toEqual({ ok: false, error: 'Invalid ritual draft.' })
      expect(validateRitualDraft(value)).toEqual({ ok: false, errors: { form: 'Invalid ritual link.' } })
      expect(buildReviewViewModel(value)).toBeNull()
    }
  })

  it('fails closed for throwing accessors and proxies', () => {
    const accessor = { ...DEFAULT_RITUAL_DRAFT }
    Object.defineProperty(accessor, 'title', { get: () => { throw new Error('boom') } })
    expect(() => parseRitualDraft(accessor)).not.toThrow()
    expect(parseRitualDraft(accessor).ok).toBe(false)
    const proxy = new Proxy(DEFAULT_RITUAL_DRAFT, { ownKeys: () => { throw new Error('boom') } })
    expect(() => parseRitualDraft(proxy)).not.toThrow()
    expect(parseRitualDraft(proxy).ok).toBe(false)
  })

  it('shares one frozen fee configuration everywhere', () => {
    expect(Object.isFrozen(RITUAL_FEE_CONFIG)).toBe(true)
    const validation = validateRitualDraft(DEFAULT_RITUAL_DRAFT)
    if (!validation.ok) throw new Error('default draft should be valid')
    expect(draftEconomics(validation.value).fee)
      .toBe(800_000n)
  })

  it('limits Unicode by code point and clears only the edited error', () => {
    expect(limitCodePoints('😀'.repeat(80), 80)).toBe('😀'.repeat(80))
    expect(limitCodePoints('😀'.repeat(81), 80)).toBe('😀'.repeat(80))
    expect(limitCodePoints('a'.repeat(281), 280)).toHaveLength(280)
    expect(clearFieldError({ title: 'bad', requirement: 'keep' }, 'title')).toEqual({ requirement: 'keep' })
  })
})
