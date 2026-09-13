import { describe, expect, it } from 'vitest'
import { RITUAL_TEMPLATES, draftFromTemplate, templateSelectionTarget } from './templates'
import { parseTokenAmount } from './decimal'
import { DEFAULT_RITUAL_DRAFT, validateRitualDraft, type RitualDraft } from './draftForm'
import { buildReviewViewModel } from './reviewViewModel'
import { homeCreateTarget, reviewNavigationParams } from './routeHelpers'
import type { RootStackParamList } from '../../../navigators/AppNavigator'
import { readFileSync } from 'node:fs'

const validDraft: RitualDraft = { ...DEFAULT_RITUAL_DRAFT, title: 'Read together', requirement: 'Read ten pages', memberCount: '2', eventCount: '4', memberTotalStake: '20' }

describe('Ritual creation journey', () => {
  it('has exactly the six broad deeply immutable templates', () => {
    expect(RITUAL_TEMPLATES.map((t) => t.category)).toEqual(['reading', 'study', 'music', 'family', 'cooking', 'movement'])
    expect(Object.isFrozen(RITUAL_TEMPLATES)).toBe(true)
    for (const template of RITUAL_TEMPLATES) expect(Object.isFrozen(template)).toBe(true)
    expect(() => (RITUAL_TEMPLATES as unknown as { push: () => void }).push()).toThrow()
  })

  it('detaches template drafts and exposes route targets', () => {
    const first = draftFromTemplate(RITUAL_TEMPLATES[0]); first.title = 'Edited'
    const second = draftFromTemplate(RITUAL_TEMPLATES[0])
    expect(templateSelectionTarget('reading')).toEqual({ name: 'CreateRitual', params: { templateCategory: 'reading' } })
    expect(homeCreateTarget()).toEqual({ name: 'TemplatePicker' })
    expect(first.title).toBe('Edited'); expect(second.title).toBe(RITUAL_TEMPLATES[0].title)
  })

  it('parses decimal TEST amounts without floating point', () => {
    expect(parseTokenAmount('20')).toBe(20_000_000n); expect(parseTokenAmount('0.000001')).toBe(1n)
    expect(parseTokenAmount('18446744073709.551615')).toBe(18_446_744_073_709_551_615n)
    for (const value of ['-1', '1e2', '1.0000001', '1.2.3', '', ' 1', '18446744073709.551616']) expect(() => parseTokenAmount(value)).toThrow()
  })

  it('validates Unicode and numeric boundaries without throwing', () => {
    for (const title of ['😀'.repeat(80), 'a'.repeat(80)]) expect(validateRitualDraft({ ...validDraft, title }).ok).toBe(true)
    expect(validateRitualDraft({ ...validDraft, title: '😀'.repeat(81) }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, requirement: 'a'.repeat(280) }).ok).toBe(true)
    expect(validateRitualDraft({ ...validDraft, requirement: 'a'.repeat(281) }).ok).toBe(false)
    for (const value of ['2', '6']) expect(validateRitualDraft({ ...validDraft, memberCount: value }).ok).toBe(true)
    for (const value of ['1', '7', '2.5', '-2', '+2', ' 2', '2 ']) expect(validateRitualDraft({ ...validDraft, memberCount: value }).ok).toBe(false)
    for (const value of ['1', '16']) expect(validateRitualDraft({ ...validDraft, eventCount: value }).ok).toBe(true)
    for (const value of ['0', '17', '1.5', '-1', '+1', ' 1', '1 ']) expect(validateRitualDraft({ ...validDraft, eventCount: value }).ok).toBe(false)
  })

  it('validates stake, divisibility, and group overflow as safe field errors', () => {
    for (const value of ['0', '-1', '1e2', '1.0000001', '1.2.3', '', ' 1', '18446744073709.551616']) expect(validateRitualDraft({ ...validDraft, memberTotalStake: value }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, memberTotalStake: '0.000001', eventCount: '1' }).ok).toBe(true)
    expect(validateRitualDraft({ ...validDraft, memberTotalStake: '20.000001', eventCount: '4' }).ok).toBe(false)
    const overflow = validateRitualDraft({ ...validDraft, memberTotalStake: '9223372036854.775808', memberCount: '2' })
    expect(overflow).toEqual({ ok: false, errors: expect.objectContaining({ memberTotalStake: expect.any(String) }) })
  })

  it('builds exact interior review economics and honest disclosures', () => {
    const review = buildReviewViewModel(validDraft)
    expect(review.perMemberTotal).toBe('20 TEST'); expect(review.perEventAllocation).toBe('5 TEST'); expect(review.groupPool).toBe('40 TEST'); expect(review.activationFee).toBe('0.8 TEST')
    expect(review.confirmationMode).toBe('One friend'); expect(review.confirmationThreshold).toBe('1 friend confirmation beyond the claimant'); expect(review.feePayer).toBe('Host pays activation fee')
    expect(review.disclosures).toEqual(expect.arrayContaining(['Refundable stake', 'Nonrefundable activation fee', 'Network fee: unknown until a wallet is connected', 'TEST on devnet is a fixture with no real value', 'Terms are locked for review']))
    expect(review.disclosures.join(' ')).not.toMatch(/platform share|forfeit/i)
  })

  it.each([['HONOR', 'Honor system', 0], ['ONE_FRIEND', 'One friend', 1], ['MAJORITY', 'Majority', 1], ['UNANIMOUS', 'Unanimous', 1]] as const)('discloses %s mode', (mode, label, threshold) => {
    const review = buildReviewViewModel({ ...validDraft, confirmationMode: mode }); expect(review.confirmationMode).toBe(label); expect(review.confirmationThreshold).toContain(`${threshold} friend`)
  })

  it('creates serializable review params only for valid drafts', () => {
    expect(reviewNavigationParams(validDraft)).toEqual(validDraft); expect(JSON.stringify(reviewNavigationParams(validDraft))).not.toContain('bigint')
    expect(() => reviewNavigationParams({ ...validDraft, confirmationMode: 'BOGUS' as never })).toThrow()
  })

  it('keeps navigation graph and create screens fixture-only', () => {
    const params: RootStackParamList['ReviewRitual'] = validDraft
    expect(JSON.stringify(params)).not.toContain('bigint')
    const source = readFileSync('src/navigators/AppNavigator.tsx', 'utf8'); const home = readFileSync('src/screens/RitualsHomeScreen.tsx', 'utf8')
    expect(source).toContain('TemplatePicker'); expect(source).toContain('CreateRitual'); expect(source).toContain('ReviewRitual'); expect(home).not.toContain("Alert.alert('Create Ritual'")
  })
})
