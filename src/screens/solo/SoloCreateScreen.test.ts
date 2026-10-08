import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')

describe('SoloCreateScreen transaction and commitment wiring', () => {
  it('gates every balance and faucet row on the editable-state predicate', () => {
    expect(source).toContain('const showBalanceHelp = showCreateBalanceHelp(create.state)')
    const start = source.indexOf('{showBalanceHelp && <>')
    expect(start).toBeGreaterThan(0)
    const block = source.slice(start, source.indexOf('</>}', start))
    for (const text of ['You have', 'Get test tokens', 'faucetLine(faucet.result)', 'Not enough tSKR']) expect(block).toContain(text)
  })
  it('renders a short starting balance quietly without changing the words or lock gating', () => {
    expect(source).toContain('{shortOfTest && neededAtomic !== null && <Text style={styles.quiet} accessibilityLiveRegion="polite">{`Not enough tSKR: this needs ${formatAtomic(neededAtomic, 6)}${feeAtomic > 0n ? \' (stake plus the activation fee)\' : \'\'}.`}</Text>}')
    expect(source).not.toMatch(/<ErrorLine>[^\n]*Not enough tSKR/)
    expect(source).toContain("disabled={!selectedAccount || client.status !== 'ready' || season.status !== 'ready' || create.isBusy || !create.canSubmit || causeUnavailable || shortOfTest}")
    expect(source).toContain('causeUnavailable && <ErrorLine>This cause is unavailable. Try again later.</ErrorLine>')
    expect(source).toContain('confirmedAddress && readbackError && <ErrorLine>{readbackError}</ErrorLine>')
  })

  it('keeps wallet validation quiet until typing or attempting to lock, without an empty error row', () => {
    expect(source).toContain('const visiblePersonError = personTouched || triedCreate ? personError : null')
    expect(source).toContain('setPersonTouched(true)')
    expect(source).toContain('{visiblePersonError && <ErrorLine>{visiblePersonError}</ErrorLine>}')
    expect(source).toContain('setTriedCreate(true); if (stepThreeErrors.length === 0 && !causeUnavailable) create.start()')
    expect(source).not.toContain('|| stepThreeErrors.length > 0 ||')
    expect(source).not.toContain('validatePersonError(')
    expect(source).toMatch(/draft.destination === 'person' && \([\s\S]*?Needs a tSKR account; Get test tokens creates one\./)
  })
  it('labels the total stake, rounding and one weekly action concretely', () => {
    expect(source).toContain('>TOTAL STAKE</Text>')
    expect(source).toContain('placeholder="Go for a run"')
    expect(source).toContain('Locks ${formatAtomic(stakeSplit.split.lockedAtomic, 6)} after rounding.')
    expect(source).not.toContain('Splits evenly to')
  })
  it('offers the existing wallet chooser inline and refreshes balance on focus and after a faucet send', () => {
    expect(source).toContain('step === 3 && !selectedAccount && <View>')
    expect(source).toContain('<WalletChoiceButtons')
    expect(source).not.toContain('Connect your wallet to start this ritual.')
    expect(source).toContain('useFocusEffect(useCallback(() => {')
    expect(source).toContain('[client, connection, selectedAccount, balanceTick]))')
    expect(source).toContain('setTimeout(() => setBalanceTick((value) => value + 1), 4000)')
    expect(source).not.toContain("faucet.status !== 'done'")
  })
  it('hides Lock it in until connected, retaining the chooser and the exact start handler', () => {
    expect(source).toMatch(/\{!createComplete && selectedAccount && \(\s*<ActionButton label=\{create.isBusy \? 'Locking in…' : 'Lock it in'\}/)
    expect(source).toContain('onPress={() => { setTriedCreate(true); if (stepThreeErrors.length === 0 && !causeUnavailable) create.start() }}')
    expect(source).toContain('{step === 3 && !selectedAccount && <View><Text style={styles.quiet}>Set your wallet to Devnet.</Text><WalletChoiceButtons failureCopy="Connection not completed. Try again." /></View>}')
    expect(source.match(/'Lock it in'/g)).toHaveLength(1)
  })

  it('only explains the wallet handoff while the wallet is opening', () => {
    expect(source).not.toContain('walletHandoffNote(')
    expect(source).toContain('withWalletHandoff(')
  })

  it('advances from a typed promise and shows step errors on every step, not only step 3', () => {
    expect(source).toContain('applyTypedIntention(')
    const errorLines = source.match(/stepErrors\.map\(/g) ?? []
    expect(errorLines.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('stepThreeErrors.filter((error) => error !== personError)')
  })

  it('step 1 is the user’s own name + optional description, no suggestions or preset weeks (Jack, 2026-10-07)', () => {
    expect(source).not.toContain('suggestRituals(')
    expect(source).not.toContain('Suggestions')
    expect(source).toContain('accessibilityLabel="Name your ritual"')
    expect(source).toContain('accessibilityLabel="Describe what counts as showing up"')
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
    expect(source).toMatch(/selectedAccount && \(testBalance === null \|\| shortOfTest \|\| testBalance === 0n\)[^\n]*Get test tokens/)
    expect(source).toContain('testBalance < neededAtomic')
    expect(source).toContain('stepThreeErrors.filter((error) => error !== personError)')
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
    expect(source).toContain("destinationOwner: draft.destination === 'person' ? draft.personAddress : undefined")
  })

  it('keeps one nonce per Create screen, so Try again can never make a second ritual', () => {
    expect(source).toContain('if (ritualNonce.current === null) ritualNonce.current = generateRitualNonce()')
    expect(source).toContain('nonce: ritualNonce.current,')
    expect(source.match(/generateRitualNonce\(\)/g)).toHaveLength(1)
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

  it('editing the name never wipes the description the user typed', () => {
    expect(source).toContain("intention: value, title: ''")
    expect(source).not.toContain("intention: value, title: '', requirement: ''")
  })

  it('turns back navigation into a previous-step action while creating', () => {
    expect(source).toContain("navigation.addListener('beforeRemove'")
    expect(source).toContain('shouldReturnToFirstCreateStep(')
    expect(source).toContain('event.preventDefault()')
  })
})
