import { describe, expect, it } from 'vitest'
import { RITUAL_TEMPLATES } from './templates'
import { parseTokenAmount } from './decimal'
import { DEFAULT_RITUAL_DRAFT, validateRitualDraft, type RitualDraft } from './draftForm'
import { buildReviewViewModel } from './reviewViewModel'
import type { RootStackParamList } from '../../../navigators/AppNavigator'
import { readFileSync } from 'node:fs'

const validDraft: RitualDraft = { ...DEFAULT_RITUAL_DRAFT, title: 'Read together', requirement: 'Read ten pages', memberCount: '2', eventCount: '4', memberTotalStake: '20' }

describe('Ritual creation journey', () => {
  it('has exactly the six broad immutable templates', () => {
    expect(RITUAL_TEMPLATES.map((t) => t.category)).toEqual(['reading', 'study', 'music', 'family', 'cooking', 'movement'])
    expect(Object.isFrozen(RITUAL_TEMPLATES)).toBe(true)
    expect(() => (RITUAL_TEMPLATES as unknown as { push: () => void }).push()).toThrow()
  })

  it('parses decimal TEST amounts without floating point', () => {
    expect(parseTokenAmount('20')).toBe(20_000_000n)
    expect(parseTokenAmount('0.000001')).toBe(1n)
    expect(parseTokenAmount('18446744073709.551615')).toBe(18_446_744_073_709_551_615n)
    for (const value of ['-1', '1e2', '1.0000001', '1.2.3', '', ' 1', '18446744073709.551616']) expect(() => parseTokenAmount(value)).toThrow()
  })

  it('validates draft limits and derives confirmation defaults', () => {
    expect(DEFAULT_RITUAL_DRAFT.confirmationMode).toBe('ONE_FRIEND')
    expect(validateRitualDraft(validDraft)).toEqual({ ok: true, value: expect.objectContaining({ memberCount: 2, eventCount: 4, memberTotalStakeAtomic: 20_000_000n, additionalConfirmationThreshold: 1 }) })
    expect(validateRitualDraft({ ...validDraft, memberCount: '1' }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, eventCount: '17' }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, title: '😀'.repeat(81) }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, memberTotalStake: '20.01', eventCount: '7' }).ok).toBe(false)
  })

  it('builds the exact interior review economics and honest disclosures', () => {
    const review = buildReviewViewModel(validDraft)
    expect(review.perMemberTotal).toBe('20 TEST')
    expect(review.perEventAllocation).toBe('5 TEST')
    expect(review.groupPool).toBe('40 TEST')
    expect(review.activationFee).toBe('0.8 TEST')
    expect(review.confirmationThreshold).toBe('1 friend confirmation beyond the claimant')
    expect(review.feePayer).toBe('Host pays activation fee')
    expect(review.disclosures).toEqual(expect.arrayContaining(['Refundable stake', 'Nonrefundable activation fee', 'Network fee: unknown until a wallet is connected', 'TEST on devnet is a fixture with no real value', 'Terms are locked for review']))
    expect(review.disclosures.join(' ')).not.toMatch(/platform share|forfeit/i)
  })

  it('keeps navigation params serializable and exposes the new route graph', () => {
    const params: RootStackParamList['ReviewRitual'] = { title: 'x', requirement: 'y', memberCount: '2', eventCount: '4', memberTotalStake: '20', confirmationMode: 'ONE_FRIEND', feePayerMode: 'HOST' }
    expect(JSON.stringify(params)).not.toContain('bigint')
    const source = readFileSync('src/navigators/AppNavigator.tsx', 'utf8')
    const home = readFileSync('src/screens/RitualsHomeScreen.tsx', 'utf8')
    expect(source).toContain('TemplatePicker')
    expect(source).toContain('CreateRitual')
    expect(source).toContain('ReviewRitual')
    expect(home).not.toContain("Alert.alert('Create Ritual'")
  })
})
