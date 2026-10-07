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

  it('celebrates a stamp once: confetti and the stamp animation only for a stamp made here (double pop, 2026-10-04)', () => {
    expect(source).toContain('<Confetti fire={celebrate}')
    expect(source).toContain('animate={freshStamp}')
    expect(source).not.toContain("animate={action.state.status !== 'confirmed'}")
    // A re-mounted stamp (in the gap before the next week, or on the finished ritual) stays still.
    expect(source).toContain('celebrate > 0 && model.showedUp,')
  })

  it('keeps YOU SHOWED UP! as the hero after a stamp, with its cell ✓ and one ticking line, until the next week takes over (Jack, 2026-10-07)', () => {
    const body = source.slice(source.indexOf('function renderState('))
    const kept = body.indexOf('if (keptWeek !== null) return')
    expect(kept).toBeGreaterThan(0)
    // Ahead of every card that used to replace the stamp, so those cards only ever show for an unstamped week.
    for (const later of ["if (model.state === 'waiting')", "if (model.state === 'closing')", "if (model.state === 'resolving/settle')"]) expect(kept).toBeLessThan(body.indexOf(later))
    expect(body.match(/<Stamp kind="showed-up"/g)).toHaveLength(1)
    expect(source).toContain('<WeekStrip cells={punchCardCells(model.weekCells, model.showedUp, keptWeek)}')
    expect(source).toContain('`Week ${titleWeekIndex(model, keptWeek, readyBundle.ritual.account.skipDeclared ? readyBundle.ritual.account.skipEventIndex : null) + 1}`')
    expect(source.match(/\{nextLine && <Text style=\{s\.muted\}>\{nextLine\}<\/Text>\}/g)).toHaveLength(1)
    // Last week's MISSED paper gives way to this week's stamp.
    expect(source).toContain("model.state !== 'missed' && keptWeek === null && <View style={s.paper}")
  })

  it('keeps the one declared skip available while valid, as a quiet link that names its week (Jack, 2026-10-07)', () => {
    expect(source).toContain("{model.canSkip && <ActionButton tone=\"link\" label={skip.isBusy ? 'Working…' : `Skip week ${model.eventIndex + 1}`} onPress={skip.start}")
    expect(source).not.toContain('Skip next week')
    expect(source).not.toMatch(/tone="(quiet|dark|go)"[^\n]*skip\.start/)
    // Right under the line that says when that week opens, above the bordered secondary buttons.
    const link = source.indexOf('tone="link" label={skip.isBusy')
    expect(link).toBeGreaterThan(source.indexOf('{nextLine && '))
    expect(link).toBeLessThan(source.indexOf('label={`See week '))
  })
})
