import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloRitualScreen.tsx'), 'utf8')

describe('SoloRitualScreen proof and witness controls', () => {
  it('keeps finished copy to the per-week amount and missed consequence', () => {
    expect(source).toContain('label="Stake per week"')
    expect(source).toContain('{amountLabel} went to {model.destinationLabel}.')
    expect(source).toContain('note="That\'s a week, not a verdict."')
    expect(source).toContain("model.demoSpeedNotice && model.state !== 'completed'")
    expect(source).not.toContain('Every week is settled.')
    expect(source).not.toContain("received that week's stake")
    expect(source).toContain('useSoloDestinationOwner(')
  })
  it('puts the chain-derived stamp countdown beside HOLD TO STAMP', () => {
    expect(source).toContain('const chainNow = useChainTime(connection, focused)')
    expect(source).toContain('soloRitualModel(state.bundle, chainNow,')
    expect(source).toMatch(/holdVisible && <View[^\n]*model.stampTimeLeftLabel[^\n]*label="HOLD TO STAMP"/)
    expect(source).not.toContain('Date.now(')
  })
  it('guards remove taps, handles failure, and clears removed routes from recents', () => {
    expect(source).toContain('if (removalOpen.current || removalSaving.current) return')
    expect(source).toContain("navigation.reset({ index: 0, routes: [{ name: 'RitualsHome' }] })")
    expect(source).toContain('Could not remove it from this phone. Try again.')
  })
  it('loads and saves per-week notes around a confirmed claim', () => {
    expect(source).toContain('readSoloNotes(')
    expect(source).toContain('saveWeekNote(')
    expect(source).toContain('A line about this week (optional)')
    expect(source).toContain('maxLength={280}')
  })

  it('shows the saved note with the handwriting face after showing up', () => {
    expect(source).toContain('fontFamily: fonts.hand')
    expect(source).toContain('weekNote')
  })

  it('shares the exact witness handoff and offers copying the ritual address', () => {
    expect(source).toContain('Share.share({ message: witnessShareMessage(')
    expect(source).toContain('Send to your witness')
    expect(source).toContain('Clipboard.setStringAsync(shareAddress)')
    expect(source).toContain('readyBundle.ritual.account.creator.equals(selectedAccount.publicKey)')
  })

  it('tracks each action separately and never saves an empty note over a real one (note wiped at settle, 2026-10-02)', () => {
    expect(source).not.toContain('confirmedAction')
    expect(source).toContain('handled.current.claim !== claim.state.result.messageDigest')
    expect(source).toContain('handled.current.settle !== settle.state.result.messageDigest')
    expect(source).toContain('noteInputRef.current.trim().length > 0')
  })

  it('clears a stale action error once the chain state moves on (dead Settle, 2026-10-02)', () => {
    expect(source).toContain('soloActionLanded(read, actionTargets.current[name])')
    expect(source).toContain('action.observeReadback(route.params.ritualId)')
    expect(source).toContain('[read, claim.state, skip.state, settle.state, route.params.ritualId]')
  })

  it('closes finished weeks with the app settle key, keeping the wallet button only as a fallback', () => {
    expect(source).toContain('autoSettleWeek({ client: settlerClient')
    expect(source).toContain("model.state === 'resolving/settle' && !settlingByItself && <ActionButton")
    expect(source).toContain('settlerCanPay(settlerBalance, model.needsEventInit)')
  })

  it('names the week a skip applies to and never calls a skipped week missed (skip run, 2026-10-07)', () => {
    expect(source).toContain('`Skip week ${model.eventIndex + 1}`')
    expect(source).not.toContain('Skip next week')
    expect(source).toContain('!model.showedUp && !model.weekSkipped && <Stamp kind="missed"')
    expect(source).toContain("model.showedUp || model.weekSkipped ? 'Your stake comes back to you.'")
  })

  it('celebrates a stamp once: confetti and the stamp animation only for a stamp made here (double pop, 2026-10-04)', () => {
    expect(source).toContain('<Confetti fire={celebrate}')
    expect(source).toContain('animate={freshStamp}')
    expect(source).not.toContain("animate={action.state.status !== 'confirmed'}")
  })
})
