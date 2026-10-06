import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloRitualScreen.tsx'), 'utf8')

describe('SoloRitualScreen proof and witness controls', () => {
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
  })
})
