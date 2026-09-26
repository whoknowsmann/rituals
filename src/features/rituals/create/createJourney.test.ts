import { describe, expect, it } from 'vitest'
import { RITUAL_TEMPLATES, draftFromTemplate, templateSelectionTarget } from './templates'
import { parseTokenAmount } from './decimal'
import { DEFAULT_RITUAL_DRAFT, validateRitualDraft, type RitualDraft } from './draftForm'
import { buildReviewViewModel } from './reviewViewModel'
import { homeCreateTarget, reviewCompleteTarget, reviewNavigationParams } from './routeHelpers'
import type { RootStackParamList } from '../../../navigators/AppNavigator'
import { readFileSync } from 'node:fs'

const validDraft: RitualDraft = {
  ...DEFAULT_RITUAL_DRAFT,
  title: 'Read together',
  requirement: 'Read ten pages',
  memberCount: '2',
  eventCount: '4',
  memberTotalStake: '20',
}

describe('Ritual creation journey', () => {
  it('has exactly the six broad deeply immutable templates', () => {
    expect(RITUAL_TEMPLATES.map((t) => t.category)).toEqual([
      'reading', 'study', 'music', 'family', 'cooking', 'movement',
    ])
    expect(Object.isFrozen(RITUAL_TEMPLATES)).toBe(true)
    for (const template of RITUAL_TEMPLATES) {
      expect(Object.isFrozen(template)).toBe(true)
    }
    expect(() => (RITUAL_TEMPLATES as unknown as { push: () => void }).push()).toThrow()
  })

  it('detaches template drafts and exposes route targets', () => {
    const first = draftFromTemplate(RITUAL_TEMPLATES[0])
    first.title = 'Edited'
    const second = draftFromTemplate(RITUAL_TEMPLATES[0])

    expect(templateSelectionTarget('reading')).toEqual({
      name: 'CreateRitual',
      params: { templateCategory: 'reading' },
    })
    expect(homeCreateTarget()).toEqual({ name: 'TemplatePicker' })
    expect(reviewCompleteTarget()).toEqual({ name: 'RitualsHome' })
    expect(first.title).toBe('Edited')
    expect(second.title).toBe(RITUAL_TEMPLATES[0].title)
  })

  it('parses decimal TEST amounts without floating point', () => {
    expect(parseTokenAmount('20')).toBe(20_000_000n)
    expect(parseTokenAmount('0.000001')).toBe(1n)
    expect(parseTokenAmount('18446744073709.551615')).toBe(18_446_744_073_709_551_615n)
    for (const value of [
      '-1', '1e2', '1.0000001', '1.2.3', '', ' 1',
      '18446744073709.551616',
    ]) {
      expect(() => parseTokenAmount(value)).toThrow()
    }
  })

  it('clamps activation fees at the minimum and maximum', () => {
    expect(buildReviewViewModel({
      ...validDraft,
      memberTotalStake: '10',
    }).activationFee).toBe('0.5 TEST')
    expect(buildReviewViewModel({
      ...validDraft,
      memberTotalStake: '200',
    }).activationFee).toBe('5 TEST')
  })

  it('floors fractional atomic-unit activation fees', () => {
    expect(buildReviewViewModel({
      ...validDraft,
      eventCount: '2',
      memberTotalStake: '20.000002',
    }).activationFee).toBe('0.8 TEST')
  })

  it('validates Unicode and numeric boundaries without throwing', () => {
    for (const title of ['😀'.repeat(80), 'a'.repeat(80)]) {
      expect(validateRitualDraft({ ...validDraft, title }).ok).toBe(true)
    }
    expect(validateRitualDraft({ ...validDraft, title: '😀'.repeat(81) }).ok).toBe(false)
    expect(validateRitualDraft({ ...validDraft, requirement: 'a'.repeat(280) }).ok).toBe(true)
    expect(validateRitualDraft({ ...validDraft, requirement: 'a'.repeat(281) }).ok).toBe(false)
    for (const value of ['2', '6']) {
      expect(validateRitualDraft({ ...validDraft, memberCount: value }).ok).toBe(true)
    }
    for (const value of ['1', '7', '2.5', '-2', '+2', ' 2', '2 ']) {
      expect(validateRitualDraft({ ...validDraft, memberCount: value }).ok).toBe(false)
    }
    for (const value of ['1', '16']) {
      expect(validateRitualDraft({ ...validDraft, eventCount: value }).ok).toBe(true)
    }
    for (const value of ['0', '17', '1.5', '-1', '+1', ' 1', '1 ']) {
      expect(validateRitualDraft({ ...validDraft, eventCount: value }).ok).toBe(false)
    }
  })

  it('validates stake, divisibility, and group overflow as safe field errors', () => {
    for (const value of [
      '0', '-1', '1e2', '1.0000001', '1.2.3', '', ' 1',
      '18446744073709.551616',
    ]) {
      expect(validateRitualDraft({ ...validDraft, memberTotalStake: value }).ok).toBe(false)
    }
    expect(validateRitualDraft({ ...validDraft, memberTotalStake: '0.000001', eventCount: '1' }).ok).toBe(true)
    expect(validateRitualDraft({ ...validDraft, memberTotalStake: '20.000001', eventCount: '4' }).ok).toBe(false)
    const overflow = validateRitualDraft({
      ...validDraft,
      memberTotalStake: '9223372036854.775808',
      memberCount: '2',
    })
    expect(overflow).toEqual({
      ok: false,
      errors: expect.objectContaining({ memberTotalStake: expect.any(String) }),
    })
  })

  it('builds exact interior review economics and honest disclosures', () => {
    const review = buildReviewViewModel(validDraft)
    expect(review.perMemberTotal).toBe('20 TEST')
    expect(review.perEventAllocation).toBe('5 TEST')
    expect(review.groupPool).toBe('40 TEST')
    expect(review.activationFee).toBe('0.8 TEST')
    expect(review.confirmationMode).toBe('One friend')
    expect(review.confirmationThreshold).toBe('1 friend confirmation beyond the claimant')
    expect(review.feePayer).toBe('Host pays activation fee')
    expect(review.disclosures).toEqual(expect.arrayContaining([
      'Stake remains refundable before activation; after activation each event allocation follows completion/settlement rules.',
      'Activation fee is nonrefundable.',
      'Creating the ritual costs about 0.01 devnet SOL in network fees and rent.',
      'TEST is a devnet token with no real value.',
      'Nothing is signed or locked until you create the ritual from the funding lobby.',
    ]))
    expect(review.disclosures.join(' ')).not.toMatch(/platform share|forfeit/i)
  })

  it.each([
    ['HONOR', 'Honor system', 'No friend confirmation required'],
    ['ONE_FRIEND', 'One friend', '1 friend confirmation beyond the claimant'],
    ['MAJORITY', 'Majority', '2 friend confirmations beyond the claimant'],
    ['UNANIMOUS', 'Unanimous', '3 friend confirmations beyond the claimant'],
  ] as const)('discloses %s mode and threshold for four members', (mode, label, threshold) => {
    const review = buildReviewViewModel({ ...validDraft, memberCount: '4', confirmationMode: mode })
    expect(review.confirmationMode).toBe(label)
    expect(review.confirmationThreshold).toBe(threshold)
  })

  it('discloses split activation fee payer', () => {
    expect(buildReviewViewModel({ ...validDraft, feePayerMode: 'SPLIT' }).feePayer)
      .toContain('Activation fee split deterministically across members')
  })

  it('creates serializable review params only for valid drafts', () => {
    expect(reviewNavigationParams(validDraft)).toEqual(validDraft)
    expect(JSON.stringify(reviewNavigationParams(validDraft))).not.toContain('bigint')
    expect(() => reviewNavigationParams({ ...validDraft, confirmationMode: 'BOGUS' as never })).toThrow()
  })

  it('keeps the navigation graph coherent and create screens honest', () => {
    const params: RootStackParamList['ReviewRitual'] = validDraft
    expect(JSON.stringify(params)).not.toContain('bigint')
    const source = readFileSync('src/navigators/AppNavigator.tsx', 'utf8')
    const home = readFileSync('src/screens/RitualsHomeScreen.tsx', 'utf8')
    const templatePicker = readFileSync('src/screens/TemplatePickerScreen.tsx', 'utf8')
    const create = readFileSync('src/screens/CreateRitualScreen.tsx', 'utf8')
    const review = readFileSync('src/screens/ReviewRitualScreen.tsx', 'utf8')

    expect(source).toContain('TemplatePicker')
    expect(source).toContain('CreateRitual')
    expect(source).toContain('ReviewRitual')
    expect(home).toContain('import { homeCreateTarget }')
    expect(home).toContain('navigation.navigate(homeCreateTarget().name)')
    expect(templatePicker).toContain('templateSelectionTarget')
    expect(templatePicker).toContain('navigation.navigate(target.name, target.params)')
    expect(create).toContain('draftFromTemplate')
    expect(create).toContain('<TextInput')
    for (const mode of ['HONOR', 'ONE_FRIEND', 'MAJORITY', 'UNANIMOUS']) expect(create).toContain(`value: '${mode}'`)
    for (const mode of ['HOST', 'SPLIT']) expect(create).toContain(`value: '${mode}'`)
    expect(create).toContain('reviewNavigationParams')
    expect(create).toContain("navigation.navigate('ReviewRitual'")
    expect(review).toContain('Mode')
    expect(review).toContain('Threshold')
    expect(review).toContain('reviewCompleteTarget')
    expect(review).toContain('Add member wallets')
    expect(review).toContain("navigation.navigate('RitualRoster'")
    const roster = readFileSync('src/screens/RitualRosterScreen.tsx', 'utf8')
    const lobby = readFileSync('src/screens/RitualFundingLobbyScreen.tsx', 'utf8')
    expect(roster).toContain('WalletChoiceButtons')
    expect(roster).toContain('Wallet connection was not completed. Try again.')
    expect(roster).toContain('reconcileRosterContext')
    expect(roster).toContain('if (pendingContext.requiresReentry)')
    expect(roster).toContain('No transaction can be prepared or submitted')
    // The lobby is the first screen that submits a real transaction.
    expect(lobby).toContain('useCreateRitual')
    expect(lobby).toContain('buildCreateRitualDeps')
    expect(lobby).toContain('Create ritual')
    // Create is bundled with the host's own funding (feat/fewer-signatures), so
    // the lobby must not offer a second, separate host "Fund your stake" step.
    expect(lobby).toContain('creatorTokenAccount')
    expect(lobby).not.toContain('Fund your stake')
    // Demo cadence acceleration must stay disclosed, never silent.
    expect(lobby).toContain('describeCadence')
    // Devnet/no-real-value disclosure must survive.
    expect(lobby).toContain('no real value')
    // Crew rules (DESIGN.md): people not addresses up front, red only for
    // failures, no duplicated screen title, no narration under it.
    expect(lobby).toContain('MemberTile')
    expect(lobby).not.toContain('Everyone reviews the same terms before any onchain funding.')
    expect(lobby).not.toMatch(/locked:\s*\{[^}]*error/)
    expect(lobby).not.toContain('>Funding lobby</Text>')
    expect(create).toContain('Review terms')
    expect(review).toContain('Ritual terms preview')
    expect(review).toContain('This is a preview. Go back to edit any term before creating it.')
    expect(review).toContain('Nothing is signed yet')
    for (const stale of ['cannot be changed after review', 'Review locked', 'Locked ritual', 'Terms are locked for review']) {
      expect(create).not.toContain(stale)
      expect(review).not.toContain(stale)
    }
    expect(create).not.toMatch(/<View[^>]*\baccessible\b[^>]*>[\s\S]*<SegmentedButtons/)
    expect(review).toContain('accessibilityRole="header"')
    expect(home).not.toContain("Alert.alert('Create Ritual'")
    expect(home).toContain('useRitualClient')
    expect(home).toContain('loadKnownRitualBundles')
    expect(home).toContain('AUTHORITATIVE CHAIN READS')
    expect(home).not.toMatch(/sendTransaction|transact\s*\(|new\s+Connection|MWA|mobile-wallet/i)
    for (const screen of [templatePicker, create, review]) {
      expect(screen).not.toMatch(/sendTransaction|transact\s*\(|Connection|MWA|mobile-wallet|rpc/i)
      expect(screen).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    }
  })
})
