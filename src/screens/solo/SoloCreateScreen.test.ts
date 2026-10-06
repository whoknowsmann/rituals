import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')

describe('SoloCreateScreen transaction and commitment wiring', () => {
  it('only explains the wallet handoff while the wallet is opening', () => {
    expect(source).not.toContain('walletHandoffNote(')
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

  it('keeps one schedule summary and a visible choice of where missed weeks go, with validation and low-balance help intact', () => {
    expect(source.match(/\{scheduleLine\}/g)).toHaveLength(1)
    expect(source).toContain('IF YOU MISS A WEEK, IT GOES TO')
    expect(source).toContain('causeTokenAccount: selectedCause.tokenAccount')
    expect(source).not.toContain('Missed weeks go to')
    for (const removed of ['YOUR RITUAL', 'LOCKED BEFORE YOU START', 'If I miss, it goes to', 'One declared skip', 'formatSol(', 'styles.promiseCard']) expect(source).not.toContain(removed)
    expect(source).toMatch(/testBalance !== null && \(shortOfTest \|\| testBalance === 0n\) && <Text[^\n]*You have/)
    expect(source).toMatch(/testBalance !== null && \(shortOfTest \|\| testBalance === 0n\)[^\n]*Get test tokens/)
    expect(source).toContain('testBalance < neededAtomic')
    expect(source).toContain('stepThreeErrors.filter((error) => !stepErrors.includes(error))')
    expect(source).toContain('causeUnavailable && <ErrorLine>')
    expect(source).toContain('Not enough tSKR: this needs')
  })

  it('keeps "Lock it in" but drops the separate "Locked in." stop', () => {
    expect(source).toContain("'Lock it in'")
    expect(source).not.toContain('>Locked in.</Hero>')
    expect(source).not.toContain('See your ritual')
  })

  it('lets the user set the length (1–16 weeks) and ONE total stake, split across the weeks (typed or quick picks)', () => {
    expect(source).toContain('stepWeeks(weekCount, -1)')
    expect(source).toContain('stepWeeks(weekCount, 1)')
    expect(source).toContain('STAKE_PRESETS.map(')
    expect(source).toContain('accessibilityLabel="Total stake"')
    expect(source).toContain('splitTotalStake(stakeTotal, weekCount)')
    expect(source).not.toContain('STAKE EACH WEEK')
  })

  it('journals the one-approval solo create so a killed app can recover it', () => {
    expect(source).toContain('pendingActionStore: asyncStoragePendingActionStore')
  })

  it('uses the atomic solo create, fund, and activate preparation', () => {
    expect(source).toContain('prepareCreateSoloFundAndActivate')
  })

  it('replaces create only after confirmed readback and remembers the ritual', () => {
    expect(source).toContain('if (!createComplete || !confirmedReadback || !confirmedAddress || openedRitual.current) return')
    expect(source).toContain('rememberRitual(')
    expect(source).toContain('saveProofMode(')
    expect(source).toContain("navigation.replace('SoloRitual', { ritualId: confirmedAddress })")
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
