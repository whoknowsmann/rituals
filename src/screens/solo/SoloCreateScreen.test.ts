import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')

describe('SoloCreateScreen transaction and commitment wiring', () => {
  it('warns before the wallet handoff and replaces copy while the wallet is open', () => {
    expect(source).toContain('walletHandoffNote(')
    expect(source).toContain('withWalletHandoff(')
  })

  it('advances from a typed promise and shows step errors on every step, not only step 3', () => {
    expect(source).toContain('applyTypedIntention(')
    const errorLines = source.match(/stepErrors\.map\(/g) ?? []
    expect(errorLines.length).toBeGreaterThanOrEqual(3)
  })

  it('does not describe solo suggestions as friend-confirmed (the group shape label says "a friend confirms")', () => {
    expect(source).not.toContain('suggestion.shape}')
    expect(source).toContain('suggestion.draft.eventCount} weeks')
  })

  it('sizes the promise from the joined Season or the picked suggestion, never suggestions[0]', () => {
    expect(source).toContain('soloEventCount(')
    expect(source).not.toContain('suggestions[0]?.draft.eventCount')
  })

  it('shows how many weeks and the total at stake before the approval', () => {
    expect(source).toContain('· ${totalStakeLabel} in all')
  })

  it('says "Lock it in" / "Locked in." (Jack, 2026-10-04)', () => {
    expect(source).toContain("'Lock it in'")
    expect(source).toContain('>Locked in.</Hero>')
  })

  it('lets the user set the length (1–16 weeks) and the weekly stake (typed or quick picks)', () => {
    expect(source).toContain('stepWeeks(weekCount, -1)')
    expect(source).toContain('stepWeeks(weekCount, 1)')
    expect(source).toContain('STAKE_PRESETS.map(')
    expect(source).toContain('accessibilityLabel="Stake each week"')
  })

  it('journals the one-approval solo create so a killed app can recover it', () => {
    expect(source).toContain('pendingActionStore: asyncStoragePendingActionStore')
  })

  it('uses the atomic solo create, fund, and activate preparation', () => {
    expect(source).toContain('prepareCreateSoloFundAndActivate')
  })

  it('shows the promise stamp only after confirmed readback and remembers the ritual', () => {
    expect(source).toContain('<Stamp kind="promise"')
    expect(source).toContain('rememberRitual(')
    expect(source).toContain('saveProofMode(')
    expect(source).toContain("navigation.navigate('SoloRitual'")
  })

  it('keeps a picked suggestion visibly selected and clears it when typing changes', () => {
    expect(source).toContain('suggestionIsSelected(')
    expect(source).toContain('accessibilityState={{ selected }}')
    expect(source).toContain("selected ? '✓ Chosen' : 'Use'")
    expect(source).toContain('setSelectedSuggestionKey(null)')
    expect(source).toContain('title: \'\', requirement: \'\'')
  })

  it('turns back navigation into a previous-step action while creating', () => {
    expect(source).toContain("navigation.addListener('beforeRemove'")
    expect(source).toContain('shouldReturnToFirstCreateStep(')
    expect(source).toContain('event.preventDefault()')
  })
})
